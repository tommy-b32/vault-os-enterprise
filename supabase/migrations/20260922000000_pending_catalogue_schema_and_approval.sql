-- B23A1.1: supplier purchasing identity before Shopify identity.
create table public.vault_pending_catalogue_products (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.vault_suppliers(id) on delete restrict,
  supplier_reference text null check (supplier_reference is null or length(trim(supplier_reference)) > 0),
  working_title text not null check (length(trim(working_title)) > 0),
  brand text null, product_category text null, colour_model text null, notes text null,
  status text not null default 'pending' check (status in ('pending','linked','cancelled')),
  created_at timestamptz not null default now(),
  created_by_operator_id uuid not null references public.vault_operators(id) on delete restrict
);

alter table public.vault_purchase_order_line_size_allocations
  add column pending_catalogue_product_id uuid null references public.vault_pending_catalogue_products(id) on delete restrict,
  add column supplier_size_label text null,
  add column identity_mode text not null default 'shopify_backed' constraint vault_purchase_order_line_size_allocations_identity_mode_value_check check (identity_mode in ('shopify_backed','pending_catalogue'));
alter table public.vault_purchase_order_line_size_allocations alter column parent_product_id drop not null;
alter table public.vault_purchase_order_line_size_allocations alter column variant_id drop not null;
alter table public.vault_purchase_order_line_size_allocations alter column shopify_variant_id_snapshot drop not null;
alter table public.vault_purchase_order_line_size_allocations alter column shopify_inventory_item_id_snapshot drop not null;
alter table public.vault_purchase_order_line_size_allocations
  add constraint vault_purchase_order_line_size_allocations_identity_mode_check check (
    (identity_mode='shopify_backed' and pending_catalogue_product_id is null and parent_product_id is not null and variant_id is not null and shopify_variant_id_snapshot is not null and shopify_inventory_item_id_snapshot is not null)
    or (identity_mode='pending_catalogue' and pending_catalogue_product_id is not null and parent_product_id is null and variant_id is null and shopify_variant_id_snapshot is null and shopify_inventory_item_id_snapshot is null)
  );
create unique index vault_pending_catalogue_allocation_size_unique on public.vault_purchase_order_line_size_allocations(pending_catalogue_product_id,normalized_size) where pending_catalogue_product_id is not null;

alter table public.vault_purchase_order_receipt_allocations alter column variant_id drop not null;
alter table public.vault_purchase_order_receipt_allocations alter column shopify_variant_id_snapshot drop not null;
alter table public.vault_purchase_order_receipt_allocations alter column shopify_inventory_item_id_snapshot drop not null;
alter table public.vault_purchase_order_receipt_allocations
  drop constraint if exists vault_purchase_order_receipt_allocation_quantity_received_check,
  drop constraint if exists vault_purchase_order_receipt_allocations_physical_quantity_positive;
alter table public.vault_purchase_order_receipt_allocations
  add constraint vault_purchase_order_receipt_allocations_physical_quantity_positive
  check (quantity_received >= 0 and non_sellable_quantity >= 0 and quantity_received + non_sellable_quantity > 0);
alter table public.vault_purchase_order_receipt_allocations
  add constraint vault_purchase_order_receipt_allocations_identity_snapshot_check check (
    (variant_id is not null and shopify_variant_id_snapshot is not null and shopify_inventory_item_id_snapshot is not null)
    or (variant_id is null and shopify_variant_id_snapshot is null and shopify_inventory_item_id_snapshot is null)
  );

create or replace function public.assert_vault_purchase_order_receipt_allocation_linkage()
returns trigger language plpgsql security invoker set search_path='' as $$
declare saved_allocation public.vault_purchase_order_line_size_allocations%rowtype; receipt_purchase_order_line_id uuid; physically_received integer;
begin
  if new.purchase_order_line_size_allocation_id is null then return new; end if;
  select * into saved_allocation from public.vault_purchase_order_line_size_allocations allocation where allocation.id=new.purchase_order_line_size_allocation_id for update;
  if not found then raise exception 'Saved purchase-order size allocation was not found'; end if;
  select receipt_line.purchase_order_line_id into receipt_purchase_order_line_id from public.vault_purchase_order_receipt_lines receipt_line where receipt_line.id=new.receipt_line_id;
  if not found or receipt_purchase_order_line_id<>saved_allocation.purchase_order_line_id then raise exception 'Receipt allocation must reference a saved size allocation from the same purchase-order line'; end if;
  if saved_allocation.identity_mode='shopify_backed' then
    if new.variant_id is distinct from saved_allocation.variant_id or new.shopify_variant_id_snapshot is distinct from saved_allocation.shopify_variant_id_snapshot or new.shopify_inventory_item_id_snapshot is distinct from saved_allocation.shopify_inventory_item_id_snapshot then raise exception 'Receipt allocation identity must exactly match the saved Shopify-backed size allocation'; end if;
  elsif saved_allocation.identity_mode='pending_catalogue' then
    if new.variant_id is not null or new.shopify_variant_id_snapshot is not null or new.shopify_inventory_item_id_snapshot is not null then raise exception 'Pending catalogue receipt allocation must not contain Shopify identity'; end if;
  else
    raise exception 'Receipt allocation saved identity mode is invalid';
  end if;
  select coalesce(sum(allocation.quantity_received+allocation.non_sellable_quantity),0)::integer into physically_received from public.vault_purchase_order_receipt_allocations allocation where allocation.purchase_order_line_size_allocation_id=saved_allocation.id;
  if physically_received+new.quantity_received+new.non_sellable_quantity>saved_allocation.ordered_units then raise exception 'Physical receipt exceeds the saved ordered quantity for purchase-order size allocation %',saved_allocation.id; end if;
  return new;
