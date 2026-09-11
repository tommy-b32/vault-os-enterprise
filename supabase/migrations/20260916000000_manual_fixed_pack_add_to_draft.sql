create function public.add_manual_fixed_pack_to_draft(authoritative_payload jsonb)
returns table (purchase_order_id uuid, purchase_order_line_id uuid, idempotent boolean)
language plpgsql security invoker set search_path = '' as $$
declare
  v_operator uuid; v_po uuid; v_supplier uuid; v_parent uuid; v_style text; v_currency text; v_key text; v_fingerprint text;
  v_packs integer; v_units integer; v_per_pack integer; v_cost numeric(12,2); v_line_cost numeric(12,2); v_moq integer;
  v_snapshot jsonb; v_existing_source text; po public.vault_purchase_orders%rowtype; line public.vault_purchase_order_lines%rowtype; existing public.vault_fixed_pack_draft_idempotency%rowtype;
  allocation jsonb; allocation_count integer; allocation_units integer; allocation_ordered integer;
begin
  if authoritative_payload is null or jsonb_typeof(authoritative_payload) <> 'object' or jsonb_typeof(authoritative_payload->'allocations') <> 'array' or jsonb_array_length(authoritative_payload->'allocations') = 0 then raise exception 'Manual fixed-pack payload is invalid'; end if;
  begin
    v_operator := (authoritative_payload->>'operator_id')::uuid; v_po := (authoritative_payload->>'purchase_order_id')::uuid; v_supplier := (authoritative_payload->>'supplier_id')::uuid; v_parent := (authoritative_payload->>'parent_product_id')::uuid; v_style := nullif(trim(authoritative_payload->>'style_id'),''); v_currency := nullif(trim(authoritative_payload->>'currency'),''); v_key := nullif(trim(authoritative_payload->>'idempotency_key'),''); v_fingerprint := nullif(trim(authoritative_payload->>'fingerprint'),''); v_packs := (authoritative_payload->>'recommended_packs')::integer; v_units := (authoritative_payload->>'recommended_units')::integer; v_per_pack := (authoritative_payload->>'units_per_pack')::integer; v_cost := (authoritative_payload->>'pack_cost_gbp')::numeric; v_line_cost := (authoritative_payload->>'line_cost_gbp')::numeric; v_moq := (authoritative_payload->>'product_moq_packs')::integer;
  exception when others then raise exception 'Manual fixed-pack payload has invalid field types'; end;
  if v_operator is null or v_po is null or v_supplier is null or v_parent is null or v_style is null or v_key is null or v_fingerprint is null or v_currency <> 'GBP' or v_packs is null or v_packs <= 0 or v_units is null or v_per_pack is null or v_per_pack <= 0 or v_cost is null or v_cost <= 0 or v_line_cost is null or v_moq is null or v_packs < v_moq or v_units <> v_packs*v_per_pack or v_line_cost <> round(v_cost*v_packs,2) then raise exception 'Manual fixed-pack payload is incomplete'; end if;
  if not exists(select 1 from public.vault_operators o where o.id=v_operator and o.is_active) then raise exception 'An active operator is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_po::text,0)); perform pg_advisory_xact_lock(hashtextextended(v_operator::text||':'||v_key,0));
  select * into existing from public.vault_fixed_pack_draft_idempotency where operator_id=v_operator and idempotency_key=v_key for update;
  if found then
    select l.source_recommendation_type into v_existing_source from public.vault_purchase_order_lines l where l.id=existing.purchase_order_line_id;
    if v_existing_source <> 'manual_fixed_pack_purchase' or existing.fingerprint <> v_fingerprint or existing.style_id <> v_style or existing.purchase_order_id <> v_po then raise exception 'Manual fixed-pack idempotency conflict'; end if;
    return query select existing.purchase_order_id,existing.purchase_order_line_id,true; return;
  end if;
  select * into po from public.vault_purchase_orders where id=v_po for update;
  if not found or po.created_by_operator_id is distinct from v_operator then raise exception 'Manual fixed-pack draft was not found'; end if;
  if po.status <> 'draft' then raise exception 'Manual fixed-pack draft is not editable'; end if;
  if po.supplier_id <> v_supplier or po.currency <> 'GBP' or not exists(select 1 from public.vault_suppliers s where s.id=v_supplier and s.is_active and s.currency_code='GBP') then raise exception 'Manual fixed-pack draft is incompatible'; end if;
  if exists(select 1 from public.vault_purchase_order_lines l where l.purchase_order_id=v_po and l.source_recommendation_type not in ('fixed_pack_purchase_recommendation','manual_fixed_pack_purchase')) then raise exception 'Manual fixed-pack draft is incompatible'; end if;
  select l.* into line from public.vault_purchase_order_lines l where l.purchase_order_id=v_po and l.style_id=v_style for update;
  if found then raise exception 'Manual fixed-pack style already exists in draft'; end if;
  select count(*),coalesce(sum((a.value->>'units_per_pack')::integer),0),coalesce(sum((a.value->>'ordered_units')::integer),0) into allocation_count,allocation_units,allocation_ordered from jsonb_array_elements(authoritative_payload->'allocations') a;
  if allocation_count=0 or allocation_units<>v_per_pack or allocation_ordered<>v_units or exists(select 1 from jsonb_array_elements(authoritative_payload->'allocations') a where nullif(trim(a.value->>'normalized_size'),'') is null or nullif(trim(a.value->>'model_design'),'') is null or (a.value->>'units_per_pack')::integer<=0 or (a.value->>'ordered_units')::integer<>v_packs*(a.value->>'units_per_pack')::integer) then raise exception 'Manual fixed-pack allocations do not conserve'; end if;
  v_snapshot := authoritative_payload - 'operator_id' - 'idempotency_key';
  insert into public.vault_purchase_order_lines(purchase_order_id,supplier_id,style_id,product_name,recommended_packs,recommended_units,units_per_pack,product_moq_packs,pack_cost_gbp,line_cost_gbp,expected_profit_gbp,source_recommendation_type,source_snapshot)
  values(v_po,v_supplier,v_style,authoritative_payload->>'product_name',v_packs,v_units,v_per_pack,v_moq,v_cost,v_line_cost,nullif(authoritative_payload->>'expected_profit_gbp','')::numeric,'manual_fixed_pack_purchase',v_snapshot) returning * into line;
  for allocation in select value from jsonb_array_elements(authoritative_payload->'allocations') loop
    if not exists(select 1 from public.vault_variants v where v.id=(allocation->>'variant_id')::uuid and v.product_id=v_parent and v.source='shopify' and v.source_active and v.identity_resolution_status='resolved' and v.model_design=allocation->>'model_design' and v.normalized_size=allocation->>'normalized_size' and v.source_variant_id=allocation->>'shopify_variant_id_snapshot' and v.source_inventory_item_id=allocation->>'shopify_inventory_item_id_snapshot') then raise exception 'Manual fixed-pack allocation variant is invalid'; end if;
    insert into public.vault_purchase_order_line_size_allocations(purchase_order_line_id,parent_product_id,model_design,normalized_size,variant_id,shopify_variant_id_snapshot,shopify_inventory_item_id_snapshot,units_per_pack,ordered_units) values(line.id,v_parent,allocation->>'model_design',allocation->>'normalized_size',(allocation->>'variant_id')::uuid,allocation->>'shopify_variant_id_snapshot',allocation->>'shopify_inventory_item_id_snapshot',(allocation->>'units_per_pack')::integer,(allocation->>'ordered_units')::integer);
  end loop;
  update public.vault_purchase_orders set total_packs=(select sum(l.recommended_packs) from public.vault_purchase_order_lines l where l.purchase_order_id=v_po),estimated_total_gbp=(select sum(l.line_cost_gbp) from public.vault_purchase_order_lines l where l.purchase_order_id=v_po) where id=v_po;
  insert into public.vault_purchase_order_events(purchase_order_id,purchase_order_line_id,operator_id,event_type,idempotency_key,event_snapshot) values(v_po,line.id,v_operator,'manual_fixed_pack_added_to_draft',v_key,v_snapshot);
  insert into public.vault_fixed_pack_draft_idempotency values(v_operator,v_key,v_fingerprint,v_style,v_po,line.id);
  return query select v_po,line.id,false;
end; $$;
revoke all on function public.add_manual_fixed_pack_to_draft(jsonb) from public,anon,authenticated;
grant execute on function public.add_manual_fixed_pack_to_draft(jsonb) to service_role;
notify pgrst,'reload schema';
