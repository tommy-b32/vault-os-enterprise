-- B23A1.2: canonical resolution is separate from immutable ordered/receipt evidence.
create table public.vault_pending_catalogue_product_size_links (
 pending_catalogue_product_id uuid not null references public.vault_pending_catalogue_products(id) on delete restrict,
 normalized_size text not null check(length(trim(normalized_size))>0), canonical_product_id uuid not null references public.vault_products(id) on delete restrict,
 canonical_variant_id uuid not null references public.vault_variants(id) on delete restrict,
 shopify_product_id_snapshot text not null, shopify_variant_id_snapshot text not null, shopify_inventory_item_id_snapshot text not null,
 linked_by_operator_id uuid not null references public.vault_operators(id) on delete restrict, linked_at timestamptz not null default now(),
 primary key(pending_catalogue_product_id,normalized_size), unique(pending_catalogue_product_id,canonical_variant_id)
);
create or replace function public.link_pending_catalogue_product(target_pending_catalogue_product_id uuid,target_operator_id uuid,target_mappings jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
declare p public.vault_pending_catalogue_products%rowtype; x jsonb; v public.vault_variants%rowtype; expected int; supplied int; expected_canonical_product_id uuid;
begin
 if target_mappings is null or jsonb_typeof(target_mappings)<>'array' or jsonb_array_length(target_mappings)=0 then raise exception 'PENDING_CATALOGUE_LINK_MAPPINGS_REQUIRED'; end if;
 if not exists(select 1 from public.vault_operators where id=target_operator_id and is_active) then raise exception 'An active operator is required'; end if;
 select * into p from public.vault_pending_catalogue_products where id=target_pending_catalogue_product_id for update; if not found or p.status='cancelled' then raise exception 'PENDING_CATALOGUE_PRODUCT_INVALID'; end if;
 select count(*) into expected from public.vault_purchase_order_line_size_allocations where pending_catalogue_product_id=p.id and identity_mode='pending_catalogue'; select count(*) into supplied from jsonb_array_elements(target_mappings);
 if expected=0 or expected<>supplied or supplied<>(select count(distinct trim(value->>'normalized_size')) from jsonb_array_elements(target_mappings)) then raise exception 'PENDING_CATALOGUE_LINK_AMBIGUOUS'; end if;
 for x in select value from jsonb_array_elements(target_mappings) loop
  select * into v from public.vault_variants where id=(x->>'canonical_variant_id')::uuid and source='shopify' and source_active and identity_resolution_status='resolved';
  if not found or v.product_id<>(x->>'canonical_product_id')::uuid or v.normalized_size<>trim(x->>'normalized_size') or v.source_variant_id is null or v.source_inventory_item_id is null or not exists(select 1 from public.vault_products pr where pr.id=v.product_id and pr.source='shopify' and pr.source_product_id=nullif(trim(x->>'shopify_product_id'),'')) then raise exception 'PENDING_CATALOGUE_LINK_IDENTITY_INVALID'; end if;
  if expected_canonical_product_id is null then expected_canonical_product_id:=v.product_id; elsif expected_canonical_product_id<>v.product_id then raise exception 'PENDING_CATALOGUE_LINK_PRODUCT_MISMATCH'; end if;
  if not exists(select 1 from public.vault_purchase_order_line_size_allocations where pending_catalogue_product_id=p.id and normalized_size=trim(x->>'normalized_size') and identity_mode='pending_catalogue') then raise exception 'PENDING_CATALOGUE_LINK_SIZE_INVALID'; end if;
  if exists(select 1 from public.vault_pending_catalogue_product_size_links z where z.pending_catalogue_product_id=p.id and z.normalized_size=trim(x->>'normalized_size') and (z.canonical_variant_id<>v.id or z.canonical_product_id<>v.product_id)) then raise exception 'PENDING_CATALOGUE_LINK_REMAP_FORBIDDEN'; end if;
  insert into public.vault_pending_catalogue_product_size_links values(p.id,trim(x->>'normalized_size'),v.product_id,v.id,nullif(trim(x->>'shopify_product_id'),''),v.source_variant_id,v.source_inventory_item_id,target_operator_id,now()) on conflict(pending_catalogue_product_id,normalized_size) do nothing;
 end loop;
 if (select count(*) from public.vault_pending_catalogue_product_size_links where pending_catalogue_product_id=p.id)<>expected then raise exception 'PENDING_CATALOGUE_LINK_AMBIGUOUS'; end if;
 update public.vault_pending_catalogue_products set status='linked' where id=p.id; return true;
end $$;
revoke all on function public.link_pending_catalogue_product(uuid,uuid,jsonb) from public,anon,authenticated; grant execute on function public.link_pending_catalogue_product(uuid,uuid,jsonb) to service_role;

-- Guard the known B22E predecessor, then make pending a third exact-size source.
do $migration$ declare definition text; begin
 select pg_get_functiondef('public.record_vault_purchase_order_receipt(uuid,uuid,date,uuid,text,jsonb)'::regprocedure) into definition;
 if definition is null or position('''advisor'',''purchase_intelligence_required'',''purchase_intelligence_bring_forward'',''fixed_pack_purchase_recommendation'',''manual_fixed_pack_purchase''' in definition)=0 then raise exception 'B22E receipt predecessor was not found'; end if;
 definition:=replace(definition,'''advisor'',''purchase_intelligence_required'',''purchase_intelligence_bring_forward'',''fixed_pack_purchase_recommendation'',''manual_fixed_pack_purchase''','''advisor'',''purchase_intelligence_required'',''purchase_intelligence_bring_forward'',''fixed_pack_purchase_recommendation'',''manual_fixed_pack_purchase'',''pending_catalogue_purchase''');
 definition:=replace(definition,'source_type in (''fixed_pack_purchase_recommendation'',''manual_fixed_pack_purchase'')','source_type in (''fixed_pack_purchase_recommendation'',''manual_fixed_pack_purchase'',''pending_catalogue_purchase'')');
 definition:=replace(definition,'if (select count(*) from public.vault_variants v where v.id=saved.variant_id','if saved.identity_mode=''pending_catalogue'' then if saved.pending_catalogue_product_id is null then raise exception ''PENDING_CATALOGUE_ALLOCATION_INVALID''; end if; elsif (select count(*) from public.vault_variants v where v.id=saved.variant_id');
 if position('pending_catalogue_purchase' in definition)=0 then raise exception 'B23A receipt patch failed'; end if; execute definition;
end $migration$;
revoke all on function public.record_vault_purchase_order_receipt(uuid,uuid,date,uuid,text,jsonb) from public,anon,authenticated; grant execute on function public.record_vault_purchase_order_receipt(uuid,uuid,date,uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
