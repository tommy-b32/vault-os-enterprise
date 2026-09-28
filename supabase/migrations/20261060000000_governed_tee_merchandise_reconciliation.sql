begin;

-- A complete GBP line may independently carry supplier-merchandise
-- reconciliation evidence. It must not be relabelled as a pending-cost line.
do $$
declare v_constraint text;
begin
  select conname into v_constraint
  from pg_constraint
  where conrelid='public.vault_purchase_order_line_merchandise_cost_evidence'::regclass
    and contype='c' and pg_get_constraintdef(oid) like '%cost_completeness%';
  if v_constraint is null then raise exception 'LINE_MERCHANDISE_COMPLETENESS_CONSTRAINT_NOT_FOUND'; end if;
  execute format('alter table public.vault_purchase_order_line_merchandise_cost_evidence drop constraint %I',v_constraint);
  alter table public.vault_purchase_order_line_merchandise_cost_evidence add constraint vault_purchase_order_line_merchandise_cost_evidence_cost_completeness_check
    check (cost_completeness in ('merchandise_only_landed_cost_pending','independent_merchandise_reconciliation'));
end $$;

do $$
declare v_supplier uuid; v_profile uuid:='5eec6ed8-16af-4024-8f02-e43fdf5c8cd7'; v_count integer; v_existing public.vault_supplier_product_type_merchandise_cost_evidence%rowtype;
  v_note constant text:='Direct Exclusive supplier order evidence: 15 Serie T-shirt = USD 750; 14 serie Sweatshirt = USD 1,120; 1 Serie Tracksuit = USD 175; total merchandise USD 2,045; shipping 74 kg = USD 1,030; total USD 3,075. Tee freight remains PO-level and unallocated. Governed Tee profile/version: 5eec6ed8-16af-4024-8f02-e43fdf5c8cd7 / f2978e12-f2db-40bc-bd35-a1d10cee64f7.';
begin
  select id into v_supplier from public.vault_suppliers where lower(trim(supplier_name))='exclusive' and is_active;
  if v_supplier is null or not exists(select 1 from public.vault_supplier_product_type_cost_profiles p where p.id=v_profile and p.supplier_id=v_supplier and p.cost_type_id='tee' and p.active and p.supplier_currency='USD' and p.pack_cost=50 and p.units_per_pack=5) then raise exception 'EXCLUSIVE_TEE_PROFILE_INVALID'; end if;
  select count(*) into v_count from public.vault_supplier_product_type_merchandise_cost_evidence e where e.supplier_id=v_supplier and e.cost_type_id='tee' and e.pack_profile_id='tee_5_piece';
  if v_count=0 then insert into public.vault_supplier_product_type_merchandise_cost_evidence(supplier_id,cost_type_id,pack_profile_id,supplier_currency,merchandise_pack_cost,cost_scope,shipping_evidence_status,source_note) values(v_supplier,'tee','tee_5_piece','USD',50,'merchandise_only','unknown',v_note);
  elsif v_count=1 then
    select * into v_existing from public.vault_supplier_product_type_merchandise_cost_evidence e where e.supplier_id=v_supplier and e.cost_type_id='tee' and e.pack_profile_id='tee_5_piece';
    if v_existing.supplier_currency<>'USD' or v_existing.merchandise_pack_cost<>50 or v_existing.cost_scope<>'merchandise_only' or v_existing.shipping_evidence_status<>'unknown' or v_existing.source_note<>v_note then raise exception 'EXCLUSIVE_TEE_MERCHANDISE_EVIDENCE_CONFLICT'; end if;
  else raise exception 'EXCLUSIVE_TEE_MERCHANDISE_EVIDENCE_CONFLICT'; end if;
end $$;

create function public.capture_draft_complete_cost_tee_merchandise_reconciliation(authoritative_payload jsonb)
returns table(purchase_order_id uuid,evidence_row_count integer,pack_count integer,ordered_units integer,merchandise_total numeric(12,2),idempotent boolean)
language plpgsql security invoker set search_path='' as $$
declare
  v_po uuid; v_supplier uuid; v_operator uuid; v_key text; v_evidence uuid; v_profile uuid; v_version uuid; v_lines uuid[]; v_snapshot jsonb;
  po public.vault_purchase_orders%rowtype; merchandise public.vault_supplier_product_type_merchandise_cost_evidence%rowtype; existing public.vault_purchase_order_events%rowtype;
  l public.vault_purchase_order_lines%rowtype; v_count integer:=0; v_packs integer:=0; v_units integer:=0; v_total numeric(12,2):=0; v_parent uuid; v_effective public.vault_product_cost_versions%rowtype; v_effective_count integer;
