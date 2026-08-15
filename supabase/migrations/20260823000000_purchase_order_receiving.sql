create table if not exists public.vault_purchase_order_receipts (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.vault_purchase_orders(id) on delete restrict,
  received_date date not null,
  created_by_operator_id uuid not null references public.vault_operators(id) on delete restrict,
  idempotency_key text not null check (length(trim(idempotency_key)) > 0),
  created_at timestamptz not null default now(),
  unique (purchase_order_id, idempotency_key)
);

create table if not exists public.vault_purchase_order_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.vault_purchase_order_receipts(id) on delete restrict,
  purchase_order_line_id uuid not null references public.vault_purchase_order_lines(id) on delete restrict,
  quantity_received integer not null check (quantity_received > 0),
  discrepancy_note text null check (discrepancy_note is null or length(trim(discrepancy_note)) > 0),
  created_at timestamptz not null default now(),
  unique (receipt_id, purchase_order_line_id)
);

create index if not exists vault_purchase_order_receipts_order_idx
on public.vault_purchase_order_receipts(purchase_order_id, received_date, created_at);

create index if not exists vault_purchase_order_receipt_lines_po_line_idx
on public.vault_purchase_order_receipt_lines(purchase_order_line_id);

alter table public.vault_purchase_order_receipts enable row level security;
alter table public.vault_purchase_order_receipt_lines enable row level security;
revoke all on public.vault_purchase_order_receipts from anon, authenticated;
revoke all on public.vault_purchase_order_receipt_lines from anon, authenticated;

create or replace function public.prevent_vault_purchase_order_receipt_mutation()
returns trigger language plpgsql security invoker set search_path = ''
as $function$
begin
  raise exception 'Purchase-order receipt evidence is append-only';
end;
$function$;

revoke all on function public.prevent_vault_purchase_order_receipt_mutation()
from public, anon, authenticated;

drop trigger if exists vault_purchase_order_receipts_append_only
on public.vault_purchase_order_receipts;
create trigger vault_purchase_order_receipts_append_only
before update or delete on public.vault_purchase_order_receipts
for each row execute function public.prevent_vault_purchase_order_receipt_mutation();

drop trigger if exists vault_purchase_order_receipt_lines_append_only
on public.vault_purchase_order_receipt_lines;
create trigger vault_purchase_order_receipt_lines_append_only
before update or delete on public.vault_purchase_order_receipt_lines
for each row execute function public.prevent_vault_purchase_order_receipt_mutation();

