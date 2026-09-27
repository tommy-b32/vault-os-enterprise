begin;

-- Re-open the two established draft-add functions only to allow the other
-- governed source family in a draft. Their commercial and allocation checks
-- remain unchanged.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.create_pending_catalogue_purchase_line(jsonb)'::regprocedure) into definition;
  definition := replace(definition,
    'l.source_recommendation_type<>''pending_catalogue_purchase''',
    'l.source_recommendation_type not in (''pending_catalogue_purchase'',''fixed_pack_purchase_recommendation'',''manual_fixed_pack_purchase'')');
  if position('not in (''pending_catalogue_purchase'',''fixed_pack_purchase_recommendation'',''manual_fixed_pack_purchase'')' in definition)=0 then raise exception 'Pending mixed-draft predecessor was not found'; end if;
  execute definition;

  select pg_get_functiondef('public.add_manual_fixed_pack_to_draft(jsonb)'::regprocedure) into definition;
  definition := replace(definition,
    'l.source_recommendation_type not in (''fixed_pack_purchase_recommendation'',''manual_fixed_pack_purchase'')',
    'l.source_recommendation_type not in (''fixed_pack_purchase_recommendation'',''manual_fixed_pack_purchase'',''pending_catalogue_purchase'')');
  if position('not in (''fixed_pack_purchase_recommendation'',''manual_fixed_pack_purchase'',''pending_catalogue_purchase'')' in definition)=0 then raise exception 'Manual mixed-draft predecessor was not found'; end if;
  execute definition;
end $migration$;

create function public.create_blank_supplier_purchase_order(target_supplier_id uuid,target_operator_id uuid,target_idempotency_key text)
returns table(purchase_order_id uuid,idempotent boolean)
language plpgsql security invoker set search_path='' as $$
declare po public.vault_purchase_orders%rowtype;
begin
  if target_supplier_id is null or target_operator_id is null or nullif(trim(target_idempotency_key),'') is null then raise exception 'BLANK_PO_PAYLOAD_INVALID'; end if;
  if not exists(select 1 from public.vault_operators o where o.id=target_operator_id and o.is_active) then raise exception 'An active operator is required'; end if;
  if not exists(select 1 from public.vault_suppliers s where s.id=target_supplier_id and s.is_active) then raise exception 'BLANK_PO_SUPPLIER_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_operator_id::text||':'||target_idempotency_key,0));
  select * into po from public.vault_purchase_orders where created_by_operator_id=target_operator_id and idempotency_key=target_idempotency_key for update;
  if found then
    if po.supplier_id<>target_supplier_id or po.status<>'draft' or po.total_packs<>0 or coalesce(po.estimated_total_gbp,0)<>0 then raise exception 'BLANK_PO_IDEMPOTENCY_CONFLICT'; end if;
    return query select po.id,true; return;
  end if;
  insert into public.vault_purchase_orders(supplier_id,status,currency,estimated_total_gbp,total_packs,recommended_by_vault_brain,recommendation_confidence,reasoning,created_by_operator_id,idempotency_key,source_snapshot)
  values(target_supplier_id,'draft','GBP',0,0,false,null,'Blank supplier purchase order',target_operator_id,target_idempotency_key,jsonb_build_object('source','blank_supplier_purchase_order')) returning * into po;
  return query select po.id,false;
end $$;