end $$;

create or replace function public.prevent_approved_pending_catalogue_allocation_mutation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from public.vault_purchase_order_lines l join public.vault_purchase_orders po on po.id=l.purchase_order_id where l.id=old.purchase_order_line_id and l.source_recommendation_type='pending_catalogue_purchase' and po.status<>'draft') then
    if new.purchase_order_line_id is distinct from old.purchase_order_line_id or new.pending_catalogue_product_id is distinct from old.pending_catalogue_product_id or new.identity_mode is distinct from old.identity_mode or new.normalized_size is distinct from old.normalized_size or new.ordered_units is distinct from old.ordered_units or new.supplier_size_label is distinct from old.supplier_size_label or new.model_design is distinct from old.model_design or new.units_per_pack is distinct from old.units_per_pack then raise exception 'Approved pending catalogue size allocation is immutable'; end if;
  end if;
  return new;
end $$;
create trigger vault_pending_catalogue_size_allocations_immutable before update on public.vault_purchase_order_line_size_allocations for each row execute function public.prevent_approved_pending_catalogue_allocation_mutation();

create or replace function public.approve_pending_catalogue_purchase_order(target_purchase_order_id uuid,target_operator_id uuid)
returns table(purchase_order_id uuid,status text,approved_by_operator_id uuid,approved_at timestamptz,transitioned boolean)
language plpgsql security invoker set search_path='' as $$
declare po public.vault_purchase_orders%rowtype; line public.vault_purchase_order_lines%rowtype; pending public.vault_pending_catalogue_products%rowtype; allocation_count integer; allocated_units integer; approved_time timestamptz:=now();
begin
  if not exists(select 1 from public.vault_operators where id=target_operator_id and is_active) then raise exception 'An active operator is required'; end if;
  select * into po from public.vault_purchase_orders where id=target_purchase_order_id for update; if not found then raise exception 'Purchase order was not found'; end if;
  if po.status='approved' and po.approved_by_operator_id is not null then return query select po.id,po.status,po.approved_by_operator_id,po.approved_at,false; return; end if;
  if po.status<>'draft' then raise exception 'PO_NOT_DRAFT'; end if;
  for line in select pol.* from public.vault_purchase_order_lines pol where pol.purchase_order_id=po.id for update loop
    if line.source_recommendation_type<>'pending_catalogue_purchase' then raise exception 'PENDING_CATALOGUE_SOURCE_INVALID'; end if;
    select p.* into pending from public.vault_purchase_order_line_size_allocations a join public.vault_pending_catalogue_products p on p.id=a.pending_catalogue_product_id where a.purchase_order_line_id=line.id limit 1;
    if not found or pending.supplier_id<>po.supplier_id or pending.status<>'pending' then raise exception 'PENDING_CATALOGUE_PRODUCT_INVALID'; end if;
    select count(*),coalesce(sum(a.ordered_units),0) into allocation_count,allocated_units from public.vault_purchase_order_line_size_allocations a where a.purchase_order_line_id=line.id and a.identity_mode='pending_catalogue' and a.pending_catalogue_product_id=pending.id;
    if allocation_count=0 or allocated_units<>line.recommended_units or line.recommended_units<=0 or line.line_cost_gbp is null or line.line_cost_gbp<0 or exists(select 1 from public.vault_purchase_order_line_size_allocations a where a.purchase_order_line_id=line.id and (a.identity_mode<>'pending_catalogue' or a.pending_catalogue_product_id<>pending.id or a.ordered_units<=0)) then raise exception 'PENDING_CATALOGUE_ALLOCATION_INVALID'; end if;
  end loop;
  if not exists(select 1 from public.vault_purchase_order_lines pol where pol.purchase_order_id=po.id) then raise exception 'PENDING_CATALOGUE_ALLOCATION_INVALID'; end if;
  update public.vault_purchase_orders set status='approved',approved_by_operator_id=target_operator_id,approved_at=approved_time where id=po.id;
  insert into public.vault_purchase_order_events(purchase_order_id,operator_id,event_type,idempotency_key,event_snapshot) values(po.id,target_operator_id,'pending_catalogue_purchase_order_approved','pending-catalogue-approval:'||po.id::text,jsonb_build_object('source_recommendation_type','pending_catalogue_purchase'));
  return query select po.id,'approved'::text,target_operator_id,approved_time,true;
end $$;

alter table public.vault_pending_catalogue_products enable row level security;
revoke all on public.vault_pending_catalogue_products from anon,authenticated;
revoke all on function public.approve_pending_catalogue_purchase_order(uuid,uuid) from public,anon,authenticated;
grant execute on function public.approve_pending_catalogue_purchase_order(uuid,uuid) to service_role;
notify pgrst,'reload schema';
