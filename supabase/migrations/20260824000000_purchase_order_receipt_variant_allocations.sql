alter table public.vault_purchase_order_receipts
  add column if not exists received_location_id uuid null
    references public.vault_locations(id) on delete restrict,
  add column if not exists shopify_location_id_snapshot text null;

alter table public.vault_purchase_order_receipts
  add constraint vault_purchase_order_receipts_location_required
    check (received_location_id is not null) not valid,
  add constraint vault_purchase_order_receipts_shopify_location_snapshot_required
    check (
      shopify_location_id_snapshot is not null
      and length(trim(shopify_location_id_snapshot)) > 0
    ) not valid;

alter table public.vault_purchase_order_receipt_lines
  drop constraint if exists vault_purchase_order_receipt_lines_quantity_received_check;

alter table public.vault_purchase_order_receipt_lines
  add column if not exists non_sellable_quantity integer not null default 0,
  add constraint vault_purchase_order_receipt_lines_sellable_nonnegative
    check (quantity_received >= 0),
  add constraint vault_purchase_order_receipt_lines_non_sellable_nonnegative
    check (non_sellable_quantity >= 0),
  add constraint vault_purchase_order_receipt_lines_physical_quantity_positive
    check (quantity_received + non_sellable_quantity > 0),
  add constraint vault_purchase_order_receipt_lines_non_sellable_discrepancy_required
    check (non_sellable_quantity = 0 or discrepancy_note is not null);

create table public.vault_purchase_order_receipt_allocations (
  id uuid primary key default gen_random_uuid(),
  receipt_line_id uuid not null
    references public.vault_purchase_order_receipt_lines(id) on delete restrict,
  variant_id uuid not null
    references public.vault_variants(id) on delete restrict,
  shopify_variant_id_snapshot text not null
    check (length(trim(shopify_variant_id_snapshot)) > 0),
  shopify_inventory_item_id_snapshot text not null
    check (length(trim(shopify_inventory_item_id_snapshot)) > 0),
  quantity_received integer not null check (quantity_received > 0),
  created_at timestamptz not null default now(),
  unique (receipt_line_id, variant_id)
);

create index vault_purchase_order_receipt_allocations_variant_idx
on public.vault_purchase_order_receipt_allocations(variant_id);

alter table public.vault_purchase_order_receipt_allocations enable row level security;
revoke all on public.vault_purchase_order_receipt_allocations from anon, authenticated;

create trigger vault_purchase_order_receipt_allocations_append_only
before update or delete on public.vault_purchase_order_receipt_allocations
for each row execute function public.prevent_vault_purchase_order_receipt_mutation();

revoke all on function public.record_vault_purchase_order_receipt(uuid, uuid, date, text, jsonb)
from public, anon, authenticated, service_role;
drop function public.record_vault_purchase_order_receipt(uuid, uuid, date, text, jsonb);

