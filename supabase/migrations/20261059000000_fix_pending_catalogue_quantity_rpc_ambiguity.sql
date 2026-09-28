begin;

create or replace function public.update_pending_catalogue_purchase_line_pack_count(authoritative_payload jsonb)
returns table(
  purchase_order_id uuid,
  purchase_order_line_id uuid,
  pack_count integer,
  ordered_units integer,
  idempotent boolean
)
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_operator uuid;
  v_po uuid;
  v_line uuid;
  v_key text;
  v_pack_count integer;
  v_units_per_pack integer;
  v_ordered_units integer;
  v_merchandise public.vault_purchase_order_line_merchandise_cost_evidence%rowtype;
  v_snapshot jsonb;
  v_event_snapshot jsonb;
  v_existing_event public.vault_purchase_order_events%rowtype;
begin
  if authoritative_payload is null or jsonb_typeof(authoritative_payload) <> 'object' then
    raise exception 'PENDING_CATALOGUE_QUANTITY_PAYLOAD_INVALID';
  end if;

  begin
    v_operator := (authoritative_payload->>'operator_id')::uuid;
    v_po := (authoritative_payload->>'purchase_order_id')::uuid;
    v_line := (authoritative_payload->>'purchase_order_line_id')::uuid;
    v_key := nullif(trim(authoritative_payload->>'idempotency_key'), '');
    v_pack_count := (authoritative_payload->>'pack_count')::integer;
  exception when others then
    raise exception 'PENDING_CATALOGUE_QUANTITY_PAYLOAD_INVALID';
  end;

  if v_operator is null or v_po is null or v_line is null or v_key is null
    or length(v_key) > 200 or v_pack_count is null or v_pack_count <= 0 then
    raise exception 'PENDING_CATALOGUE_QUANTITY_PAYLOAD_INVALID';
  end if;

  if not exists (
    select 1 from public.vault_operators o
    where o.id = v_operator and o.is_active
  ) then
    raise exception 'An active operator is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_po::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_operator::text || ':' || v_key, 0));

  perform 1
  from public.vault_purchase_orders po
  where po.id = v_po
    and po.status = 'draft'
    and po.created_by_operator_id = v_operator
  for update;
  if not found then
    raise exception 'PENDING_CATALOGUE_QUANTITY_PO_INVALID';
  end if;

  select l.units_per_pack
  into v_units_per_pack
  from public.vault_purchase_order_lines l
  where l.id = v_line
    and l.purchase_order_id = v_po
    and l.source_recommendation_type = 'pending_catalogue_purchase'
    and l.units_per_pack > 0
  for update;

  if not found then
    raise exception 'PENDING_CATALOGUE_QUANTITY_LINE_INVALID';
  end if;

  if exists (
    select 1 from public.vault_purchase_order_freight_evidence f
    where f.purchase_order_id = v_po
  ) or exists (
    select 1 from public.vault_purchase_order_fx_commitment_evidence fx
    where fx.purchase_order_id = v_po
  ) then
    raise exception 'PENDING_CATALOGUE_QUANTITY_COST_EVIDENCE_ALREADY_RECORDED';
  end if;

  select *
  into v_merchandise
  from public.vault_purchase_order_line_merchandise_cost_evidence e
  where e.purchase_order_line_id = v_line
    and e.purchase_order_id = v_po
  for update;

  if not found
    or v_merchandise.cost_completeness <> 'merchandise_only_landed_cost_pending'
    or v_merchandise.units_per_pack <> v_units_per_pack then
    raise exception 'PENDING_CATALOGUE_QUANTITY_MERCHANDISE_EVIDENCE_INVALID';
  end if;

  if not exists (
    select 1
    from public.vault_purchase_order_line_size_allocations a
    where a.purchase_order_line_id = v_line
      and a.identity_mode = 'pending_catalogue'
      and a.units_per_pack > 0
  ) or exists (
    select 1
    from public.vault_purchase_order_line_size_allocations a
    where a.purchase_order_line_id = v_line
      and (
        a.identity_mode <> 'pending_catalogue'
        or a.units_per_pack <= 0
        or a.pending_catalogue_product_id is null
      )
  ) or (
    select coalesce(sum(a.units_per_pack), 0)
    from public.vault_purchase_order_line_size_allocations a
    where a.purchase_order_line_id = v_line
  ) <> v_units_per_pack then
    raise exception 'PENDING_CATALOGUE_QUANTITY_ALLOCATION_INVALID';
  end if;

  v_ordered_units := v_pack_count * v_units_per_pack;
  v_event_snapshot := jsonb_build_object(
    'purchase_order_id', v_po,
    'purchase_order_line_id', v_line,
    'pack_count', v_pack_count,
    'units_per_pack', v_units_per_pack,
    'ordered_units', v_ordered_units
  );

  select *
  into v_existing_event
  from public.vault_purchase_order_events e
  where e.purchase_order_id = v_po
    and e.idempotency_key = v_key
  for update;

  if found then
    if v_existing_event.operator_id <> v_operator
      or v_existing_event.purchase_order_line_id <> v_line
      or v_existing_event.event_type <> 'pending_catalogue_pack_quantity_updated'
      or v_existing_event.event_snapshot is distinct from v_event_snapshot then
      raise exception 'PENDING_CATALOGUE_QUANTITY_IDEMPOTENCY_CONFLICT';
    end if;
    return query select v_po, v_line, v_pack_count, v_ordered_units, true;
    return;
  end if;

  v_snapshot := coalesce(v_merchandise.source_snapshot, '{}'::jsonb)
    || jsonb_build_object(
      'pack_count', v_pack_count,
      'ordered_units', v_ordered_units,
      'merchandise_line_total', round(v_merchandise.merchandise_pack_cost * v_pack_count, 2)
    );

  update public.vault_purchase_order_lines as l
  set recommended_packs = v_pack_count,
      recommended_units = v_ordered_units,
      source_snapshot = coalesce(l.source_snapshot, '{}'::jsonb)
        || jsonb_build_object(
          'pack_count', v_pack_count,
          'ordered_units', v_ordered_units,
          'merchandise_line_total', round(v_merchandise.merchandise_pack_cost * v_pack_count, 2)
        )
  where l.id = v_line;

  update public.vault_purchase_order_line_size_allocations as a
  set ordered_units = v_pack_count * a.units_per_pack
  where a.purchase_order_line_id = v_line;

  perform set_config('vault.allow_draft_merchandise_quantity_update', 'on', true);
  update public.vault_purchase_order_line_merchandise_cost_evidence as e
  set pack_count = v_pack_count,
      merchandise_line_total = round(e.merchandise_pack_cost * v_pack_count, 2),
      source_snapshot = v_snapshot
  where e.id = v_merchandise.id;
  perform set_config('vault.allow_draft_merchandise_quantity_update', 'off', true);

  update public.vault_purchase_orders as po
  set total_packs = (
        select sum(l.recommended_packs)
        from public.vault_purchase_order_lines l
        where l.purchase_order_id = v_po
      ),
      estimated_total_gbp = (
        select sum(l.line_cost_gbp)
        from public.vault_purchase_order_lines l
        where l.purchase_order_id = v_po
      )
  where po.id = v_po;

  insert into public.vault_purchase_order_events(
    purchase_order_id,
    purchase_order_line_id,
    operator_id,
    event_type,
    idempotency_key,
    event_snapshot
  )
  values(
    v_po,
    v_line,
    v_operator,
    'pending_catalogue_pack_quantity_updated',
    v_key,
    v_event_snapshot
  );

  return query select v_po, v_line, v_pack_count, v_ordered_units, false;
end
$$;

commit;
