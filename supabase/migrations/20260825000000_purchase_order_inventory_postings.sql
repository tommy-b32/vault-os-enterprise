create table public.vault_purchase_order_inventory_postings (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.vault_purchase_order_receipts(id) on delete restrict,
  created_by_operator_id uuid not null references public.vault_operators(id) on delete restrict,
  idempotency_key text not null check (length(trim(idempotency_key)) > 0),
  shopify_location_id_snapshot text not null check (length(trim(shopify_location_id_snapshot)) > 0),
  created_at timestamptz not null default now(),
  unique (receipt_id, idempotency_key)
);

create table public.vault_purchase_order_inventory_posting_lines (
  id uuid primary key default gen_random_uuid(),
  posting_id uuid not null references public.vault_purchase_order_inventory_postings(id) on delete restrict,
  receipt_allocation_id uuid not null references public.vault_purchase_order_receipt_allocations(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  shopify_variant_id_snapshot text not null,
  shopify_inventory_item_id_snapshot text not null,
  created_at timestamptz not null default now(),
  unique (posting_id, receipt_allocation_id)
);

create table public.vault_purchase_order_inventory_posting_events (
  id uuid primary key default gen_random_uuid(),
  posting_id uuid not null references public.vault_purchase_order_inventory_postings(id) on delete restrict,
  event_type text not null check (event_type in (
    'reserved', 'shopify_succeeded', 'shopify_failed', 'shopify_outcome_unknown',
    'inventory_sync_requested', 'inventory_sync_request_failed'
  )),
  shopify_reference text null,
  response_payload jsonb null,
  created_at timestamptz not null default now(),
  unique (posting_id, event_type)
);

create index vault_purchase_order_inventory_posting_lines_allocation_idx
on public.vault_purchase_order_inventory_posting_lines(receipt_allocation_id);

create function public.prevent_vault_purchase_order_inventory_posting_mutation()
returns trigger language plpgsql set search_path = '' as $function$
begin
  raise exception 'Purchase-order inventory posting evidence is append-only';
end;
$function$;

create trigger vault_purchase_order_inventory_postings_append_only
before update or delete on public.vault_purchase_order_inventory_postings
for each row execute function public.prevent_vault_purchase_order_inventory_posting_mutation();
create trigger vault_purchase_order_inventory_posting_lines_append_only
before update or delete on public.vault_purchase_order_inventory_posting_lines
for each row execute function public.prevent_vault_purchase_order_inventory_posting_mutation();
create trigger vault_purchase_order_inventory_posting_events_append_only
before update or delete on public.vault_purchase_order_inventory_posting_events
for each row execute function public.prevent_vault_purchase_order_inventory_posting_mutation();

alter table public.vault_purchase_order_inventory_postings enable row level security;
alter table public.vault_purchase_order_inventory_posting_lines enable row level security;
alter table public.vault_purchase_order_inventory_posting_events enable row level security;
revoke all on public.vault_purchase_order_inventory_postings from anon, authenticated;
revoke all on public.vault_purchase_order_inventory_posting_lines from anon, authenticated;
revoke all on public.vault_purchase_order_inventory_posting_events from anon, authenticated;

create function public.reserve_vault_purchase_order_inventory_posting(
  target_purchase_order_id uuid, target_receipt_id uuid, target_operator_id uuid, target_idempotency_key text,
  target_allocations jsonb
) returns table (posting_id uuid, created boolean, posting_state text)
language plpgsql security invoker set search_path = '' as $function$
declare
  receipt public.vault_purchase_order_receipts%rowtype;
  existing_id uuid;
  new_id uuid;
  supplied jsonb;
  allocation public.vault_purchase_order_receipt_allocations%rowtype;
  target_quantity integer;
  unavailable integer;
begin
  if not exists (select 1 from public.vault_operators where id = target_operator_id and is_active) then
    raise exception 'An active operator is required';
  end if;
  if target_idempotency_key is null or length(trim(target_idempotency_key)) = 0 then
    raise exception 'Inventory posting idempotency key is required';
  end if;
  if target_allocations is null or jsonb_typeof(target_allocations) <> 'array' or jsonb_array_length(target_allocations) = 0 then
    raise exception 'At least one exact receipt allocation is required';
  end if;
  select * into receipt from public.vault_purchase_order_receipts where id = target_receipt_id;
  if not found then raise exception 'Purchase-order receipt was not found'; end if;
  if receipt.purchase_order_id <> target_purchase_order_id then
    raise exception 'Receipt is not part of the exact purchase order';
  end if;
  select id into existing_id from public.vault_purchase_order_inventory_postings
    where receipt_id = target_receipt_id and idempotency_key = target_idempotency_key;
  if found then
    return query select existing_id, false,
      case
        when exists (select 1 from public.vault_purchase_order_inventory_posting_events where posting_id = existing_id and event_type = 'shopify_succeeded') then 'succeeded'
        when exists (select 1 from public.vault_purchase_order_inventory_posting_events where posting_id = existing_id and event_type = 'shopify_failed') then 'failed'
        when exists (select 1 from public.vault_purchase_order_inventory_posting_events where posting_id = existing_id and event_type = 'shopify_outcome_unknown') then 'outcome_unknown'
        else 'reserved'
      end;
    return;
  end if;
  if (select count(*) from jsonb_array_elements(target_allocations)) <>
     (select count(distinct value->>'receipt_allocation_id') from jsonb_array_elements(target_allocations)) then
    raise exception 'Each receipt allocation may be posted only once per operation';
  end if;

  -- Lock exact accepted-sellable allocations so concurrent posts cannot reserve the same remainder.
  perform allocation_row.id from public.vault_purchase_order_receipt_allocations allocation_row
    join public.vault_purchase_order_receipt_lines receipt_line on receipt_line.id = allocation_row.receipt_line_id
    where receipt_line.receipt_id = target_receipt_id for update of allocation_row;

  for supplied in select value from jsonb_array_elements(target_allocations) loop
    begin
      select * into allocation from public.vault_purchase_order_receipt_allocations
        where id = (supplied->>'receipt_allocation_id')::uuid;
      target_quantity := (supplied->>'quantity')::integer;
    exception when others then raise exception 'Receipt allocation identity and quantity must be valid'; end;
    if not found or not exists (
      select 1 from public.vault_purchase_order_receipt_lines where id = allocation.receipt_line_id and receipt_id = target_receipt_id
    ) then raise exception 'Receipt allocation is not part of this receipt'; end if;
    if target_quantity is null or target_quantity <= 0 then raise exception 'Posting quantity must be a positive whole number'; end if;
    if not exists (
      select 1 from public.vault_variants variant
      where variant.id = allocation.variant_id and variant.source = 'shopify' and variant.source_active
        and variant.source_variant_id = allocation.shopify_variant_id_snapshot
        and variant.source_inventory_item_id = allocation.shopify_inventory_item_id_snapshot
    ) then raise exception 'Current Shopify variant mapping does not match immutable receipt evidence'; end if;
    select allocation.quantity_received - coalesce(sum(posting_line.quantity), 0) into unavailable
    from public.vault_purchase_order_inventory_posting_lines posting_line
    join public.vault_purchase_order_inventory_posting_events reserved
      on reserved.posting_id = posting_line.posting_id and reserved.event_type = 'reserved'
    where posting_line.receipt_allocation_id = allocation.id
      and not exists (select 1 from public.vault_purchase_order_inventory_posting_events failed
        where failed.posting_id = posting_line.posting_id and failed.event_type = 'shopify_failed');
    if target_quantity > unavailable then raise exception 'Posting exceeds the accepted sellable allocation remainder'; end if;
  end loop;
  if not exists (select 1 from public.vault_locations location where location.id = receipt.received_location_id
    and location.source = 'shopify' and location.active
    and location.source_location_id = receipt.shopify_location_id_snapshot) then
    raise exception 'Current Shopify location mapping does not match immutable receipt evidence';
  end if;

  insert into public.vault_purchase_order_inventory_postings
    (receipt_id, created_by_operator_id, idempotency_key, shopify_location_id_snapshot)
    values (receipt.id, target_operator_id, target_idempotency_key, receipt.shopify_location_id_snapshot)
    returning id into new_id;
  insert into public.vault_purchase_order_inventory_posting_lines
    (posting_id, receipt_allocation_id, quantity, shopify_variant_id_snapshot, shopify_inventory_item_id_snapshot)
  select new_id, allocation_row.id, (supplied.value->>'quantity')::integer,
    allocation_row.shopify_variant_id_snapshot, allocation_row.shopify_inventory_item_id_snapshot
  from jsonb_array_elements(target_allocations) supplied
  join public.vault_purchase_order_receipt_allocations allocation_row
    on allocation_row.id = (supplied.value->>'receipt_allocation_id')::uuid;
  insert into public.vault_purchase_order_inventory_posting_events(posting_id, event_type)
    values (new_id, 'reserved');
  return query select new_id, true, 'reserved'::text;
end;
$function$;

create function public.append_vault_purchase_order_inventory_posting_event(
  target_posting_id uuid, target_event_type text, target_shopify_reference text default null,
  target_response_payload jsonb default null
) returns void language plpgsql security invoker set search_path = '' as $function$
begin
  if target_event_type not in ('shopify_succeeded', 'shopify_failed', 'shopify_outcome_unknown',
    'inventory_sync_requested', 'inventory_sync_request_failed') then raise exception 'Invalid posting event'; end if;
  if target_event_type in ('shopify_succeeded', 'shopify_failed', 'shopify_outcome_unknown') and exists (
    select 1 from public.vault_purchase_order_inventory_posting_events
    where posting_id = target_posting_id and event_type in ('shopify_succeeded', 'shopify_failed', 'shopify_outcome_unknown')
  ) then return; end if;
  insert into public.vault_purchase_order_inventory_posting_events
    (posting_id, event_type, shopify_reference, response_payload)
  values (target_posting_id, target_event_type, target_shopify_reference, target_response_payload)
  on conflict (posting_id, event_type) do nothing;
end;
$function$;

revoke all on function public.reserve_vault_purchase_order_inventory_posting(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_vault_purchase_order_inventory_posting(uuid, uuid, uuid, text, jsonb) to service_role;
revoke all on function public.append_vault_purchase_order_inventory_posting_event(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.append_vault_purchase_order_inventory_posting_event(uuid, text, text, jsonb) to service_role;
notify pgrst, 'reload schema';
