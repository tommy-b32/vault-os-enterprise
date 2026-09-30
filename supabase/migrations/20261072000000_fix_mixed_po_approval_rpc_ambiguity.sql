begin;

create or replace function public.approve_mixed_supplier_purchase_order(target_purchase_order_id uuid,target_operator_id uuid)
returns table(purchase_order_id uuid,status text,approved_by_operator_id uuid,approved_at timestamptz,transitioned boolean)
language plpgsql security invoker set search_path='' as $$
declare po public.vault_purchase_orders%rowtype; l public.vault_purchase_order_lines%rowtype; pending public.vault_pending_catalogue_products%rowtype; merchandise public.vault_purchase_order_line_merchandise_cost_evidence%rowtype; fx record; governed_liability record; packs integer:=0; units integer:=0; total numeric:=0; complete_line_count integer:=0; allocation_packs integer; allocation_units integer; merchandise_count integer; expected_header_total numeric; landed_cost_state text; approved_time timestamptz;
begin
  if not exists(select 1 from public.vault_operators o where o.id=target_operator_id and o.is_active) then raise exception 'An active operator is required'; end if;
  select * into po from public.vault_purchase_orders where id=target_purchase_order_id for update;
  if not found then raise exception 'Purchase order was not found'; end if;
  if po.status='approved' and po.approved_by_operator_id is not null and po.approved_at is not null then return query select po.id,po.status,po.approved_by_operator_id,po.approved_at,false; return; end if;
  if po.status<>'draft' then raise exception 'PO_NOT_DRAFT'; end if;
  if not exists(select 1 from public.vault_suppliers s where s.id=po.supplier_id and s.is_active) then raise exception 'PO_SUPPLIER_INVALID'; end if;
  for l in select * from public.vault_purchase_order_lines line where line.purchase_order_id=po.id for update loop
    if l.source_recommendation_type not in ('fixed_pack_purchase_recommendation','manual_fixed_pack_purchase','pending_catalogue_purchase') or l.supplier_id<>po.supplier_id or l.recommended_packs<=0 or l.units_per_pack<=0 or l.recommended_units<>l.recommended_packs*l.units_per_pack then raise exception 'MIXED_PO_LINE_INVALID'; end if;
    if l.pack_cost_gbp is not null and l.line_cost_gbp is not null then
      if l.pack_cost_gbp<=0 or l.line_cost_gbp<>round(l.pack_cost_gbp*l.recommended_packs,2) then raise exception 'MIXED_PO_LINE_INVALID'; end if;
      complete_line_count:=complete_line_count+1; total:=total+l.line_cost_gbp;
    elsif l.pack_cost_gbp is null and l.line_cost_gbp is null then
      select count(*) into merchandise_count from public.vault_purchase_order_line_merchandise_cost_evidence evidence where evidence.purchase_order_line_id=l.id;
      if merchandise_count<>1 then raise exception 'MIXED_PO_MERCHANDISE_EVIDENCE_REQUIRED'; end if;
      select * into merchandise from public.vault_purchase_order_line_merchandise_cost_evidence evidence where evidence.purchase_order_line_id=l.id for share;
      if merchandise.cost_completeness<>'merchandise_only_landed_cost_pending' or merchandise.purchase_order_id<>po.id or merchandise.supplier_id<>po.supplier_id or merchandise.pack_count<>l.recommended_packs or merchandise.units_per_pack<>l.units_per_pack or merchandise.merchandise_pack_cost<=0 or merchandise.merchandise_line_total<=0 or merchandise.merchandise_line_total<>round(merchandise.merchandise_pack_cost*merchandise.pack_count,2) or merchandise.supplier_currency not in ('GBP','EUR','USD','TRY') or not exists(select 1 from public.vault_cost_type_pack_profile_compatibilities compatibility where compatibility.cost_type_id=merchandise.cost_type_id and compatibility.pack_profile_id=merchandise.pack_profile_id and compatibility.active) then raise exception 'MIXED_PO_MERCHANDISE_EVIDENCE_INVALID'; end if;
      if (l.source_snapshot ? 'cost_type_id' and l.source_snapshot->>'cost_type_id'<>merchandise.cost_type_id) or (l.source_snapshot ? 'pack_profile_id' and l.source_snapshot->>'pack_profile_id'<>merchandise.pack_profile_id) then raise exception 'MIXED_PO_MERCHANDISE_EVIDENCE_INVALID'; end if;
    else raise exception 'MIXED_PO_LINE_INVALID'; end if;
    select coalesce(sum(a.units_per_pack),0),coalesce(sum(a.ordered_units),0) into allocation_packs,allocation_units from public.vault_purchase_order_line_size_allocations a where a.purchase_order_line_id=l.id;
    if allocation_packs<>l.units_per_pack or allocation_units<>l.recommended_units or exists(select 1 from public.vault_purchase_order_line_size_allocations a where a.purchase_order_line_id=l.id and a.ordered_units<>l.recommended_packs*a.units_per_pack) then raise exception 'MIXED_PO_ALLOCATION_INVALID'; end if;
    if l.source_recommendation_type='pending_catalogue_purchase' then
      select p.* into pending from public.vault_purchase_order_line_size_allocations a join public.vault_pending_catalogue_products p on p.id=a.pending_catalogue_product_id where a.purchase_order_line_id=l.id limit 1;
      if not found or pending.supplier_id<>po.supplier_id or pending.status<>'pending' then raise exception 'PENDING_CATALOGUE_PRODUCT_INVALID'; end if;
      if exists(select 1 from public.vault_purchase_order_line_size_allocations a where a.purchase_order_line_id=l.id and (a.identity_mode<>'pending_catalogue' or a.pending_catalogue_product_id<>pending.id or a.ordered_units<=0)) then raise exception 'PENDING_CATALOGUE_ALLOCATION_INVALID'; end if;
    end if;
    packs:=packs+l.recommended_packs; units:=units+l.recommended_units;
  end loop;
  expected_header_total:=case when complete_line_count=0 then null else total end;
  if packs=0 or po.total_packs<>packs or po.estimated_total_gbp is distinct from expected_header_total then raise exception 'HEADER_TOTAL_MISMATCH'; end if;
  if complete_line_count<> (select count(*) from public.vault_purchase_order_lines line where line.purchase_order_id=po.id) then
    select completeness.landed_cost_completeness into landed_cost_state from public.vault_purchase_order_landed_cost_completeness completeness where completeness.purchase_order_id=po.id;
    select * into governed_liability from public.vault_purchase_order_governed_liability liability where liability.purchase_order_id=po.id;
    if landed_cost_state='complete_landed_cost' and governed_liability.liability_evidence_state='available' and governed_liability.liability_source='governed_gbp_landed_cost_allocation' and governed_liability.selected_gbp_minor_units is not null and governed_liability.selected_gbp_minor_units>0 and governed_liability.governed_gbp_allocation_run_id is not null then null;
    elsif exists(select 1 from public.vault_purchase_order_current_gbp_landed_cost_allocation_runs run where run.purchase_order_id=po.id) then raise exception 'MIXED_PO_GOVERNED_LANDED_COST_INVALID';
    else
      if landed_cost_state<>'landed_cost_pending' then raise exception 'MIXED_PO_LANDED_COST_COMPLETENESS_INVALID'; end if;
      select * into fx from public.vault_purchase_order_current_fx_commitment commitment where commitment.purchase_order_id=po.id;
      if not found or fx.commitment_evidence_state<>'available' or fx.gbp_commitment_amount is null or fx.gbp_commitment_amount<=0 or not exists(select 1 from public.vault_purchase_order_fx_commitment_evidence evidence where evidence.id=fx.fx_commitment_evidence_id and evidence.purchase_order_id=po.id and evidence.supplier_id=po.supplier_id and evidence.gbp_commitment_amount=fx.gbp_commitment_amount and not exists(select 1 from public.vault_purchase_order_fx_commitment_evidence correction where correction.supersedes_evidence_id=evidence.id)) then raise exception 'MIXED_PO_FX_COMMITMENT_REQUIRED'; end if;
    end if;
  end if;
  approved_time:=clock_timestamp();
  update public.vault_purchase_orders set status='approved',approved_by_operator_id=target_operator_id,approved_at=approved_time where id=po.id;
  insert into public.vault_purchase_order_events(purchase_order_id,operator_id,event_type,idempotency_key,event_snapshot) values(po.id,target_operator_id,'mixed_supplier_purchase_order_approved','mixed-approval:'||po.id::text,jsonb_build_object('total_packs',packs,'total_units',units,'total_gbp',expected_header_total));
  return query select po.id,'approved'::text,target_operator_id,approved_time,true;
end $$;

commit;
