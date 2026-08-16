alter table public.vault_purchase_orders
  add column if not exists cancelled_at timestamptz null,
  add column if not exists cancelled_by_operator_id uuid null
    references public.vault_operators(id) on delete restrict,
  add column if not exists cancellation_reason text null;

alter table public.vault_purchase_orders
  add constraint vault_purchase_orders_cancellation_reason_bounded
    check (
      cancellation_reason is null
      or length(trim(cancellation_reason)) between 1 and 1000
    );

create index if not exists vault_purchase_orders_cancelled_by_operator_idx
on public.vault_purchase_orders(cancelled_by_operator_id)
where cancelled_by_operator_id is not null;

comment on column public.vault_purchase_orders.cancellation_reason is
  'Required immutable operator reason captured when an eligible purchase order is cancelled.';

create function public.cancel_vault_purchase_order(
  target_purchase_order_id uuid,
  target_operator_id uuid,
  target_cancellation_reason text
)
returns table (
  purchase_order_id uuid,
  status text,
  cancelled_at timestamptz,
  cancelled_by_operator_id uuid,
  cancellation_reason text,
  transitioned boolean
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  purchase_order public.vault_purchase_orders%rowtype;
  next_reason text;
  next_cancelled_at timestamptz;
begin
  next_reason := nullif(trim(target_cancellation_reason), '');
  if next_reason is null then raise exception 'Cancellation reason is required'; end if;
  if length(next_reason) > 1000 then raise exception 'Cancellation reason must be 1000 characters or fewer'; end if;
  if not exists (
    select 1 from public.vault_operators operator
    where operator.id = target_operator_id and operator.is_active
  ) then raise exception 'An active operator is required'; end if;

  select * into purchase_order
  from public.vault_purchase_orders po
  where po.id = target_purchase_order_id
  for update;
  if not found then raise exception 'Purchase order was not found'; end if;

  if purchase_order.status = 'cancelled'
    and purchase_order.cancelled_at is not null
    and purchase_order.cancelled_by_operator_id is not null
    and purchase_order.cancellation_reason is not null then
    return query select purchase_order.id, purchase_order.status,
      purchase_order.cancelled_at, purchase_order.cancelled_by_operator_id,
      purchase_order.cancellation_reason, false;
    return;
  end if;

  if purchase_order.status not in ('draft', 'approved', 'ordered') then
    raise exception 'Purchase order cannot be cancelled from status %', purchase_order.status;
  end if;

  if purchase_order.paid_amount_gbp <> 0 or exists (
    select 1 from public.vault_purchase_order_payments payment
    where payment.purchase_order_id = purchase_order.id
  ) then raise exception 'Purchase order with payment evidence cannot be cancelled'; end if;

  if purchase_order.shipped_at is not null
    or purchase_order.dispatch_date is not null
    or purchase_order.shipped_by_operator_id is not null then
    raise exception 'Purchase order with shipping evidence cannot be cancelled';
  end if;

  if exists (
    select 1 from public.vault_purchase_order_receipts receipt
    where receipt.purchase_order_id = purchase_order.id
  ) then raise exception 'Purchase order with receipt evidence cannot be cancelled'; end if;

  if exists (
    select 1
    from public.vault_purchase_order_inventory_postings posting
    join public.vault_purchase_order_receipts receipt on receipt.id = posting.receipt_id
    where receipt.purchase_order_id = purchase_order.id
  ) then raise exception 'Purchase order with Shopify inventory-posting evidence cannot be cancelled'; end if;

  next_cancelled_at := now();
  update public.vault_purchase_orders po
  set status = 'cancelled',
      cancelled_at = next_cancelled_at,
      cancelled_by_operator_id = target_operator_id,
      cancellation_reason = next_reason
  where po.id = purchase_order.id;

  return query select purchase_order.id, 'cancelled'::text,
    next_cancelled_at, target_operator_id, next_reason, true;
end;
$function$;

revoke all on function public.cancel_vault_purchase_order(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.cancel_vault_purchase_order(uuid, uuid, text)
to service_role;

notify pgrst, 'reload schema';