create function public.approve_mixed_supplier_purchase_order(target_purchase_order_id uuid,target_operator_id uuid)
returns table(purchase_order_id uuid,status text,approved_by_operator_id uuid,approved_at timestamptz,transitioned boolean)
language plpgsql security invoker set search_path='' as $$
declare po public.vault_purchase_orders%rowtype; l public.vault_purchase_order_lines%rowtype; pending public.vault_pending_catalogue_products%rowtype; packs integer:=0; units integer:=0; total numeric:=0; allocation_packs integer; allocation_units integer; approved_time timestamptz;
begin
  if not exists(select 1 from public.vault_operators o where o.id=target_operator_id and o.is_active) then raise exception 'An active operator is required'; end if;
  select * into po from public.vault_purchase_orders where id=target_purchase_order_id for update;
  if not found then raise exception 'Purchase order was not found'; end if;
  if po.status='approved' and po.approved_by_operator_id is not null and po.approved_at is not null then return query select po.id,po.status,po.approved_by_operator_id,po.approved_at,false; return; end if;
  if po.status<>'draft' then raise exception 'PO_NOT_DRAFT'; end if;
  if not exists(select 1 from public.vault_suppliers s where s.id=po.supplier_id and s.is_active) then raise exception 'PO_SUPPLIER_INVALID'; end if;
  for l in select * from public.vault_purchase_order_lines where purchase_order_id=po.id for update loop
    if l.source_recommendation_type not in ('fixed_pack_purchase_recommendation','manual_fixed_pack_purchase','pending_catalogue_purchase') or l.supplier_id<>po.supplier_id or l.recommended_packs<=0 or l.units_per_pack<=0 or l.recommended_units<>l.recommended_packs*l.units_per_pack or l.pack_cost_gbp is null or l.line_cost_gbp is null or l.line_cost_gbp<>round(l.pack_cost_gbp*l.recommended_packs,2) then raise exception 'MIXED_PO_LINE_INVALID'; end if;
    select coalesce(sum(a.units_per_pack),0),coalesce(sum(a.ordered_units),0) into allocation_packs,allocation_units from public.vault_purchase_order_line_size_allocations a where a.purchase_order_line_id=l.id;
    if allocation_packs<>l.units_per_pack or allocation_units<>l.recommended_units or exists(select 1 from public.vault_purchase_order_line_size_allocations a where a.purchase_order_line_id=l.id and a.ordered_units<>l.recommended_packs*a.units_per_pack) then raise exception 'MIXED_PO_ALLOCATION_INVALID'; end if;
    if l.source_recommendation_type='pending_catalogue_purchase' then
      select p.* into pending from public.vault_purchase_order_line_size_allocations a join public.vault_pending_catalogue_products p on p.id=a.pending_catalogue_product_id where a.purchase_order_line_id=l.id limit 1;
      if not found or pending.supplier_id<>po.supplier_id or pending.status<>'pending' then raise exception 'PENDING_CATALOGUE_PRODUCT_INVALID'; end if;
      if exists(select 1 from public.vault_purchase_order_line_size_allocations a where a.purchase_order_line_id=l.id and (a.identity_mode<>'pending_catalogue' or a.pending_catalogue_product_id<>pending.id or a.ordered_units<=0)) then raise exception 'PENDING_CATALOGUE_ALLOCATION_INVALID'; end if;
    end if;
    packs:=packs+l.recommended_packs; units:=units+l.recommended_units; total:=total+l.line_cost_gbp;
  end loop;
  if packs=0 or po.total_packs<>packs or po.estimated_total_gbp<>total then raise exception 'HEADER_TOTAL_MISMATCH'; end if;
  approved_time:=clock_timestamp();
  update public.vault_purchase_orders set status='approved',approved_by_operator_id=target_operator_id,approved_at=approved_time where id=po.id;
  insert into public.vault_purchase_order_events(purchase_order_id,operator_id,event_type,idempotency_key,event_snapshot) values(po.id,target_operator_id,'mixed_supplier_purchase_order_approved','mixed-approval:'||po.id::text,jsonb_build_object('total_packs',packs,'total_units',units,'total_gbp',total));
  return query select po.id,'approved'::text,target_operator_id,approved_time,true;
end $$;

revoke all on function public.create_blank_supplier_purchase_order(uuid,uuid,text), public.approve_mixed_supplier_purchase_order(uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_blank_supplier_purchase_order(uuid,uuid,text), public.approve_mixed_supplier_purchase_order(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
