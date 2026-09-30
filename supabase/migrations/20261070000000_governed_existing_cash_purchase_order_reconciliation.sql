begin;

-- A cash movement can be split into supplier settlement and transfer fee
-- without mutating the original ledger entry or manufacturing another debit.
create table public.vault_purchase_order_cash_payment_reconciliations (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.vault_purchase_orders(id) on delete restrict,
  cash_transaction_id uuid not null references public.vault_cash_transactions(id) on delete restrict,
  supplier_payment_minor_units bigint not null check (supplier_payment_minor_units > 0),
  transfer_fee_minor_units bigint not null check (transfer_fee_minor_units >= 0),
  currency text not null check (currency = 'GBP'),
  governed_gbp_allocation_run_id uuid not null references public.vault_purchase_order_gbp_landed_cost_allocation_runs(id) on delete restrict,
  reconciled_by_operator_id uuid not null references public.vault_operators(id) on delete restrict,
  reconciled_at timestamptz not null default clock_timestamp(),
  idempotency_key text not null check (nullif(trim(idempotency_key), '') is not null),
  source_note text not null check (nullif(trim(source_note), '') is not null),
  created_at timestamptz not null default clock_timestamp(),
  unique (cash_transaction_id),
  unique (purchase_order_id, idempotency_key),
  check (supplier_payment_minor_units + transfer_fee_minor_units > 0)
);

create index vault_purchase_order_cash_payment_reconciliations_po_idx
  on public.vault_purchase_order_cash_payment_reconciliations(purchase_order_id);

alter table public.vault_purchase_order_cash_payment_reconciliations enable row level security;
revoke all on public.vault_purchase_order_cash_payment_reconciliations from public, anon, authenticated, service_role;
grant select, insert on public.vault_purchase_order_cash_payment_reconciliations to service_role;

create function public.reject_purchase_order_cash_payment_reconciliation_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Purchase-order cash-payment reconciliation evidence is append-only';
end;
$$;

create trigger purchase_order_cash_payment_reconciliations_immutable
before update or delete on public.vault_purchase_order_cash_payment_reconciliations
for each row execute function public.reject_purchase_order_cash_payment_reconciliation_mutation();

create function public.reconcile_existing_cash_purchase_order_payment(authoritative_payload jsonb)
returns table (
  reconciliation_id uuid,
  purchase_order_id uuid,
  cash_transaction_id uuid,
  supplier_payment_minor_units bigint,
  transfer_fee_minor_units bigint,
  cash_debit_minor_units bigint,
  idempotent boolean
)
language plpgsql security invoker set search_path = '' as $$
declare
  v_po uuid;
  v_cash uuid;
  v_operator uuid;
  v_key text;
  v_note text;
  v_supplier_payment bigint;
  v_transfer_fee bigint;
  v_run uuid;
  v_governed record;
  v_cash_row public.vault_cash_transactions%rowtype;
  v_account public.vault_cash_accounts%rowtype;
  v_existing public.vault_purchase_order_cash_payment_reconciliations%rowtype;
  v_prior_supplier_paid bigint;
  v_cash_debit bigint;