create or replace function public.record_vault_purchase_order_receipt(
  target_purchase_order_id uuid,
  target_operator_id uuid,
  target_received_date date,
  target_idempotency_key text,
  target_lines jsonb
)
returns table (
  receipt_id uuid,
  purchase_order_id uuid,
  status text,
  received_at timestamptz,
  fully_received boolean,
  transitioned boolean
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  purchase_order public.vault_purchase_orders%rowtype;
  existing_receipt public.vault_purchase_order_receipts%rowtype;
  new_receipt_id uuid;
  receipt_created_at timestamptz;
  line_input jsonb;
  target_line_id uuid;
  target_quantity integer;
  target_note text;
  ordered_quantity integer;
  already_received integer;
  all_received boolean;
  next_received_at timestamptz;
begin
  if target_received_date is null then raise exception 'Received date is required'; end if;
  if target_idempotency_key is null or length(trim(target_idempotency_key)) = 0 then
    raise exception 'Receipt idempotency key is required';
  end if;
  if target_lines is null or jsonb_typeof(target_lines) <> 'array' or jsonb_array_length(target_lines) = 0 then
    raise exception 'At least one received purchase-order line is required';
  end if;
  if not exists (
    select 1 from public.vault_operators operator
    where operator.id = target_operator_id and operator.is_active
  ) then raise exception 'An active operator is required'; end if;

  select * into purchase_order
  from public.vault_purchase_orders po
  where po.id = target_purchase_order_id
  for update;
  if not found then raise exception 'Purchase order was not found'; end if;

  select * into existing_receipt
  from public.vault_purchase_order_receipts receipt
  where receipt.purchase_order_id = target_purchase_order_id
    and receipt.idempotency_key = target_idempotency_key;
  if found then
    return query select existing_receipt.id, purchase_order.id, purchase_order.status,
      purchase_order.received_at, purchase_order.status = 'received', false;
    return;
  end if;

  if purchase_order.status not in ('ordered', 'part_paid', 'paid', 'shipped') then
    raise exception 'Purchase order cannot be received from status %', purchase_order.status;
  end if;

  if exists (
    select 1 from jsonb_array_elements(target_lines) supplied
    where jsonb_typeof(supplied) <> 'object'
      or not (supplied ? 'purchase_order_line_id')
      or not (supplied ? 'quantity_received')
  ) then raise exception 'Every receipt line requires a PO line and quantity'; end if;

  if (select count(*) from jsonb_array_elements(target_lines)) <>
     (select count(distinct supplied->>'purchase_order_line_id') from jsonb_array_elements(target_lines) supplied) then
    raise exception 'Each purchase-order line may appear only once per receipt';
  end if;

  for line_input in select value from jsonb_array_elements(target_lines)
  loop
    begin
      target_line_id := (line_input->>'purchase_order_line_id')::uuid;
      target_quantity := (line_input->>'quantity_received')::integer;
    exception when others then
      raise exception 'Receipt line identity and quantity must be valid';
    end;
    target_note := nullif(trim(line_input->>'discrepancy_note'), '');
    if target_quantity <= 0 then raise exception 'Received quantities must be positive'; end if;

    select coalesce(line.recommended_units, line.recommended_packs * line.units_per_pack)
      into ordered_quantity
    from public.vault_purchase_order_lines line
    where line.id = target_line_id and line.purchase_order_id = purchase_order.id;
    if not found then raise exception 'Receipt line is not part of this purchase order'; end if;
    if ordered_quantity is null or ordered_quantity <= 0 then
      raise exception 'Persisted ordered unit quantity is unavailable for purchase-order line %', target_line_id;
    end if;

    select coalesce(sum(receipt_line.quantity_received), 0)::integer into already_received
    from public.vault_purchase_order_receipt_lines receipt_line
    join public.vault_purchase_order_receipts receipt on receipt.id = receipt_line.receipt_id
    where receipt.purchase_order_id = purchase_order.id
      and receipt_line.purchase_order_line_id = target_line_id;
    if already_received + target_quantity > ordered_quantity then
      raise exception 'Receipt exceeds the ordered quantity for purchase-order line %', target_line_id;
    end if;
  end loop;

  insert into public.vault_purchase_order_receipts (
    purchase_order_id, received_date, created_by_operator_id, idempotency_key
  ) values (
    purchase_order.id, target_received_date, target_operator_id, target_idempotency_key
  ) returning id, created_at into new_receipt_id, receipt_created_at;

  insert into public.vault_purchase_order_receipt_lines (
    receipt_id, purchase_order_line_id, quantity_received, discrepancy_note
  )
  select new_receipt_id, (supplied->>'purchase_order_line_id')::uuid,
    (supplied->>'quantity_received')::integer,
    nullif(trim(supplied->>'discrepancy_note'), '')
  from jsonb_array_elements(target_lines) supplied;

  select bool_and(received.total_received = received.ordered_quantity) into all_received
  from (
    select line.id,
      coalesce(line.recommended_units, line.recommended_packs * line.units_per_pack) as ordered_quantity,
      coalesce(sum(receipt_line.quantity_received), 0)::integer as total_received
    from public.vault_purchase_order_lines line
    left join public.vault_purchase_order_receipt_lines receipt_line
      on receipt_line.purchase_order_line_id = line.id
    where line.purchase_order_id = purchase_order.id
    group by line.id
  ) received;

  next_received_at := case when all_received then receipt_created_at else null end;
  if all_received then
    update public.vault_purchase_orders po
    set status = 'received', received_at = next_received_at
    where po.id = purchase_order.id;
  end if;

  return query select new_receipt_id, purchase_order.id,
    case when all_received then 'received' else purchase_order.status end,
    next_received_at, all_received, true;
end;
$function$;

revoke all on function public.record_vault_purchase_order_receipt(uuid, uuid, date, text, jsonb)
from public, anon, authenticated;
grant execute on function public.record_vault_purchase_order_receipt(uuid, uuid, date, text, jsonb)
to service_role;

-- A fully received PO may still be unpaid. Preserve that liability in the
-- canonical wallet instead of releasing purchasing capacity on receipt.
create or replace view public.vault_purchasing_wallet as
with ledger as (
  select coalesce(sum(amount_gbp), 0)::numeric(12, 2) as ledger_balance_gbp,
    max(updated_at) as last_updated_at
  from public.vault_cash_transactions
), commitments as (
  select coalesce(sum(greatest(coalesce(actual_total_gbp, estimated_total_gbp, 0) - paid_amount_gbp, 0))
    filter (where status in ('approved', 'ordered', 'part_paid', 'shipped', 'received')), 0)::numeric(12, 2) as committed_orders_gbp,
    max(updated_at) filter (where status in ('approved', 'ordered', 'part_paid', 'shipped', 'received')) as last_updated_at
  from public.vault_purchase_orders
), policy as (
  select protected_reserve_gbp, manual_spending_limit_gbp, reserve_override_allowed,
    wallet_freshness_threshold_minutes, updated_at
  from public.vault_purchasing_policy where policy_key = 'primary'
)
select ledger.ledger_balance_gbp,
  coalesce(policy.protected_reserve_gbp, 0)::numeric(12, 2) as protected_reserve_gbp,
  commitments.committed_orders_gbp,
  greatest(ledger.ledger_balance_gbp - coalesce(policy.protected_reserve_gbp, 0) - commitments.committed_orders_gbp, 0)::numeric(12, 2) as calculated_purchasing_power_gbp,
  (case when policy.manual_spending_limit_gbp is null then
    greatest(ledger.ledger_balance_gbp - coalesce(policy.protected_reserve_gbp, 0) - commitments.committed_orders_gbp, 0)
  else least(policy.manual_spending_limit_gbp,
    greatest(ledger.ledger_balance_gbp - coalesce(policy.protected_reserve_gbp, 0) - commitments.committed_orders_gbp, 0)) end)::numeric(12, 2) as available_purchasing_power_gbp,
  policy.manual_spending_limit_gbp, coalesce(policy.reserve_override_allowed, false) as reserve_override_allowed,
  case
    when ledger.ledger_balance_gbp <= 0 then 'no_cash'
    when ledger.ledger_balance_gbp - coalesce(policy.protected_reserve_gbp, 0) - commitments.committed_orders_gbp <= 0 then 'reserve_protected'
    when ledger.ledger_balance_gbp - coalesce(policy.protected_reserve_gbp, 0) - commitments.committed_orders_gbp < 500 then 'limited'
    else 'healthy'
  end as purchasing_power_state,
  greatest(ledger.last_updated_at, commitments.last_updated_at, policy.updated_at) as wallet_last_updated,
  policy.wallet_freshness_threshold_minutes
from ledger cross join commitments left join policy on true;

-- Receiving and payment are independent dimensions. A received PO can still
-- settle its outstanding balance, while its fulfillment status remains received.
create or replace function public.record_vault_purchase_order_payment(
  target_purchase_order_id uuid, target_operator_id uuid, target_amount_gbp numeric,
  target_payment_date date, target_idempotency_key text
)
returns table (payment_id uuid, purchase_order_id uuid, cash_transaction_id uuid,
  status text, paid_amount_gbp numeric, outstanding_amount_gbp numeric,
  payment_date date, transitioned boolean)
language plpgsql security invoker set search_path = ''
as $function$
declare
  purchase_order public.vault_purchase_orders%rowtype;
  existing_payment public.vault_purchase_order_payments%rowtype;
  account_id uuid; settlement_total numeric(12, 2); outstanding numeric(12, 2);
  next_paid numeric(12, 2); next_status text; ledger_id uuid; new_payment_id uuid;
begin
  if target_amount_gbp is null or target_amount_gbp <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if target_amount_gbp <> round(target_amount_gbp, 2) then raise exception 'Payment amount must use no more than two decimal places'; end if;
  if target_payment_date is null then raise exception 'Payment date is required'; end if;
  if target_idempotency_key is null or length(trim(target_idempotency_key)) = 0 then raise exception 'Payment idempotency key is required'; end if;
  if not exists (select 1 from public.vault_operators operator where operator.id = target_operator_id and operator.is_active)
    then raise exception 'An active operator is required'; end if;
  select * into purchase_order from public.vault_purchase_orders po where po.id = target_purchase_order_id for update;
  if not found then raise exception 'Purchase order was not found'; end if;
  select * into existing_payment from public.vault_purchase_order_payments payment
    where payment.purchase_order_id = target_purchase_order_id and payment.idempotency_key = target_idempotency_key;
  if found then
    settlement_total := coalesce(purchase_order.actual_total_gbp, purchase_order.estimated_total_gbp);
    return query select existing_payment.id, purchase_order.id, existing_payment.cash_transaction_id,
      purchase_order.status, purchase_order.paid_amount_gbp,
      greatest(settlement_total - purchase_order.paid_amount_gbp, 0), existing_payment.payment_date, false;
    return;
  end if;
  if purchase_order.status not in ('ordered', 'part_paid', 'shipped', 'received') then
    raise exception 'Purchase order cannot accept payment from status %', purchase_order.status;
  end if;
  settlement_total := coalesce(purchase_order.actual_total_gbp, purchase_order.estimated_total_gbp);
  if settlement_total is null or settlement_total <= 0 then raise exception 'Canonical GBP settlement total is unavailable'; end if;
  outstanding := settlement_total - purchase_order.paid_amount_gbp;
  if outstanding <= 0 then raise exception 'Purchase order has no outstanding balance'; end if;
  if target_amount_gbp > outstanding then raise exception 'Payment exceeds the outstanding GBP balance of %', outstanding; end if;
  select account.id into account_id from public.vault_cash_accounts account
    where account.account_type = 'business' and account.is_active and account.currency = 'GBP';
  if not found then raise exception 'Active GBP business cash account is unavailable'; end if;
  if (select count(*) from public.vault_cash_accounts account where account.account_type = 'business' and account.is_active and account.currency = 'GBP') <> 1
    then raise exception 'Exactly one active GBP business cash account is required'; end if;
  insert into public.vault_cash_transactions (account_id, transaction_date, transaction_type, category,
    description, amount_gbp, supplier_id, reference, source, external_id, created_by_operator_id)
  values (account_id, target_payment_date, 'supplier_payment', 'Stock purchase',
    'Supplier payment for purchase order ' || purchase_order.id::text, -target_amount_gbp,
    purchase_order.supplier_id, purchase_order.id::text, 'purchase_order',
    'purchase-order-payment:' || purchase_order.id::text || ':' || target_idempotency_key, target_operator_id)
  returning id into ledger_id;
  insert into public.vault_purchase_order_payments (purchase_order_id, amount_gbp, payment_date,
    created_by_operator_id, idempotency_key, cash_transaction_id)
  values (purchase_order.id, target_amount_gbp, target_payment_date, target_operator_id,
    target_idempotency_key, ledger_id) returning id into new_payment_id;
  next_paid := purchase_order.paid_amount_gbp + target_amount_gbp;
  next_status := case
    when purchase_order.status in ('shipped', 'received') then purchase_order.status
    when next_paid = settlement_total then 'paid'
    else 'part_paid'
  end;
  update public.vault_purchase_orders po set paid_amount_gbp = next_paid, status = next_status where po.id = purchase_order.id;
  return query select new_payment_id, purchase_order.id, ledger_id, next_status, next_paid,
    settlement_total - next_paid, target_payment_date, true;
end;
$function$;

revoke all on function public.record_vault_purchase_order_payment(uuid, uuid, numeric, date, text)
from public, anon, authenticated;
grant execute on function public.record_vault_purchase_order_payment(uuid, uuid, numeric, date, text)
to service_role;

notify pgrst, 'reload schema';