begin
  if authoritative_payload is null or jsonb_typeof(authoritative_payload)<>'object' or jsonb_typeof(authoritative_payload->'purchase_order_line_ids')<>'array' then raise exception 'TEE_RECONCILIATION_PAYLOAD_INVALID'; end if;
  begin
    v_po:=nullif(authoritative_payload->>'purchase_order_id','')::uuid; v_supplier:=nullif(authoritative_payload->>'supplier_id','')::uuid; v_operator:=nullif(authoritative_payload->>'operator_id','')::uuid; v_key:=nullif(trim(authoritative_payload->>'idempotency_key'),''); v_evidence:=nullif(authoritative_payload->>'merchandise_evidence_id','')::uuid; v_profile:=nullif(authoritative_payload->>'expected_profile_id','')::uuid; v_version:=nullif(authoritative_payload->>'expected_profile_version_id','')::uuid;
    select array_agg(value::text::uuid order by value::text) into v_lines from jsonb_array_elements_text(authoritative_payload->'purchase_order_line_ids');
  exception when others then raise exception 'TEE_RECONCILIATION_PAYLOAD_INVALID'; end;
  if v_po<>'8706e0ef-daa9-4e4f-b128-04faa0bd9606'::uuid or v_supplier is null or v_operator is null or v_key is null or v_evidence is null or v_profile<>'5eec6ed8-16af-4024-8f02-e43fdf5c8cd7'::uuid or v_version<>'f2978e12-f2db-40bc-bd35-a1d10cee64f7'::uuid or cardinality(v_lines)<>10 or cardinality(v_lines)<>cardinality(array(select distinct unnest(v_lines))) or jsonb_typeof(authoritative_payload->'supplier_order_provenance')<>'object' or authoritative_payload->'supplier_order_provenance'='{}'::jsonb then raise exception 'TEE_RECONCILIATION_PAYLOAD_INVALID'; end if;
  if not exists(select 1 from public.vault_operators o where o.id=v_operator and o.is_active) then raise exception 'An active operator is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_po::text,0)); perform pg_advisory_xact_lock(hashtextextended(v_operator::text||':'||v_key,0));
  select * into po from public.vault_purchase_orders where id=v_po for update;
  if not found or po.status<>'draft' or po.supplier_id<>v_supplier then raise exception 'TEE_RECONCILIATION_PO_INVALID'; end if;
  select * into merchandise from public.vault_supplier_product_type_merchandise_cost_evidence e where e.id=v_evidence and e.supplier_id=v_supplier and e.cost_type_id='tee' and e.pack_profile_id='tee_5_piece' and e.supplier_currency='USD' and e.merchandise_pack_cost=50 and e.cost_scope='merchandise_only' and e.shipping_evidence_status='unknown' for share;
  if not found or (select count(*) from public.vault_supplier_product_type_merchandise_cost_evidence e where e.supplier_id=v_supplier and e.cost_type_id='tee' and e.pack_profile_id='tee_5_piece')<>1 or not exists(select 1 from public.vault_cost_type_pack_profile_compatibilities c where c.cost_type_id='tee' and c.pack_profile_id='tee_5_piece' and c.active) or not exists(select 1 from public.vault_supplier_product_type_cost_profile_versions p where p.id=v_version and p.profile_id=v_profile and p.snapshot->>'supplier_currency'='USD' and (p.snapshot->>'pack_cost')::numeric=50 and (p.snapshot->>'units_per_pack')::integer=5) then raise exception 'TEE_RECONCILIATION_GOVERNANCE_INVALID'; end if;
  v_snapshot:=jsonb_build_object('source_type','independent_merchandise_reconciliation','purchase_order_id',v_po,'supplier_id',v_supplier,'merchandise_evidence_id',v_evidence,'cost_type_id','tee','pack_profile_id','tee_5_piece','commercial_profile_id',v_profile,'commercial_profile_version_id',v_version,'supplier_order_provenance',authoritative_payload->'supplier_order_provenance','freight_state','separately_po_level_unallocated','line_ids',to_jsonb(v_lines));
  select * into existing from public.vault_purchase_order_events e where e.purchase_order_id=v_po and e.idempotency_key=v_key for update;
  if found then
    if existing.operator_id<>v_operator or existing.event_type<>'complete_cost_tee_merchandise_reconciliation_captured' or existing.event_snapshot is distinct from v_snapshot then raise exception 'TEE_RECONCILIATION_IDEMPOTENCY_CONFLICT'; end if;
    select count(*),coalesce(sum(e.pack_count),0),coalesce(sum(e.pack_count*e.units_per_pack),0),coalesce(sum(e.merchandise_line_total),0) into v_count,v_packs,v_units,v_total from public.vault_purchase_order_line_merchandise_cost_evidence e where e.purchase_order_id=v_po and e.supplier_id=v_supplier and e.purchase_order_line_id=any(v_lines) and e.cost_completeness='independent_merchandise_reconciliation' and e.merchandise_evidence_id=v_evidence and e.supplier_currency='USD' and e.merchandise_pack_cost=50;
    if v_count<>10 or v_packs<>15 or v_units<>75 or v_total<>750 or (select count(*) from public.vault_purchase_order_line_merchandise_cost_evidence e where e.purchase_order_line_id=any(v_lines))<>10 then raise exception 'TEE_RECONCILIATION_IDEMPOTENT_STATE_INVALID'; end if;
    return query select v_po,v_count,v_packs,v_units,v_total,true; return;
  end if;
  for l in select * from public.vault_purchase_order_lines where id=any(v_lines) order by id for update loop
    if l.purchase_order_id<>v_po or l.supplier_id<>v_supplier or l.source_recommendation_type not in ('manual_fixed_pack_purchase','pending_catalogue_purchase') or l.units_per_pack<>5 or l.recommended_packs<=0 or l.recommended_units<>l.recommended_packs*5 or l.pack_cost_gbp is null or l.line_cost_gbp is null or l.line_cost_gbp<>round(l.pack_cost_gbp*l.recommended_packs,2) or exists(select 1 from public.vault_purchase_order_line_merchandise_cost_evidence e where e.purchase_order_line_id=l.id) or (select coalesce(sum(a.ordered_units),0) from public.vault_purchase_order_line_size_allocations a where a.purchase_order_line_id=l.id)<>l.recommended_units then raise exception 'TEE_RECONCILIATION_LINE_INVALID'; end if;
    if l.source_recommendation_type='pending_catalogue_purchase' then if l.source_snapshot->>'commercial_profile_id'<>v_profile::text or l.source_snapshot->>'commercial_profile_version_id'<>v_version::text or (l.source_snapshot->>'pack_merchandise_cost')::numeric<>50 or l.source_snapshot->>'pack_profile_id'<>'tee_5_piece' then raise exception 'TEE_RECONCILIATION_PENDING_PROVENANCE_INVALID'; end if;
    else
      v_parent:=nullif(l.source_snapshot->>'parent_product_id','')::uuid;
      if v_parent is null then raise exception 'TEE_RECONCILIATION_MANUAL_PROVENANCE_INVALID'; end if;
      select count(*) into v_effective_count from public.vault_product_cost_versions pc where pc.product_id=v_parent and pc.effective_from=(select max(effective_from) from public.vault_product_cost_versions candidate where candidate.product_id=v_parent and candidate.effective_from<=l.created_at);
      if v_effective_count<>1 then raise exception 'TEE_RECONCILIATION_MANUAL_EFFECTIVE_VERSION_AMBIGUOUS'; end if;
      select * into v_effective from public.vault_product_cost_versions pc where pc.product_id=v_parent and pc.effective_from<=l.created_at order by pc.effective_from desc limit 1;
      if v_effective.source_components #>> '{resolved,profile_id}'<>v_profile::text or v_effective.source_components #>> '{resolved,profile_version_id}'<>v_version::text or v_effective.source_components #>> '{settings,pack_profile}'<>'tee_5_piece' or (v_effective.source_components #>> '{resolved,units_per_pack}')::integer<>5 or not exists(select 1 from public.vault_supplier_product_type_cost_profile_versions p where p.id=v_version and p.profile_id=v_profile and p.snapshot->>'supplier_currency'='USD' and (p.snapshot->>'pack_cost')::numeric=50 and (p.snapshot->>'units_per_pack')::integer=5) then raise exception 'TEE_RECONCILIATION_MANUAL_PROVENANCE_INVALID'; end if;
    end if;
    v_count:=v_count+1; v_packs:=v_packs+l.recommended_packs; v_units:=v_units+l.recommended_units; v_total:=v_total+50*l.recommended_packs;
  end loop;
  if v_count<>10 or v_packs<>15 or v_units<>75 or v_total<>750 then raise exception 'TEE_RECONCILIATION_BATCH_INVALID'; end if;
  for l in select * from public.vault_purchase_order_lines where id=any(v_lines) order by id loop
    insert into public.vault_purchase_order_line_merchandise_cost_evidence(purchase_order_line_id,purchase_order_id,supplier_id,supplier_currency,merchandise_pack_cost,merchandise_line_total,pack_count,units_per_pack,merchandise_evidence_id,cost_type_id,pack_profile_id,cost_completeness,source_snapshot) values(l.id,v_po,v_supplier,'USD',50,round(50*l.recommended_packs,2),l.recommended_packs,5,v_evidence,'tee','tee_5_piece','independent_merchandise_reconciliation',v_snapshot||jsonb_build_object('purchase_order_line_id',l.id,'pack_count',l.recommended_packs,'ordered_units',l.recommended_units));
  end loop;
  insert into public.vault_purchase_order_events(purchase_order_id,operator_id,event_type,idempotency_key,event_snapshot) values(v_po,v_operator,'complete_cost_tee_merchandise_reconciliation_captured',v_key,v_snapshot);
  return query select v_po,v_count,v_packs,v_units,v_total,false;
end $$;

revoke all on function public.capture_draft_complete_cost_tee_merchandise_reconciliation(jsonb) from public,anon,authenticated;
grant execute on function public.capture_draft_complete_cost_tee_merchandise_reconciliation(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
