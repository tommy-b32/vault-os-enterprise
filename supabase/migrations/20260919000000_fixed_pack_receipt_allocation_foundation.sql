alter table public.vault_purchase_order_receipt_allocations
  add column purchase_order_line_size_allocation_id uuid null
    references public.vault_purchase_order_line_size_allocations(id) on delete restrict,
  add column non_sellable_quantity integer not null default 0
    check (non_sellable_quantity >= 0);

create index vault_purchase_order_receipt_allocations_size_allocation_idx
on public.vault_purchase_order_receipt_allocations(purchase_order_line_size_allocation_id)
where purchase_order_line_size_allocation_id is not null;

create or replace function public.assert_vault_purchase_order_receipt_allocation_linkage()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  saved_allocation public.vault_purchase_order_line_size_allocations%rowtype;
  receipt_purchase_order_line_id uuid;
  physically_received integer;
begin
  -- NULL preserves the legacy receipt contract. B22C will require a link for
  -- newly received fixed-pack allocations without reinterpreting history.
  if new.purchase_order_line_size_allocation_id is null then
    return new;
  end if;

  select * into saved_allocation
  from public.vault_purchase_order_line_size_allocations allocation
  where allocation.id = new.purchase_order_line_size_allocation_id
  for update;
  if not found then
    raise exception 'Saved purchase-order size allocation was not found';
  end if;

  select receipt_line.purchase_order_line_id into receipt_purchase_order_line_id
  from public.vault_purchase_order_receipt_lines receipt_line
  where receipt_line.id = new.receipt_line_id;
  if not found or receipt_purchase_order_line_id <> saved_allocation.purchase_order_line_id then
    raise exception 'Receipt allocation must reference a saved size allocation from the same purchase-order line';
  end if;

  if new.variant_id <> saved_allocation.variant_id then
    raise exception 'Receipt allocation variant must exactly match the saved size allocation';
  end if;
  if new.shopify_variant_id_snapshot <> saved_allocation.shopify_variant_id_snapshot then
    raise exception 'Receipt allocation Shopify variant snapshot must exactly match the saved size allocation';
  end if;
  if new.shopify_inventory_item_id_snapshot <> saved_allocation.shopify_inventory_item_id_snapshot then
    raise exception 'Receipt allocation Shopify inventory-item snapshot must exactly match the saved size allocation';
  end if;

  select coalesce(sum(allocation.quantity_received + allocation.non_sellable_quantity), 0)::integer
    into physically_received
  from public.vault_purchase_order_receipt_allocations allocation
  where allocation.purchase_order_line_size_allocation_id = saved_allocation.id;
  if physically_received + new.quantity_received + new.non_sellable_quantity > saved_allocation.ordered_units then
    raise exception 'Physical receipt exceeds the saved ordered quantity for purchase-order size allocation %', saved_allocation.id;
  end if;
  return new;
end;
$function$;

create trigger vault_purchase_order_receipt_allocations_fixed_pack_linkage
before insert on public.vault_purchase_order_receipt_allocations
for each row execute function public.assert_vault_purchase_order_receipt_allocation_linkage();

alter table public.vault_purchase_order_receipt_allocations enable row level security;
revoke insert, update, delete on public.vault_purchase_order_receipt_allocations from anon, authenticated;
