create function public.approve_fixed_pack_vault_purchase_order(target_purchase_order_id uuid,target_operator_id uuid,canonical_qualification jsonb)
returns table(purchase_order_id uuid,status text,approved_by_operator_id uuid,approved_at timestamptz,transitioned boolean)
language plpgsql security invoker set search_path = '' as $$
declare po public.vault_purchase_orders%rowtype; supplier public.vault_suppliers%rowtype; wallet record; l public.vault_purchase_order_lines%rowtype; a public.vault_purchase_order_line_size_allocations%rowtype; q jsonb; provenance_fingerprint text; packs integer:=0; units integer:=0; total numeric:=0; allocation_count integer; allocation_pack_units integer; allocation_ordered_units integer; expected_line_count integer; actual_line_count integer; fixed_pack_commitments numeric:=0; approved_time timestamptz;
begin
  if not exists(select 1 from public.vault_operators o where o.id=target_operator_id and o.is_active) then raise exception 'An active operator is required'; end if;
  select * into po from public.vault_purchase_orders where id=target_purchase_order_id for update;
  if not found then raise exception 'Purchase order was not found'; end if;
  if po.status='approved' and po.approved_by_operator_id is not null and po.approved_at is not null then return query select po.id,po.status,po.approved_by_operator_id,po.approved_at,false; return; end if;
  if po.status<>'draft' then raise exception 'PO_NOT_DRAFT'; end if;
  perform pg_advisory_xact_lock(9132026082800000);
  if canonical_qualification is null or jsonb_typeof(canonical_qualification)<>'object' or canonical_qualification->>'source_family'<>'fixed_pack' or canonical_qualification->>'purchase_order_id'<>po.id::text or canonical_qualification->>'supplier_id'<>po.supplier_id::text or canonical_qualification->>'currency_code'<>'GBP' or jsonb_typeof(canonical_qualification->'lines')<>'array' then raise exception 'SOURCE_PROVENANCE_INVALID'; end if;
  if po.currency<>'GBP' then raise exception 'CURRENCY_NOT_GBP'; end if;
  select * into supplier from public.vault_suppliers where id=po.supplier_id for share;
  if not found or supplier.currency_code<>'GBP' then raise exception 'CURRENCY_NOT_GBP'; end if;
  select count(*) into expected_line_count from jsonb_array_elements(canonical_qualification->'lines');
  select count(*) into actual_line_count from public.vault_purchase_order_lines pol where pol.purchase_order_id=po.id;
  if actual_line_count=0 then raise exception 'PO_SOURCE_MIX_INVALID'; end if;
  if expected_line_count=0 or expected_line_count<>actual_line_count or expected_line_count<>(select count(distinct x->>'purchase_order_line_id') from jsonb_array_elements(canonical_qualification->'lines') x) then raise exception 'SOURCE_PROVENANCE_INVALID'; end if;
  for l in select * from public.vault_purchase_order_lines pol where pol.purchase_order_id=po.id for update loop
    if l.source_recommendation_type not in ('fixed_pack_purchase_recommendation','manual_fixed_pack_purchase') then raise exception 'PO_SOURCE_MIX_INVALID'; end if;
    select x->>'provenance_fingerprint' into provenance_fingerprint from jsonb_array_elements(canonical_qualification->'lines') x where x->>'purchase_order_line_id'=l.id::text and x->>'source_recommendation_type'=l.source_recommendation_type;
    if provenance_fingerprint is null or provenance_fingerprint !~ '^[a-f0-9]{32}$' or (select count(*) from jsonb_array_elements(canonical_qualification->'lines') x where x->>'purchase_order_line_id'=l.id::text)<>1 then raise exception 'SOURCE_PROVENANCE_INVALID'; end if;
    if jsonb_typeof(l.source_snapshot)<>'object' or nullif(trim(l.source_snapshot->>'pack_definition_id'),'') is null or l.source_snapshot->>'fingerprint'<>provenance_fingerprint or jsonb_typeof(l.source_snapshot->'allocations')<>'array' then raise exception 'SOURCE_PROVENANCE_INVALID'; end if;
    if l.supplier_id<>po.supplier_id or l.recommended_packs is null or l.recommended_packs<=0 or l.units_per_pack is null or l.units_per_pack<=0 or l.recommended_units is null or l.recommended_units<>l.recommended_packs*l.units_per_pack then raise exception 'FIXED_PACK_ALLOCATION_INVALID'; end if;
    select count(*),coalesce(sum(units_per_pack),0),coalesce(sum(ordered_units),0) into allocation_count,allocation_pack_units,allocation_ordered_units from public.vault_purchase_order_line_size_allocations where purchase_order_line_id=l.id;
    if allocation_count=0 then raise exception 'FIXED_PACK_ALLOCATION_MISSING'; end if;
    for a in select * from public.vault_purchase_order_line_size_allocations where purchase_order_line_id=l.id for update loop
      if nullif(trim(a.normalized_size),'') is null or a.units_per_pack<=0 or a.ordered_units<=0 or a.ordered_units<>l.recommended_packs*a.units_per_pack then raise exception 'FIXED_PACK_ALLOCATION_INVALID'; end if;
      if not exists(select 1 from public.vault_variants v where v.id=a.variant_id and v.product_id=a.parent_product_id and v.source='shopify' and v.source_active and v.identity_resolution_status='resolved' and v.model_design=a.model_design and v.normalized_size=a.normalized_size and v.source_variant_id=a.shopify_variant_id_snapshot and v.source_inventory_item_id=a.shopify_inventory_item_id_snapshot) or (select count(*) from public.vault_variants semantic_variant where semantic_variant.product_id=a.parent_product_id and semantic_variant.source='shopify' and semantic_variant.source_active and semantic_variant.identity_resolution_status='resolved' and semantic_variant.model_design=a.model_design and semantic_variant.normalized_size=a.normalized_size)<>1 then raise exception 'VARIANT_IDENTITY_CHANGED'; end if;
    end loop;
    if allocation_pack_units<>l.units_per_pack or allocation_ordered_units<>l.recommended_units then raise exception 'FIXED_PACK_ALLOCATION_INVALID'; end if;
    if allocation_count<>(select count(*) from jsonb_array_elements(l.source_snapshot->'allocations')) or exists(select 1 from public.vault_purchase_order_line_size_allocations persisted_allocation where persisted_allocation.purchase_order_line_id=l.id and not exists(select 1 from jsonb_array_elements(l.source_snapshot->'allocations') snapshot_allocation where snapshot_allocation->>'variant_id'=persisted_allocation.variant_id::text and snapshot_allocation->>'model_design'=persisted_allocation.model_design and snapshot_allocation->>'normalized_size'=persisted_allocation.normalized_size and snapshot_allocation->>'shopify_variant_id_snapshot'=persisted_allocation.shopify_variant_id_snapshot and snapshot_allocation->>'shopify_inventory_item_id_snapshot'=persisted_allocation.shopify_inventory_item_id_snapshot and snapshot_allocation->>'units_per_pack'=persisted_allocation.units_per_pack::text and snapshot_allocation->>'ordered_units'=persisted_allocation.ordered_units::text)) then raise exception 'SOURCE_PROVENANCE_INVALID'; end if;
    if (select count(*) from public.vault_supplier_style_pack_composition_intelligence c where c.id=(l.source_snapshot->>'pack_definition_id') and c.supplier_id=l.supplier_id and c.style_id=l.style_id and c.active)<>allocation_count or (select count(distinct c.id) from public.vault_supplier_style_pack_composition_intelligence c where c.supplier_id=l.supplier_id and c.style_id=l.style_id and c.active)<>1 or not exists(select 1 from public.vault_supplier_style_pack_composition_intelligence c where c.supplier_id=l.supplier_id and c.style_id=l.style_id and c.active and c.composition_complete and c.composition_valid and c.commercial_pack_consistent and c.composition_units_per_pack=l.units_per_pack and c.declared_units_per_pack=l.units_per_pack and c.id=(l.source_snapshot->>'pack_definition_id')) or exists(select 1 from public.vault_purchase_order_line_size_allocations posa where posa.purchase_order_line_id=l.id and not exists(select 1 from public.vault_supplier_style_pack_composition_intelligence c where c.id=(l.source_snapshot->>'pack_definition_id') and c.supplier_id=l.supplier_id and c.style_id=l.style_id and c.normalized_size=posa.normalized_size and c.units_per_pack=posa.units_per_pack)) then raise exception 'PACK_CONTRACT_CHANGED'; end if;

    if not exists(
      select 1
      from public.vault_style_catalogue_intelligence s
      join public.vault_product_commercial_intelligence c
        on c.product_id=s.parent_product_id
      where s.style_id=l.style_id
        and s.supplier_id=po.supplier_id
        and c.landed_cost_per_pack_gbp>0
        and l.pack_cost_gbp=c.landed_cost_per_pack_gbp
        and l.line_cost_gbp=l.recommended_packs*c.landed_cost_per_pack_gbp
    ) then
      raise exception 'COMMERCIAL_COST_CHANGED';
    end if;

    if exists(select 1 from public.vault_style_catalogue_intelligence s where s.style_id=l.style_id and s.supplier_id=po.supplier_id and (not s.restock_enabled or s.inventory_strategy='do_not_restock')) then raise exception 'RESTOCK_DISABLED'; end if;
    if exists(select 1 from public.vault_style_catalogue_intelligence s where s.style_id=l.style_id and s.supplier_id=po.supplier_id and s.supplier_moq_packs is not null and l.recommended_packs<s.supplier_moq_packs) then raise exception 'PRODUCT_MOQ_NOT_MET'; end if;
    if not exists(select 1 from public.vault_fixed_pack_draft_idempotency i where i.purchase_order_id=po.id and i.purchase_order_line_id=l.id and i.style_id=l.style_id and i.fingerprint=provenance_fingerprint) or (select count(*) from public.vault_fixed_pack_draft_idempotency i where i.purchase_order_line_id=l.id)<>1 or (select count(*) from public.vault_purchase_order_events e where e.purchase_order_id=po.id and e.purchase_order_line_id=l.id and e.event_type=case when l.source_recommendation_type='manual_fixed_pack_purchase' then 'manual_fixed_pack_added_to_draft' else 'fixed_pack_recommendation_added_to_draft' end and e.event_snapshot->>'fingerprint'=provenance_fingerprint)<>1 or not exists(select 1 from public.vault_purchase_order_events e where e.purchase_order_id=po.id and e.purchase_order_line_id=l.id and e.event_type=case when l.source_recommendation_type='manual_fixed_pack_purchase' then 'manual_fixed_pack_added_to_draft' else 'fixed_pack_recommendation_added_to_draft' end and e.event_snapshot->>'fingerprint'=provenance_fingerprint and (not (e.event_snapshot ? 'pack_definition_id') or e.event_snapshot=l.source_snapshot)) then raise exception 'SOURCE_PROVENANCE_INVALID'; end if;
    packs:=packs+l.recommended_packs; units:=units+l.recommended_units; total:=total+l.line_cost_gbp;
  end loop;
  if po.total_packs<>packs or po.estimated_total_gbp<>total or (canonical_qualification->>'expected_total_packs')::integer<>packs or (canonical_qualification->>'expected_total_gbp')::numeric<>total then raise exception 'HEADER_TOTAL_MISMATCH'; end if;
  if exists(select 1 from public.vault_supplier_purchasing_rules r where r.supplier_id=po.supplier_id and r.minimum_order_packs is not null and packs<r.minimum_order_packs) then raise exception 'SUPPLIER_PACK_MOQ_NOT_MET'; end if;
  if supplier.minimum_order_value is not null and total<supplier.minimum_order_value then raise exception 'SUPPLIER_MIN_VALUE_NOT_MET'; end if;
  select * into wallet from public.vault_purchasing_wallet;
  if not found or wallet.wallet_last_updated is null or wallet.wallet_freshness_threshold_minutes is null then raise exception 'The canonical purchasing wallet is unavailable'; end if;
  if wallet.wallet_last_updated<now()-make_interval(mins=>wallet.wallet_freshness_threshold_minutes) then raise exception 'The canonical purchasing wallet is stale'; end if;
  select coalesce(sum(approved_order.estimated_total_gbp),0) into fixed_pack_commitments from public.vault_purchase_orders approved_order where approved_order.status='approved' and exists(select 1 from public.vault_purchase_order_events approval_event where approval_event.purchase_order_id=approved_order.id and approval_event.event_type='fixed_pack_purchase_order_approved');
  if total>wallet.available_purchasing_power_gbp-fixed_pack_commitments or wallet.ledger_balance_gbp-wallet.protected_reserve_gbp-wallet.committed_orders_gbp-fixed_pack_commitments-total<0 then raise exception 'The exact saved basket exceeds current reserve-safe purchasing capacity'; end if;
  approved_time:=now(); update public.vault_purchase_orders vpo set status='approved',approved_by_operator_id=target_operator_id,approved_at=approved_time where vpo.id=po.id and vpo.status='draft';
  insert into public.vault_purchase_order_events(purchase_order_id,operator_id,event_type,idempotency_key,event_snapshot) values(po.id,target_operator_id,'fixed_pack_purchase_order_approved','fixed-pack-approval:'||po.id::text,jsonb_build_object('source_family','fixed_pack','total_packs',packs,'total_gbp',total,'lines',canonical_qualification->'lines'));
  return query select po.id,'approved'::text,target_operator_id,approved_time,true;
end; $$;
revoke all on function public.approve_fixed_pack_vault_purchase_order(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.approve_fixed_pack_vault_purchase_order(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';