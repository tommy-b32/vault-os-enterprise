-- Fixed-pack draft creation is intentionally a database transaction.  The
-- caller has already recomputed the recommendation and resolved commercial
-- facts; this function only validates and persists those canonical facts.
create table public.vault_fixed_pack_draft_idempotency (
  operator_id uuid not null references public.vault_operators(id) on delete restrict,
  idempotency_key text not null check (length(trim(idempotency_key)) > 0),
  fingerprint text not null check (length(trim(fingerprint)) = 32),
  style_id text not null,
  purchase_order_id uuid not null references public.vault_purchase_orders(id) on delete restrict,
  purchase_order_line_id uuid not null references public.vault_purchase_order_lines(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (operator_id, idempotency_key)
);

alter table public.vault_fixed_pack_draft_idempotency enable row level security;
revoke all on public.vault_fixed_pack_draft_idempotency from anon, authenticated;

create function public.add_fixed_pack_recommendation_to_draft(authoritative_payload jsonb)
returns table (
  purchase_order_id uuid,
  purchase_order_line_id uuid,
  created_new_draft boolean,
  created_new_line boolean,
  idempotent boolean
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_operator_id uuid; v_style_id text; v_parent_product_id uuid; v_supplier_id uuid;
  v_currency text; v_target_draft_id uuid; v_idempotency_key text; product_name text;
  recommended_packs integer; recommended_units integer; units_per_pack integer;
  product_moq_packs integer; pack_cost_gbp numeric(12,2); line_cost_gbp numeric(12,2);
  expected_profit_gbp numeric(12,2); source_snapshot jsonb; fingerprint text;
  canonical_allocations jsonb; canonical_snapshot jsonb; canonical_model_design text;
  allocation jsonb; existing_idempotency public.vault_fixed_pack_draft_idempotency%rowtype;
  selected_order public.vault_purchase_orders%rowtype; selected_line public.vault_purchase_order_lines%rowtype;
  eligible_count integer; allocation_count integer; allocation_pack_units integer; allocation_ordered_units integer;
  result_created_draft boolean := false;
begin
  if authoritative_payload is null or jsonb_typeof(authoritative_payload) <> 'object'
    or jsonb_typeof(authoritative_payload->'allocations') <> 'array'
    or jsonb_array_length(authoritative_payload->'allocations') = 0 then
    raise exception 'Fixed-pack authoritative payload is invalid';
  end if;
  begin
    v_operator_id := (authoritative_payload->>'operator_id')::uuid;
    v_style_id := nullif(trim(authoritative_payload->>'style_id'), '');
    v_parent_product_id := (authoritative_payload->>'parent_product_id')::uuid;
    v_supplier_id := (authoritative_payload->>'supplier_id')::uuid;
    v_currency := nullif(trim(authoritative_payload->>'currency'), '');
    v_target_draft_id := nullif(authoritative_payload->>'target_draft_id', '')::uuid;
    v_idempotency_key := nullif(trim(authoritative_payload->>'idempotency_key'), '');
    product_name := nullif(trim(authoritative_payload->>'product_name'), '');
    recommended_packs := (authoritative_payload->>'recommended_packs')::integer;
    recommended_units := (authoritative_payload->>'recommended_units')::integer;
    units_per_pack := (authoritative_payload->>'units_per_pack')::integer;
    product_moq_packs := (authoritative_payload->>'product_moq_packs')::integer;
    pack_cost_gbp := (authoritative_payload->>'pack_cost_gbp')::numeric;
    line_cost_gbp := (authoritative_payload->>'line_cost_gbp')::numeric;
    expected_profit_gbp := nullif(authoritative_payload->>'expected_profit_gbp', '')::numeric;
    source_snapshot := coalesce(authoritative_payload->'source_snapshot', '{}'::jsonb);
  exception when others then raise exception 'Fixed-pack authoritative payload has invalid field types'; end;
  if v_operator_id is null or v_style_id is null or v_parent_product_id is null or v_supplier_id is null or v_currency is null
    or v_idempotency_key is null or product_name is null or recommended_packs is null or recommended_packs <= 0
    or recommended_units is null or units_per_pack is null or units_per_pack <= 0 or product_moq_packs is null
    or product_moq_packs < 0 or pack_cost_gbp is null or line_cost_gbp is null
    or jsonb_typeof(source_snapshot) <> 'object'
    or nullif(trim(source_snapshot->>'pack_definition_id'), '') is null then
    raise exception 'Fixed-pack authoritative payload is incomplete';
  end if;
  if recommended_units <> recommended_packs * units_per_pack then
    raise exception 'Fixed-pack recommended units do not conserve whole packs';
  end if;
  if not exists (select 1 from public.vault_operators o where o.id=v_operator_id and o.is_active) then
    raise exception 'An active operator is required';
  end if;
  if not exists (select 1 from public.vault_suppliers s where s.id=v_supplier_id) then raise exception 'Fixed-pack supplier was not found'; end if;

  -- The snapshot is constructed here, rather than trusting opaque caller JSON.
  -- recommendation_evidence is the explicit authoritative caller-provenance
  -- subset; presentation-only source fields do not affect a purchase decision.
  select count(*), coalesce(sum((a.value->>'units_per_pack')::integer),0), coalesce(sum((a.value->>'ordered_units')::integer),0)
    into allocation_count, allocation_pack_units, allocation_ordered_units
  from jsonb_array_elements(authoritative_payload->'allocations') a;
  if allocation_count = 0 or allocation_pack_units <> units_per_pack or allocation_ordered_units <> recommended_units
    or exists (select 1 from jsonb_array_elements(authoritative_payload->'allocations') a
               where nullif(trim(a.value->>'normalized_size'),'') is null or nullif(trim(a.value->>'model_design'),'') is null
                 or nullif(a.value->>'variant_id','') is null or nullif(trim(a.value->>'shopify_variant_id_snapshot'),'') is null
                 or nullif(trim(a.value->>'shopify_inventory_item_id_snapshot'),'') is null
                 or (a.value->>'units_per_pack')::integer <= 0 or (a.value->>'ordered_units')::integer <> recommended_packs*(a.value->>'units_per_pack')::integer) then
    raise exception 'Fixed-pack allocations do not conserve the authoritative recommendation';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'normalized_size', a.value->>'normalized_size', 'model_design', a.value->>'model_design',
    'variant_id', a.value->>'variant_id', 'shopify_variant_id_snapshot', a.value->>'shopify_variant_id_snapshot',
    'shopify_inventory_item_id_snapshot', a.value->>'shopify_inventory_item_id_snapshot',
    'units_per_pack', (a.value->>'units_per_pack')::integer, 'ordered_units', (a.value->>'ordered_units')::integer
  ) order by a.value->>'normalized_size'), '[]'::jsonb)
    into canonical_allocations
  from jsonb_array_elements(authoritative_payload->'allocations') a;
  canonical_model_design := split_part(v_style_id, '::', 2);
  canonical_snapshot := jsonb_build_object(
    'source_type', 'fixed_pack_purchase_recommendation', 'supplier_id', v_supplier_id, 'style_id', v_style_id,
    'parent_product_id', v_parent_product_id, 'model_design', canonical_model_design, 'product_name', product_name,
    'pack_definition_id', source_snapshot->>'pack_definition_id', 'recommended_packs', recommended_packs,
    'recommended_units', recommended_units, 'units_per_pack', units_per_pack, 'allocations', canonical_allocations,
    'pack_cost_gbp', pack_cost_gbp, 'line_cost_gbp', line_cost_gbp, 'expected_profit_gbp', expected_profit_gbp,
    'product_moq_packs', product_moq_packs, 'currency', v_currency,
    'supplier_purchasing_rule', coalesce(source_snapshot->'supplier_purchasing_rule', '{}'::jsonb),
    'recommendation_evidence', coalesce(source_snapshot->'recommendation_evidence', '{}'::jsonb)
  );
  fingerprint := md5(canonical_snapshot::text);

  -- Serializes draft discovery/create for one operator/supplier/currency and
  -- serializes a repeated client action before any header/line/event writes.
  perform pg_advisory_xact_lock(hashtextextended(v_operator_id::text || ':' || v_supplier_id::text || ':' || v_currency, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_operator_id::text || ':' || v_idempotency_key, 0));
  select * into existing_idempotency from public.vault_fixed_pack_draft_idempotency i
    where i.operator_id=v_operator_id and i.idempotency_key=v_idempotency_key for update;
  if found then
    if existing_idempotency.fingerprint <> fingerprint or existing_idempotency.style_id <> v_style_id then
      raise exception 'Fixed-pack idempotency key was reused for a different recommendation';
    end if;
    return query select existing_idempotency.purchase_order_id, existing_idempotency.purchase_order_line_id, false, false, true;
    return;
  end if;

  if v_target_draft_id is not null then
    select * into selected_order from public.vault_purchase_orders po where po.id=v_target_draft_id for update;
    if not found or selected_order.created_by_operator_id is distinct from v_operator_id or selected_order.status <> 'draft'
       or selected_order.supplier_id is distinct from v_supplier_id or selected_order.currency is distinct from v_currency then
      raise exception 'Explicit fixed-pack draft target is not eligible';
    end if;
    if exists (select 1 from public.vault_purchase_order_lines l where l.purchase_order_id=selected_order.id and l.source_recommendation_type <> 'fixed_pack_purchase_recommendation') then
      raise exception 'Explicit fixed-pack draft target contains incompatible lines';
    end if;
  else
    select count(*) into eligible_count from public.vault_purchase_orders po
    where po.created_by_operator_id=v_operator_id and po.status='draft' and po.supplier_id=v_supplier_id and po.currency=v_currency
      and not exists (select 1 from public.vault_purchase_order_lines l where l.purchase_order_id=po.id and l.source_recommendation_type <> 'fixed_pack_purchase_recommendation');
    if eligible_count > 1 then raise exception 'Multiple eligible fixed-pack drafts require an explicit target'; end if;
    if eligible_count = 1 then select * into selected_order from public.vault_purchase_orders po where po.created_by_operator_id=v_operator_id and po.status='draft' and po.supplier_id=v_supplier_id and po.currency=v_currency and not exists (select 1 from public.vault_purchase_order_lines l where l.purchase_order_id=po.id and l.source_recommendation_type <> 'fixed_pack_purchase_recommendation') for update;
    else
      insert into public.vault_purchase_orders(supplier_id,status,currency,estimated_total_gbp,total_packs,recommended_by_vault_brain,created_by_operator_id,source_snapshot)
      values(v_supplier_id,'draft',v_currency,line_cost_gbp,recommended_packs,true,v_operator_id,jsonb_build_object('fixed_pack',true)) returning * into selected_order;
      result_created_draft := true;
    end if;
  end if;
  select * into selected_line from public.vault_purchase_order_lines l where l.purchase_order_id=selected_order.id and l.style_id=v_style_id for update;
  if found then
    if selected_line.source_recommendation_type <> 'fixed_pack_purchase_recommendation' or selected_line.source_snapshot->>'fingerprint' <> fingerprint then
      raise exception 'Fixed-pack recommendation changed; refresh before adding to draft';
    end if;
    insert into public.vault_fixed_pack_draft_idempotency values(v_operator_id,v_idempotency_key,fingerprint,v_style_id,selected_order.id,selected_line.id);
    return query select selected_order.id, selected_line.id, false, false, true; return;
  end if;
  insert into public.vault_purchase_order_lines(purchase_order_id,supplier_id,style_id,product_name,recommended_packs,recommended_units,units_per_pack,product_moq_packs,pack_cost_gbp,line_cost_gbp,expected_profit_gbp,source_recommendation_type,source_snapshot)
  values(selected_order.id,v_supplier_id,v_style_id,product_name,recommended_packs,recommended_units,units_per_pack,product_moq_packs,pack_cost_gbp,line_cost_gbp,expected_profit_gbp,'fixed_pack_purchase_recommendation',canonical_snapshot || jsonb_build_object('fingerprint',fingerprint)) returning * into selected_line;
  for allocation in select value from jsonb_array_elements(authoritative_payload->'allocations') loop
    if not exists (select 1 from public.vault_variants v where v.id=(allocation->>'variant_id')::uuid and v.product_id=v_parent_product_id and v.source='shopify' and v.source_active=true and v.identity_resolution_status='resolved' and v.model_design=allocation->>'model_design' and v.normalized_size=allocation->>'normalized_size' and v.source_variant_id=allocation->>'shopify_variant_id_snapshot' and v.source_inventory_item_id=allocation->>'shopify_inventory_item_id_snapshot' and v_parent_product_id::text || '::' || trim(v.model_design)=v_style_id) then
      raise exception 'Fixed-pack allocation variant is not a current resolved canonical style variant';
    end if;
    insert into public.vault_purchase_order_line_size_allocations(purchase_order_line_id,parent_product_id,model_design,normalized_size,variant_id,shopify_variant_id_snapshot,shopify_inventory_item_id_snapshot,units_per_pack,ordered_units)
    values(selected_line.id,v_parent_product_id,allocation->>'model_design',allocation->>'normalized_size',(allocation->>'variant_id')::uuid,allocation->>'shopify_variant_id_snapshot',allocation->>'shopify_inventory_item_id_snapshot',(allocation->>'units_per_pack')::integer,(allocation->>'ordered_units')::integer);
  end loop;
  insert into public.vault_purchase_order_events(purchase_order_id,purchase_order_line_id,operator_id,event_type,idempotency_key,event_snapshot)
  values(selected_order.id,selected_line.id,v_operator_id,'fixed_pack_recommendation_added_to_draft',v_idempotency_key,canonical_snapshot || jsonb_build_object('fingerprint',fingerprint));
  insert into public.vault_fixed_pack_draft_idempotency values(v_operator_id,v_idempotency_key,fingerprint,v_style_id,selected_order.id,selected_line.id);
  return query select selected_order.id, selected_line.id, result_created_draft, true, false;
end;
$function$;

revoke all on function public.add_fixed_pack_recommendation_to_draft(jsonb) from public, anon, authenticated;
grant execute on function public.add_fixed_pack_recommendation_to_draft(jsonb) to service_role;
notify pgrst, 'reload schema';