create function public.record_vault_purchase_order_receipt(
  target_purchase_order_id uuid,
  target_operator_id uuid,
  target_received_date date,
  target_received_location_id uuid,
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
  allocation_input jsonb;
  new_receipt_line_id uuid;
  target_line_id uuid;
  target_variant_id uuid;
  target_quantity integer;
  target_non_sellable_quantity integer;
  target_note text;
  ordered_quantity integer;
  already_received integer;
  all_received boolean;
  next_received_at timestamptz;
  target_shopify_location_id text;
begin
  if target_received_date is null then raise exception 'Received date is required'; end if;
  if target_received_location_id is null then raise exception 'Receiving location is required'; end if;
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

  select location.source_location_id into target_shopify_location_id
  from public.vault_locations location
  where location.id = target_received_location_id
    and location.source = 'shopify' and location.active
    and length(trim(location.source_location_id)) > 0;
  if not found then raise exception 'An active canonical Shopify location is required'; end if;

  if purchase_order.status not in ('ordered', 'part_paid', 'paid', 'shipped') then
    raise exception 'Purchase order cannot be received from status %', purchase_order.status;
  end if;

  if exists (
    select 1 from jsonb_array_elements(target_lines) supplied
    where jsonb_typeof(supplied) <> 'object'
      or not (supplied ? 'purchase_order_line_id')
      or not (supplied ? 'allocations')
      or jsonb_typeof(supplied->'allocations') <> 'array'
  ) then raise exception 'Every receipt line requires a PO line and exact variant allocations'; end if;

  if (select count(*) from jsonb_array_elements(target_lines)) <>
     (select count(distinct supplied->>'purchase_order_line_id') from jsonb_array_elements(target_lines) supplied) then
    raise exception 'Each purchase-order line may appear only once per receipt';
  end if;

  for line_input in select value from jsonb_array_elements(target_lines)
  loop
    begin
      target_line_id := (line_input->>'purchase_order_line_id')::uuid;
      select coalesce(sum((allocation->>'quantity_received')::integer), 0)::integer into target_quantity
      from jsonb_array_elements(line_input->'allocations') allocation;
    exception when others then
      raise exception 'Receipt line identity and quantity must be valid';
    end;
    target_note := nullif(trim(line_input->>'discrepancy_note'), '');
    begin
      target_non_sellable_quantity := coalesce((line_input->>'non_sellable_quantity')::integer, 0);
    exception when others then
      raise exception 'Non-sellable quantity must be a whole number';
    end;
    if target_non_sellable_quantity < 0 then raise exception 'Non-sellable quantity cannot be negative'; end if;
    if target_non_sellable_quantity > 0 and target_note is null then
      raise exception 'A discrepancy note is required for non-sellable units';
    end if;
    if target_quantity < 0 then raise exception 'Received quantities cannot be negative'; end if;
    if target_quantity + target_non_sellable_quantity <= 0 then
      raise exception 'Every receipt line requires sellable or non-sellable physical units';
    end if;

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

    if (select count(*) from jsonb_array_elements(line_input->'allocations')) <>
       (select count(distinct allocation->>'variant_id') from jsonb_array_elements(line_input->'allocations') allocation) then
      raise exception 'Each Shopify variant may appear only once per receipt line';
    end if;
    for allocation_input in select value from jsonb_array_elements(line_input->'allocations')
    loop
      begin
        target_variant_id := (allocation_input->>'variant_id')::uuid;
        target_quantity := (allocation_input->>'quantity_received')::integer;
      exception when others then
        raise exception 'Receipt variant allocation identity and quantity must be valid';
      end;
      if target_quantity is null or target_quantity <= 0 then raise exception 'Variant allocation quantities must be positive'; end if;
      if not exists (
        select 1
        from public.vault_variants variant
        join public.vault_purchase_order_lines po_line on po_line.id = target_line_id
        where variant.id = target_variant_id
          and variant.source = 'shopify' and variant.source_active
          and variant.source_variant_id is not null
          and variant.source_inventory_item_id is not null
          and variant.product_id::text || '::' || coalesce(nullif(trim(variant.option_1), ''), 'Default') = po_line.style_id
      ) then raise exception 'Variant allocation does not exactly match the persisted PO style'; end if;
    end loop;
  end loop;

  insert into public.vault_purchase_order_receipts (
    purchase_order_id, received_location_id, shopify_location_id_snapshot,
    received_date, created_by_operator_id, idempotency_key
  ) values (
    purchase_order.id, target_received_location_id, target_shopify_location_id,
    target_received_date, target_operator_id, target_idempotency_key
  ) returning id, created_at into new_receipt_id, receipt_created_at;

  for line_input in select value from jsonb_array_elements(target_lines)
  loop
    select coalesce(sum((allocation->>'quantity_received')::integer), 0)::integer into target_quantity
    from jsonb_array_elements(line_input->'allocations') allocation;
    insert into public.vault_purchase_order_receipt_lines (
      receipt_id, purchase_order_line_id, quantity_received, non_sellable_quantity, discrepancy_note
    ) values (
      new_receipt_id, (line_input->>'purchase_order_line_id')::uuid,
      target_quantity, coalesce((line_input->>'non_sellable_quantity')::integer, 0),
      nullif(trim(line_input->>'discrepancy_note'), '')
    ) returning id into new_receipt_line_id;
    insert into public.vault_purchase_order_receipt_allocations (
      receipt_line_id, variant_id, shopify_variant_id_snapshot,
      shopify_inventory_item_id_snapshot, quantity_received
    )
    select new_receipt_line_id, variant.id, variant.source_variant_id,
      variant.source_inventory_item_id, (allocation->>'quantity_received')::integer
    from jsonb_array_elements(line_input->'allocations') allocation
    join public.vault_variants variant on variant.id = (allocation->>'variant_id')::uuid;
  end loop;

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

revoke all on function public.record_vault_purchase_order_receipt(uuid, uuid, date, uuid, text, jsonb)
from public, anon, authenticated;
grant execute on function public.record_vault_purchase_order_receipt(uuid, uuid, date, uuid, text, jsonb)
to service_role;

notify pgrst, 'reload schema';
