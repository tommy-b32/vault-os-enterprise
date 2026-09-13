-- B23A2.1: atomically add a new supplier product to a pending-only draft PO.
create or replace function public.create_pending_catalogue_purchase_line(authoritative_payload jsonb)
returns table(purchase_order_id uuid,purchase_order_line_id uuid,pending_catalogue_product_id uuid,idempotent boolean)
language plpgsql security invoker set search_path='' as $$
declare
  v_operator uuid; v_po uuid; v_supplier uuid; v_key text; v_title text; v_reference text;
  v_brand text; v_category text; v_colour_model text; v_model_design text; v_notes text;
  v_ordered integer; v_unit_cost numeric(12,2); v_line_cost numeric(12,2); v_snapshot jsonb;
  po public.vault_purchase_orders%rowtype; existing_event public.vault_purchase_order_events%rowtype;
  pending_id uuid; line_id uuid; size_row jsonb;
begin
  if authoritative_payload is null or jsonb_typeof(authoritative_payload)<>'object'
    or jsonb_typeof(authoritative_payload->'sizes')<>'array'
    or jsonb_array_length(authoritative_payload->'sizes')=0 then
    raise exception 'PENDING_CATALOGUE_PAYLOAD_INVALID';
  end if;
  begin
    v_operator:=(authoritative_payload->>'operator_id')::uuid;
    v_po:=(authoritative_payload->>'purchase_order_id')::uuid;
    v_supplier:=(authoritative_payload->>'supplier_id')::uuid;
    v_key:=nullif(trim(authoritative_payload->>'idempotency_key'),'');
    v_title:=nullif(trim(authoritative_payload->>'working_title'),'');
    v_reference:=nullif(trim(authoritative_payload->>'supplier_reference'),'');
    v_brand:=nullif(trim(authoritative_payload->>'brand'),'');
    v_category:=nullif(trim(authoritative_payload->>'product_category'),'');
    v_colour_model:=nullif(trim(authoritative_payload->>'colour_model'),'');
    v_model_design:=nullif(trim(authoritative_payload->>'model_design'),'');
    v_notes:=nullif(trim(authoritative_payload->>'notes'),'');
    v_ordered:=(authoritative_payload->>'ordered_units')::integer;
    v_unit_cost:=(authoritative_payload->>'unit_cost_gbp')::numeric;
  exception when others then raise exception 'PENDING_CATALOGUE_PAYLOAD_INVALID'; end;
  if v_operator is null or v_po is null or v_supplier is null or v_key is null or v_title is null
    or v_model_design is null or v_ordered is null or v_ordered<=0 or v_unit_cost is null or v_unit_cost<0 then
    raise exception 'PENDING_CATALOGUE_PAYLOAD_INVALID';
  end if;
  if exists(select 1 from jsonb_array_elements(authoritative_payload->'sizes') s
    where jsonb_typeof(s.value)<>'object' or nullif(trim(s.value->>'supplier_size_label'),'') is null
      or nullif(trim(s.value->>'normalized_size'),'') is null
      or (s.value->>'ordered_units') !~ '^[0-9]+$' or (s.value->>'ordered_units')::integer<=0)
    or (select count(*) from jsonb_array_elements(authoritative_payload->'sizes'))
       <> (select count(distinct trim(s.value->>'normalized_size')) from jsonb_array_elements(authoritative_payload->'sizes') s)
    or (select coalesce(sum((s.value->>'ordered_units')::integer),0) from jsonb_array_elements(authoritative_payload->'sizes') s)<>v_ordered then
    raise exception 'PENDING_CATALOGUE_ALLOCATION_INVALID';
  end if;
  if not exists(select 1 from public.vault_operators o where o.id=v_operator and o.is_active) then raise exception 'An active operator is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_po::text,0));
  perform pg_advisory_xact_lock(hashtextextended(v_operator::text||':'||v_key,0));
  v_snapshot:=jsonb_build_object('source_type','pending_catalogue_purchase','purchase_order_id',v_po,'supplier_id',v_supplier,'working_title',v_title,'supplier_reference',v_reference,'brand',v_brand,'product_category',v_category,'colour_model',v_colour_model,'model_design',v_model_design,'ordered_units',v_ordered,'unit_cost_gbp',v_unit_cost,'sizes',authoritative_payload->'sizes');
  select * into existing_event from public.vault_purchase_order_events e where e.purchase_order_id=v_po and e.idempotency_key=v_key for update;
  if found then
    if existing_event.operator_id<>v_operator or existing_event.event_type<>'pending_catalogue_product_added_to_draft' or existing_event.event_snapshot is distinct from v_snapshot or existing_event.purchase_order_line_id is null then raise exception 'PENDING_CATALOGUE_IDEMPOTENCY_CONFLICT'; end if;
    select a.pending_catalogue_product_id into pending_id from public.vault_purchase_order_line_size_allocations a where a.purchase_order_line_id=existing_event.purchase_order_line_id limit 1;
    if pending_id is null then raise exception 'PENDING_CATALOGUE_IDEMPOTENCY_CONFLICT'; end if;
    return query select v_po,existing_event.purchase_order_line_id,pending_id,true; return;
  end if;
  select * into po from public.vault_purchase_orders where id=v_po for update;
  if not found or po.created_by_operator_id is distinct from v_operator then raise exception 'PENDING_CATALOGUE_DRAFT_NOT_FOUND'; end if;
  if po.status<>'draft' then raise exception 'PENDING_CATALOGUE_PO_NOT_DRAFT'; end if;
  if po.supplier_id<>v_supplier or not exists(select 1 from public.vault_suppliers s where s.id=v_supplier and s.is_active) then raise exception 'PENDING_CATALOGUE_SUPPLIER_INVALID'; end if;
  if exists(select 1 from public.vault_purchase_order_lines l where l.purchase_order_id=v_po and l.source_recommendation_type<>'pending_catalogue_purchase') then raise exception 'PENDING_CATALOGUE_SOURCE_INVALID'; end if;
  v_line_cost:=round(v_unit_cost*v_ordered,2);
  insert into public.vault_pending_catalogue_products(supplier_id,supplier_reference,working_title,brand,product_category,colour_model,notes,created_by_operator_id)
  values(v_supplier,v_reference,v_title,v_brand,v_category,v_colour_model,v_notes,v_operator) returning id into pending_id;
  insert into public.vault_purchase_order_lines(purchase_order_id,supplier_id,style_id,product_name,recommended_packs,recommended_units,units_per_pack,product_moq_packs,pack_cost_gbp,line_cost_gbp,source_recommendation_type,source_snapshot)
  values(v_po,v_supplier,'pending_catalogue:'||pending_id::text,v_title,1,v_ordered,v_ordered,null,v_line_cost,v_line_cost,'pending_catalogue_purchase',v_snapshot)
  returning id into line_id;
  for size_row in select value from jsonb_array_elements(authoritative_payload->'sizes') loop
    insert into public.vault_purchase_order_line_size_allocations(purchase_order_line_id,pending_catalogue_product_id,supplier_size_label,identity_mode,model_design,normalized_size,units_per_pack,ordered_units)
    values(line_id,pending_id,trim(size_row->>'supplier_size_label'),'pending_catalogue',v_model_design,trim(size_row->>'normalized_size'),(size_row->>'ordered_units')::integer,(size_row->>'ordered_units')::integer);
  end loop;
  update public.vault_purchase_orders set total_packs=(select sum(l.recommended_packs) from public.vault_purchase_order_lines l where l.purchase_order_id=v_po),estimated_total_gbp=(select sum(l.line_cost_gbp) from public.vault_purchase_order_lines l where l.purchase_order_id=v_po) where id=v_po;
  insert into public.vault_purchase_order_events(purchase_order_id,purchase_order_line_id,operator_id,event_type,idempotency_key,event_snapshot)
  values(v_po,line_id,v_operator,'pending_catalogue_product_added_to_draft',v_key,v_snapshot);
  return query select v_po,line_id,pending_id,false;
end $$;
revoke all on function public.create_pending_catalogue_purchase_line(jsonb) from public,anon,authenticated;
grant execute on function public.create_pending_catalogue_purchase_line(jsonb) to service_role;
notify pgrst,'reload schema';
