begin;

create or replace function public.reconcile_existing_cash_purchase_order_payment(authoritative_payload jsonb)
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
  if authoritative_payload is null or jsonb_typeof(authoritative_payload) <> 'object' then raise exception 'PO_CASH_RECONCILIATION_PAYLOAD_INVALID'; end if;
  begin
    v_po := nullif(authoritative_payload->>'purchase_order_id', '')::uuid;
    v_cash := nullif(authoritative_payload->>'cash_transaction_id', '')::uuid;
    v_operator := nullif(authoritative_payload->>'operator_id', '')::uuid;
    v_key := nullif(trim(authoritative_payload->>'idempotency_key'), '');
    v_note := nullif(trim(authoritative_payload->>'source_note'), '');
    v_supplier_payment := nullif(authoritative_payload->>'supplier_payment_minor_units', '')::bigint;
    v_transfer_fee := nullif(authoritative_payload->>'transfer_fee_minor_units', '')::bigint;
  exception when others then raise exception 'PO_CASH_RECONCILIATION_PAYLOAD_INVALID'; end;
  if v_po is null or v_cash is null or v_operator is null or v_key is null or v_note is null or v_supplier_payment is null or v_supplier_payment <= 0 or v_transfer_fee is null or v_transfer_fee < 0 then raise exception 'PO_CASH_RECONCILIATION_PAYLOAD_INVALID'; end if;
  if not exists (select 1 from public.vault_operators operator_row where operator_row.id = v_operator and operator_row.is_active) then raise exception 'An active operator is required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_cash::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_po::text || ':' || v_key, 0));
  select * into v_existing from public.vault_purchase_order_cash_payment_reconciliations reconciliation
  where reconciliation.purchase_order_id = v_po and reconciliation.idempotency_key = v_key for update;
  if found then
    if v_existing.cash_transaction_id <> v_cash or v_existing.supplier_payment_minor_units <> v_supplier_payment or v_existing.transfer_fee_minor_units <> v_transfer_fee or v_existing.reconciled_by_operator_id <> v_operator or v_existing.source_note <> v_note then raise exception 'PO_CASH_RECONCILIATION_IDEMPOTENCY_CONFLICT'; end if;
    select (-round(cash.amount_gbp * 100))::bigint into v_cash_debit from public.vault_cash_transactions cash where cash.id = v_cash;
    return query select v_existing.id, v_existing.purchase_order_id, v_existing.cash_transaction_id, v_existing.supplier_payment_minor_units, v_existing.transfer_fee_minor_units, v_cash_debit, true;
    return;
  end if;

  select * into v_governed from public.vault_purchase_order_governed_liability liability where liability.purchase_order_id = v_po;
  if not found or v_governed.liability_evidence_state <> 'available' or v_governed.liability_source <> 'governed_gbp_landed_cost_allocation' or v_governed.selected_gbp_minor_units is null or v_governed.selected_gbp_minor_units <= 0 or v_governed.governed_gbp_allocation_run_id is null then raise exception 'PO_GOVERNED_SETTLEMENT_AUTHORITY_UNAVAILABLE'; end if;
  v_run := v_governed.governed_gbp_allocation_run_id;

  select * into v_cash_row from public.vault_cash_transactions cash where cash.id = v_cash for update;
  if not found then raise exception 'PO_CASH_RECONCILIATION_CASH_TRANSACTION_NOT_FOUND'; end if;
  select * into v_account from public.vault_cash_accounts account where account.id = v_cash_row.account_id for share;
  if not found or v_account.account_type <> 'business' or not v_account.is_active or v_account.currency <> 'GBP' then raise exception 'PO_CASH_RECONCILIATION_CASH_ACCOUNT_INVALID'; end if;
  if v_cash_row.amount_gbp >= 0 or v_cash_row.transaction_type <> 'supplier_payment' or v_cash_row.category <> 'Stock purchase' or (v_cash_row.supplier_id is not null and v_cash_row.supplier_id <> (select po.supplier_id from public.vault_purchase_orders po where po.id = v_po)) then raise exception 'PO_CASH_RECONCILIATION_CASH_TRANSACTION_INVALID'; end if;
  v_cash_debit := (-round(v_cash_row.amount_gbp * 100))::bigint;
  if v_supplier_payment + v_transfer_fee <> v_cash_debit then raise exception 'PO_CASH_RECONCILIATION_COMPONENTS_DO_NOT_CONSERVE_CASH_DEBIT'; end if;
  if exists (select 1 from public.vault_purchase_order_cash_payment_reconciliations reconciliation where reconciliation.cash_transaction_id = v_cash) then raise exception 'PO_CASH_RECONCILIATION_CASH_TRANSACTION_ALREADY_RECONCILED'; end if;
  select coalesce(sum(reconciliation.supplier_payment_minor_units), 0) into v_prior_supplier_paid from public.vault_purchase_order_cash_payment_reconciliations reconciliation where reconciliation.purchase_order_id = v_po;
  if v_prior_supplier_paid + v_supplier_payment > v_governed.selected_gbp_minor_units then raise exception 'PO_CASH_RECONCILIATION_SUPPLIER_PAYMENT_EXCEEDS_GOVERNED_LIABILITY'; end if;

  insert into public.vault_purchase_order_cash_payment_reconciliations(purchase_order_id, cash_transaction_id, supplier_payment_minor_units, transfer_fee_minor_units, currency, governed_gbp_allocation_run_id, reconciled_by_operator_id, idempotency_key, source_note)
  values (v_po, v_cash, v_supplier_payment, v_transfer_fee, 'GBP', v_run, v_operator, v_key, v_note)
  returning id into reconciliation_id;
  return query select reconciliation_id, v_po, v_cash, v_supplier_payment, v_transfer_fee, v_cash_debit, false;
end;
$$;

commit;
