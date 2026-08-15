create table if not exists public.vault_purchase_order_payments (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.vault_purchase_orders(id) on delete restrict,
  amount_gbp numeric(12, 2) not null check (amount_gbp > 0),
  payment_date date not null,
  created_by_operator_id uuid not null references public.vault_operators(id) on delete restrict,
  idempotency_key text not null check (length(trim(idempotency_key)) > 0),
  cash_transaction_id uuid not null references public.vault_cash_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (purchase_order_id, idempotency_key),
  unique (cash_transaction_id)
);

create index if not exists vault_purchase_order_payments_order_idx
on public.vault_purchase_order_payments(purchase_order_id, payment_date, created_at);

alter table public.vault_purchase_order_payments enable row level security;
revoke all on public.vault_purchase_order_payments from anon, authenticated;

create or replace function public.prevent_vault_purchase_order_payment_mutation()
returns trigger language plpgsql security invoker set search_path = ''
as $function$
begin
  raise exception 'Purchase-order payment evidence is append-only';
end;
$function$;

revoke all on function public.prevent_vault_purchase_order_payment_mutation()
from public, anon, authenticated;

drop trigger if exists vault_purchase_order_payments_append_only
on public.vault_purchase_order_payments;
create trigger vault_purchase_order_payments_append_only
before update or delete on public.vault_purchase_order_payments
for each row execute function public.prevent_vault_purchase_order_payment_mutation();

create or replace function public.record_vault_purchase_order_payment(
  target_purchase_order_id uuid,
  target_operator_id uuid,
  target_amount_gbp numeric,
  target_payment_date date,
  target_idempotency_key text
)
returns table (
  payment_id uuid,
  purchase_order_id uuid,
  cash_transaction_id uuid,
  status text,
  paid_amount_gbp numeric,
  outstanding_amount_gbp numeric,
  payment_date date,
  transitioned boolean
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  purchase_order public.vault_purchase_orders%rowtype;
  existing_payment public.vault_purchase_order_payments%rowtype;
  account_id uuid;
  settlement_total numeric(12, 2);
  outstanding numeric(12, 2);
  next_paid numeric(12, 2);
  next_status text;
  ledger_id uuid;
  new_payment_id uuid;
begin
  if target_amount_gbp is null or target_amount_gbp <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;
  if target_amount_gbp <> round(target_amount_gbp, 2) then
    raise exception 'Payment amount must use no more than two decimal places';
  end if;
  if target_payment_date is null then
    raise exception 'Payment date is required';
  end if;
  if target_idempotency_key is null or length(trim(target_idempotency_key)) = 0 then
    raise exception 'Payment idempotency key is required';
  end if;
  if not exists (
    select 1 from public.vault_operators operator
    where operator.id = target_operator_id and operator.is_active
  ) then
    raise exception 'An active operator is required';
  end if;

  select * into purchase_order
  from public.vault_purchase_orders po
  where po.id = target_purchase_order_id
  for update;
  if not found then raise exception 'Purchase order was not found'; end if;

  select * into existing_payment
  from public.vault_purchase_order_payments payment
  where payment.purchase_order_id = target_purchase_order_id
    and payment.idempotency_key = target_idempotency_key;
  if found then
    settlement_total := coalesce(purchase_order.actual_total_gbp, purchase_order.estimated_total_gbp);
    return query select existing_payment.id, purchase_order.id,
      existing_payment.cash_transaction_id, purchase_order.status,
      purchase_order.paid_amount_gbp,
      greatest(settlement_total - purchase_order.paid_amount_gbp, 0),
      existing_payment.payment_date, false;
    return;
  end if;

  if purchase_order.status not in ('ordered', 'part_paid') then
    raise exception 'Purchase order cannot accept payment from status %', purchase_order.status;
  end if;
  settlement_total := coalesce(purchase_order.actual_total_gbp, purchase_order.estimated_total_gbp);
  if settlement_total is null or settlement_total <= 0 then
    raise exception 'Canonical GBP settlement total is unavailable';
  end if;
  outstanding := settlement_total - purchase_order.paid_amount_gbp;
  if outstanding <= 0 then raise exception 'Purchase order has no outstanding balance'; end if;
  if target_amount_gbp > outstanding then
    raise exception 'Payment exceeds the outstanding GBP balance of %', outstanding;
  end if;

  select account.id into account_id
  from public.vault_cash_accounts account
  where account.account_type = 'business' and account.is_active and account.currency = 'GBP';
  if not found then raise exception 'Active GBP business cash account is unavailable'; end if;
  if (select count(*) from public.vault_cash_accounts account
      where account.account_type = 'business' and account.is_active and account.currency = 'GBP') <> 1 then
    raise exception 'Exactly one active GBP business cash account is required';
  end if;

  insert into public.vault_cash_transactions (
    account_id, transaction_date, transaction_type, category, description,
    amount_gbp, supplier_id, reference, source, external_id, created_by_operator_id
  ) values (
    account_id, target_payment_date, 'supplier_payment', 'Stock purchase',
    'Supplier payment for purchase order ' || purchase_order.id::text,
    -target_amount_gbp, purchase_order.supplier_id, purchase_order.id::text,
    'purchase_order',
    'purchase-order-payment:' || purchase_order.id::text || ':' || target_idempotency_key,
    target_operator_id
  ) returning id into ledger_id;

  insert into public.vault_purchase_order_payments (
    purchase_order_id, amount_gbp, payment_date, created_by_operator_id,
    idempotency_key, cash_transaction_id
  ) values (
    purchase_order.id, target_amount_gbp, target_payment_date, target_operator_id,
    target_idempotency_key, ledger_id
  ) returning id into new_payment_id;

  next_paid := purchase_order.paid_amount_gbp + target_amount_gbp;
  next_status := case when next_paid = settlement_total then 'paid' else 'part_paid' end;
  update public.vault_purchase_orders po
  set paid_amount_gbp = next_paid, status = next_status
  where po.id = purchase_order.id;

  return query select new_payment_id, purchase_order.id, ledger_id, next_status,
    next_paid, settlement_total - next_paid, target_payment_date, true;
end;
$function$;

revoke all on function public.record_vault_purchase_order_payment(uuid, uuid, numeric, date, text)
from public, anon, authenticated;
grant execute on function public.record_vault_purchase_order_payment(uuid, uuid, numeric, date, text)
to service_role;

notify pgrst, 'reload schema';
