-- B23A1.3: resolve linked pending sizes at reservation time; never rewrite receipt evidence.
create or replace function public.resolve_pending_catalogue_receipt_allocation(target_receipt_allocation_id uuid)
returns table(shopify_variant_id text,shopify_inventory_item_id text) language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.vault_purchase_order_receipt_allocations r join public.vault_purchase_order_line_size_allocations a on a.id=r.purchase_order_line_size_allocation_id join public.vault_pending_catalogue_products p on p.id=a.pending_catalogue_product_id where r.id=target_receipt_allocation_id and a.identity_mode='pending_catalogue' and p.status<>'linked') then raise exception 'PENDING_CATALOGUE_PRODUCT_NOT_LINKED'; end if;
 return query select l.shopify_variant_id_snapshot,l.shopify_inventory_item_id_snapshot from public.vault_purchase_order_receipt_allocations r join public.vault_purchase_order_line_size_allocations a on a.id=r.purchase_order_line_size_allocation_id join public.vault_pending_catalogue_products p on p.id=a.pending_catalogue_product_id join public.vault_pending_catalogue_product_size_links l on l.pending_catalogue_product_id=p.id and l.normalized_size=a.normalized_size join public.vault_variants v on v.id=l.canonical_variant_id and v.source='shopify' and v.source_active and v.identity_resolution_status='resolved' and v.source_variant_id=l.shopify_variant_id_snapshot and v.source_inventory_item_id=l.shopify_inventory_item_id_snapshot where r.id=target_receipt_allocation_id and a.identity_mode='pending_catalogue';
 if not found and exists(select 1 from public.vault_purchase_order_receipt_allocations r join public.vault_purchase_order_line_size_allocations a on a.id=r.purchase_order_line_size_allocation_id where r.id=target_receipt_allocation_id and a.identity_mode='pending_catalogue') then raise exception 'PENDING_CATALOGUE_PRODUCT_NOT_LINKED'; end if;
end $$;
create or replace function public.resolve_pending_catalogue_posting_line_target() returns trigger language plpgsql security invoker set search_path='' as $$
declare target record;
begin
 if new.shopify_variant_id_snapshot is null or new.shopify_inventory_item_id_snapshot is null then
  select * into target from public.resolve_pending_catalogue_receipt_allocation(new.receipt_allocation_id);
  if found then new.shopify_variant_id_snapshot:=target.shopify_variant_id; new.shopify_inventory_item_id_snapshot:=target.shopify_inventory_item_id; end if;
 end if;
 return new;
end $$;
create trigger vault_pending_catalogue_posting_line_target before insert on public.vault_purchase_order_inventory_posting_lines for each row execute function public.resolve_pending_catalogue_posting_line_target();

do $migration$ declare definition text; begin
 select pg_get_functiondef('public.reserve_vault_purchase_order_inventory_posting(uuid,uuid,uuid,text,jsonb)'::regprocedure) into definition;
 if definition is null or position('Current Shopify variant mapping does not match immutable receipt evidence' in definition)=0 then raise exception 'Inventory posting reservation predecessor was not found'; end if;
 definition:=replace(definition,$needle$    if not exists (
      select 1 from public.vault_variants variant
      where variant.id = allocation.variant_id and variant.source = 'shopify' and variant.source_active
        and variant.source_variant_id = allocation.shopify_variant_id_snapshot
        and variant.source_inventory_item_id = allocation.shopify_inventory_item_id_snapshot
    ) then raise exception 'Current Shopify variant mapping does not match immutable receipt evidence'; end if;$needle$,$replacement$    if exists(select 1 from public.vault_purchase_order_line_size_allocations a where a.id=allocation.purchase_order_line_size_allocation_id and a.identity_mode='pending_catalogue') then perform public.resolve_pending_catalogue_receipt_allocation(allocation.id); elsif not exists (select 1 from public.vault_variants variant where variant.id=allocation.variant_id and variant.source='shopify' and variant.source_active and variant.source_variant_id=allocation.shopify_variant_id_snapshot and variant.source_inventory_item_id=allocation.shopify_inventory_item_id_snapshot) then raise exception 'Current Shopify variant mapping does not match immutable receipt evidence'; end if;$replacement$);
 if position('resolve_pending_catalogue_receipt_allocation' in definition)=0 then raise exception 'Pending posting reservation patch failed'; end if;
 if position($idempotency_needle$from public.vault_purchase_order_inventory_posting_events where posting_id = existing_id and event_type = 'shopify_succeeded') then 'succeeded'
        when exists (select 1 from public.vault_purchase_order_inventory_posting_events where posting_id = existing_id and event_type = 'shopify_failed') then 'failed'
        when exists (select 1 from public.vault_purchase_order_inventory_posting_events where posting_id = existing_id and event_type = 'shopify_outcome_unknown') then 'outcome_unknown'$idempotency_needle$ in definition)=0 then raise exception 'Inventory posting idempotency predecessor was not found'; end if;
 definition:=replace(definition,'from public.vault_purchase_order_inventory_posting_events where posting_id = existing_id and event_type = ''shopify_succeeded''','from public.vault_purchase_order_inventory_posting_events posting_event where posting_event.posting_id = existing_id and event_type = ''shopify_succeeded''');
 definition:=replace(definition,'from public.vault_purchase_order_inventory_posting_events where posting_id = existing_id and event_type = ''shopify_failed''','from public.vault_purchase_order_inventory_posting_events posting_event where posting_event.posting_id = existing_id and event_type = ''shopify_failed''');
 definition:=replace(definition,'from public.vault_purchase_order_inventory_posting_events where posting_id = existing_id and event_type = ''shopify_outcome_unknown''','from public.vault_purchase_order_inventory_posting_events posting_event where posting_event.posting_id = existing_id and event_type = ''shopify_outcome_unknown''');
 if position('posting_event.posting_id = existing_id' in definition)=0 then raise exception 'Inventory posting idempotency patch failed'; end if; execute definition;
end $migration$;
revoke all on function public.resolve_pending_catalogue_receipt_allocation(uuid) from public,anon,authenticated; grant execute on function public.resolve_pending_catalogue_receipt_allocation(uuid) to service_role;
revoke all on function public.reserve_vault_purchase_order_inventory_posting(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated; grant execute on function public.reserve_vault_purchase_order_inventory_posting(uuid,uuid,uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
