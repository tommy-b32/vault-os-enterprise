alter table public.vault_purchase_orders
  add column if not exists shipped_at timestamptz null,
  add column if not exists dispatch_date date null,
  add column if not exists carrier text null,
  add column if not exists tracking_reference text null,
  add column if not exists shipped_by_operator_id uuid null
    references public.vault_operators(id) on delete restrict;

alter table public.vault_purchase_orders
  add constraint vault_purchase_orders_carrier_bounded
    check (carrier is null or (length(trim(carrier)) between 1 and 200)),
  add constraint vault_purchase_orders_tracking_reference_bounded
    check (tracking_reference is null or (length(trim(tracking_reference)) between 1 and 200));

create index if not exists vault_purchase_orders_shipped_by_operator_idx
on public.vault_purchase_orders(shipped_by_operator_id)
where shipped_by_operator_id is not null;

comment on column public.vault_purchase_orders.dispatch_date is
  'Supplier-confirmed calendar date on which this placed purchase order was genuinely dispatched.';
comment on column public.vault_purchase_orders.carrier is
  'Optional supplier-provided carrier snapshot captured when dispatch is confirmed.';
comment on column public.vault_purchase_orders.tracking_reference is
  'Optional supplier-provided tracking reference snapshot captured when dispatch is confirmed.';
comment on column public.vault_purchase_orders.shipped_by_operator_id is
  'Active Vault OS operator who recorded supplier dispatch evidence.';

create function public.mark_vault_purchase_order_shipped(
  target_purchase_order_id uuid,
  target_operator_id uuid,
  target_dispatch_date date,
  target_carrier text default null,
  target_tracking_reference text default null
)
returns table (
  purchase_order_id uuid,
  status text,
  shipped_at timestamptz,
  dispatch_date date,
  carrier text,
  tracking_reference text,
  shipped_by_operator_id uuid,
  transitioned boolean
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  purchase_order public.vault_purchase_orders%rowtype;
  next_shipped_at timestamptz;
  next_carrier text;
  next_tracking_reference text;
begin
  if target_dispatch_date is null then raise exception 'Dispatch date is required'; end if;
  if target_dispatch_date > current_date then raise exception 'Dispatch date cannot be in the future'; end if;
  if not exists (
    select 1 from public.vault_operators operator
    where operator.id = target_operator_id and operator.is_active
  ) then raise exception 'An active operator is required'; end if;

  next_carrier := nullif(trim(target_carrier), '');
  next_tracking_reference := nullif(trim(target_tracking_reference), '');
  if next_carrier is not null and length(next_carrier) > 200 then
    raise exception 'Carrier must be 200 characters or fewer';
  end if;
  if next_tracking_reference is not null and length(next_tracking_reference) > 200 then
    raise exception 'Tracking reference must be 200 characters or fewer';
  end if;

  select * into purchase_order
  from public.vault_purchase_orders po
  where po.id = target_purchase_order_id
  for update;
  if not found then raise exception 'Purchase order was not found'; end if;

  if purchase_order.status in ('shipped', 'received')
    and purchase_order.shipped_at is not null
    and purchase_order.dispatch_date is not null
    and purchase_order.shipped_by_operator_id is not null then
    return query select purchase_order.id, purchase_order.status,
      purchase_order.shipped_at, purchase_order.dispatch_date,
      purchase_order.carrier, purchase_order.tracking_reference,
      purchase_order.shipped_by_operator_id, false;
    return;
  end if;

  if purchase_order.status not in ('ordered', 'part_paid', 'paid') then
    raise exception 'Purchase order cannot be marked shipped from status %', purchase_order.status;
  end if;
  if purchase_order.ordered_at is null then
    raise exception 'Persisted supplier-order placement evidence is required';
  end if;
  if target_dispatch_date < purchase_order.ordered_at::date then
    raise exception 'Dispatch date cannot precede the order placement date';
  end if;

  next_shipped_at := now();
  update public.vault_purchase_orders po
  set status = 'shipped',
      shipped_at = next_shipped_at,
      dispatch_date = target_dispatch_date,
      carrier = next_carrier,
      tracking_reference = next_tracking_reference,
      shipped_by_operator_id = target_operator_id
  where po.id = purchase_order.id;

  return query select purchase_order.id, 'shipped'::text,
    next_shipped_at, target_dispatch_date, next_carrier,
    next_tracking_reference, target_operator_id, true;
end;
$function$;

revoke all on function public.mark_vault_purchase_order_shipped(uuid, uuid, date, text, text)
from public, anon, authenticated;
grant execute on function public.mark_vault_purchase_order_shipped(uuid, uuid, date, text, text)
to service_role;

notify pgrst, 'reload schema';