begin
  if authoritative_payload is null or jsonb_typeof(authoritative_payload) <> 'object' then
    raise exception 'PO_CASH_RECONCILIATION_PAYLOAD_INVALID';
  end if;
  begin
    v_po := nullif(authoritative_payload->>'purchase_order_id', '')::uuid;
    v_cash := nullif(authoritative_payload->>'cash_transaction_id', '')::uuid;
    v_operator := nullif(authoritative_payload->>'operator_id', '')::uuid;
    v_key := nullif(trim(authoritative_payload->>'idempotency_key'), '');
    v_note := nullif(trim(authoritative_payload->>'source_note'), '');
    v_supplier_payment := nullif(authoritative_payload->>'supplier_payment_minor_units', '')::bigint;
    v_transfer_fee := nullif(authoritative_payload->>'transfer_fee_minor_units', '')::bigint;
  exception when others then
    raise exception 'PO_CASH_RECONCILIATION_PAYLOAD_INVALID';
  end;
  if v_po is null or v_cash is null or v_operator is null or v_key is null or v_note is null
    or v_supplier_payment is null or v_supplier_payment <= 0
    or v_transfer_fee is null or v_transfer_fee < 0 then
    raise exception 'PO_CASH_RECONCILIATION_PAYLOAD_INVALID';
  end if;
  if not exists (select 1 from public.vault_operators where id = v_operator and is_active) then
    raise exception 'An active operator is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_cash::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_po::text || ':' || v_key, 0));
  select * into v_existing
  from public.vault_purchase_order_cash_payment_reconciliations
  where purchase_order_id = v_po and idempotency_key = v_key for update;
  if found then
    if v_existing.cash_transaction_id <> v_cash
      or v_existing.supplier_payment_minor_units <> v_supplier_payment
      or v_existing.transfer_fee_minor_units <> v_transfer_fee
      or v_existing.reconciled_by_operator_id <> v_operator
      or v_existing.source_note <> v_note then
      raise exception 'PO_CASH_RECONCILIATION_IDEMPOTENCY_CONFLICT';
    end if;
    select (-round(amount_gbp * 100))::bigint into v_cash_debit
    from public.vault_cash_transactions where id = v_cash;
    return query select v_existing.id, v_existing.purchase_order_id, v_existing.cash_transaction_id,
      v_existing.supplier_payment_minor_units, v_existing.transfer_fee_minor_units, v_cash_debit, true;
    return;
  end if;

  select * into v_governed from public.vault_purchase_order_governed_liability where purchase_order_id = v_po;
  if not found or v_governed.liability_evidence_state <> 'available'
    or v_governed.liability_source <> 'governed_gbp_landed_cost_allocation'
    or v_governed.selected_gbp_minor_units is null or v_governed.selected_gbp_minor_units <= 0
    or v_governed.governed_gbp_allocation_run_id is null then
    raise exception 'PO_GOVERNED_SETTLEMENT_AUTHORITY_UNAVAILABLE';
  end if;
  v_run := v_governed.governed_gbp_allocation_run_id;

  select * into v_cash_row from public.vault_cash_transactions where id = v_cash for update;
  if not found then raise exception 'PO_CASH_RECONCILIATION_CASH_TRANSACTION_NOT_FOUND'; end if;
  select * into v_account from public.vault_cash_accounts where id = v_cash_row.account_id for share;
  if not found or v_account.account_type <> 'business' or not v_account.is_active or v_account.currency <> 'GBP' then
    raise exception 'PO_CASH_RECONCILIATION_CASH_ACCOUNT_INVALID';
  end if;
  if v_cash_row.amount_gbp >= 0 or v_cash_row.transaction_type <> 'supplier_payment'
    or v_cash_row.category <> 'Stock purchase'
    or (v_cash_row.supplier_id is not null and v_cash_row.supplier_id <> (select supplier_id from public.vault_purchase_orders where id = v_po)) then
    raise exception 'PO_CASH_RECONCILIATION_CASH_TRANSACTION_INVALID';
  end if;
  v_cash_debit := (-round(v_cash_row.amount_gbp * 100))::bigint;
  if v_supplier_payment + v_transfer_fee <> v_cash_debit then
    raise exception 'PO_CASH_RECONCILIATION_COMPONENTS_DO_NOT_CONSERVE_CASH_DEBIT';
  end if;
  if exists (select 1 from public.vault_purchase_order_cash_payment_reconciliations where cash_transaction_id = v_cash) then
    raise exception 'PO_CASH_RECONCILIATION_CASH_TRANSACTION_ALREADY_RECONCILED';
  end if;
  select coalesce(sum(supplier_payment_minor_units), 0) into v_prior_supplier_paid
  from public.vault_purchase_order_cash_payment_reconciliations where purchase_order_id = v_po;
  if v_prior_supplier_paid + v_supplier_payment > v_governed.selected_gbp_minor_units then
    raise exception 'PO_CASH_RECONCILIATION_SUPPLIER_PAYMENT_EXCEEDS_GOVERNED_LIABILITY';
  end if;

  insert into public.vault_purchase_order_cash_payment_reconciliations(
    purchase_order_id, cash_transaction_id, supplier_payment_minor_units, transfer_fee_minor_units,
    currency, governed_gbp_allocation_run_id, reconciled_by_operator_id, idempotency_key, source_note
  ) values (
    v_po, v_cash, v_supplier_payment, v_transfer_fee, 'GBP', v_run, v_operator, v_key, v_note
  ) returning id into reconciliation_id;
  return query select reconciliation_id, v_po, v_cash, v_supplier_payment, v_transfer_fee, v_cash_debit, false;
end;
$$;

create view public.vault_purchase_order_governed_reconciled_payment_state
with (security_invoker = true) as
select
  po.id as purchase_order_id,
  liability.selected_gbp_minor_units as supplier_liability_minor_units,
  coalesce(sum(reconciliation.supplier_payment_minor_units), 0)::bigint as supplier_paid_minor_units,
  greatest(liability.selected_gbp_minor_units - coalesce(sum(reconciliation.supplier_payment_minor_units), 0), 0)::bigint as supplier_balance_minor_units,
  coalesce(sum(reconciliation.transfer_fee_minor_units), 0)::bigint as transfer_fee_minor_units,
  coalesce(sum(reconciliation.supplier_payment_minor_units + reconciliation.transfer_fee_minor_units), 0)::bigint as cash_debit_minor_units,
  liability.governed_gbp_allocation_run_id
from public.vault_purchase_orders po
join public.vault_purchase_order_governed_liability liability on liability.purchase_order_id = po.id
left join public.vault_purchase_order_cash_payment_reconciliations reconciliation
  on reconciliation.purchase_order_id = po.id
  and reconciliation.governed_gbp_allocation_run_id = liability.governed_gbp_allocation_run_id
where liability.liability_evidence_state = 'available'
  and liability.liability_source = 'governed_gbp_landed_cost_allocation'
  and liability.selected_gbp_minor_units > 0
  and liability.governed_gbp_allocation_run_id is not null
group by po.id, liability.selected_gbp_minor_units, liability.governed_gbp_allocation_run_id;

revoke all on function public.reject_purchase_order_cash_payment_reconciliation_mutation(), public.reconcile_existing_cash_purchase_order_payment(jsonb) from public, anon, authenticated;
grant execute on function public.reconcile_existing_cash_purchase_order_payment(jsonb) to service_role;
revoke all on public.vault_purchase_order_governed_reconciled_payment_state from public, anon, authenticated;
grant select on public.vault_purchase_order_governed_reconciled_payment_state to service_role;

notify pgrst, 'reload schema';
commit;
