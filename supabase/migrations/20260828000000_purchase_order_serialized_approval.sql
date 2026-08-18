create function public.approve_vault_purchase_order(
  target_purchase_order_id uuid,
  target_operator_id uuid,
  canonical_qualification jsonb
)
returns table (
  purchase_order_id uuid,
  status text,
  approved_by_operator_id uuid,
  approved_at timestamptz,
  transitioned boolean
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  purchase_order public.vault_purchase_orders%rowtype;
  supplier public.vault_suppliers%rowtype;
  current_minimum_packs integer;
  expected_supplier_id uuid;
  expected_supplier_currency text;
  expected_minimum_packs integer;
  expected_minimum_value numeric(12, 2);
  expected_total_packs integer;
  expected_total_units integer;
  expected_total_gbp numeric(12, 2);
  qualification_evaluated_at timestamptz;
  wallet record;
  next_approved_at timestamptz;
begin
  if not exists (
    select 1
    from public.vault_operators operator
    where operator.id = target_operator_id
      and operator.is_active
  ) then
    raise exception 'An active operator is required';
  end if;

  select * into purchase_order
  from public.vault_purchase_orders po
  where po.id = target_purchase_order_id
  for update;

  if not found then
    raise exception 'Purchase order was not found';
  end if;

  if purchase_order.status = 'approved'
    and purchase_order.approved_by_operator_id is not null
    and purchase_order.approved_at is not null then
    return query select purchase_order.id, purchase_order.status,
      purchase_order.approved_by_operator_id, purchase_order.approved_at, false;
    return;
  end if;

  if purchase_order.status <> 'draft' then
    raise exception 'Purchase order cannot be approved from status %', purchase_order.status;
  end if;

  -- Every approval competes for the same canonical purchasing wallet. This
  -- transaction lock serializes capacity decisions without moving the
  -- TypeScript Purchase Intelligence algorithms into PostgreSQL.
  perform pg_advisory_xact_lock(9132026082800000);

  if canonical_qualification is null
    or jsonb_typeof(canonical_qualification) <> 'object'
    or jsonb_typeof(canonical_qualification->'lines') <> 'array'
    or jsonb_array_length(canonical_qualification->'lines') = 0 then
    raise exception 'Current canonical purchasing qualification is unavailable';
  end if;

  begin
    expected_supplier_id := (canonical_qualification->>'supplier_id')::uuid;
    expected_minimum_packs := (canonical_qualification->>'supplier_minimum_packs')::integer;
    expected_minimum_value := (canonical_qualification->>'supplier_minimum_value')::numeric;
    expected_total_packs := (canonical_qualification->>'total_packs')::integer;
    expected_total_units := (canonical_qualification->>'total_units')::integer;
    expected_total_gbp := (canonical_qualification->>'total_gbp')::numeric;
    qualification_evaluated_at := (canonical_qualification->>'evaluated_at')::timestamptz;
  exception when others then
    raise exception 'Current canonical purchasing qualification is invalid';
  end;
  expected_supplier_currency := nullif(canonical_qualification->>'supplier_currency', '');

  if qualification_evaluated_at is null
    or qualification_evaluated_at > now() + interval '1 minute'
    or qualification_evaluated_at < now() - interval '5 minutes' then
    raise exception 'Current canonical purchasing qualification is stale; refresh Purchase Intelligence and try again';
  end if;
  if canonical_qualification->>'qualification_state' <> 'ready_to_purchase'
    or canonical_qualification->>'basket_state' <> 'READY_TO_ORDER'
    or jsonb_typeof(canonical_qualification->'qualification_blockers') <> 'array'
    or jsonb_array_length(canonical_qualification->'qualification_blockers') <> 0 then
    raise exception 'Current canonical purchasing qualification does not permit approval';
  end if;
  if expected_supplier_id is distinct from purchase_order.supplier_id then
    raise exception 'Saved draft supplier does not match current canonical purchasing qualification';
  end if;
  if expected_total_packs is null or expected_total_packs <= 0
    or expected_total_units is null or expected_total_units <= 0
    or expected_total_gbp is null or expected_total_gbp <= 0 then
    raise exception 'Current canonical basket totals are unavailable';
  end if;

  select * into supplier
  from public.vault_suppliers current_supplier
  where current_supplier.id = purchase_order.supplier_id;
  if not found or not supplier.is_active then
    raise exception 'The canonical supplier is inactive or unavailable';
  end if;

  select rule.minimum_order_packs into current_minimum_packs
  from public.vault_supplier_purchasing_rules rule
  where rule.supplier_id = purchase_order.supplier_id;

  if supplier.currency_code is distinct from expected_supplier_currency
    or supplier.minimum_order_value is distinct from expected_minimum_value
    or current_minimum_packs is distinct from expected_minimum_packs then
    raise exception 'Supplier purchasing policy changed during approval; refresh Purchase Intelligence and try again';
  end if;
  if expected_supplier_currency is distinct from 'GBP' then
    raise exception 'Supplier currency basket evaluation is unavailable';
  end if;
  if expected_minimum_packs is null or expected_total_packs < expected_minimum_packs then
    raise exception 'The supplier minimum pack quantity is not satisfied by the exact saved basket';
  end if;
  if expected_minimum_value is not null
    and expected_minimum_value > 0
    and expected_total_gbp < expected_minimum_value then
    raise exception 'The supplier minimum order value is not satisfied by the exact saved basket';
  end if;

  if (select count(*) from jsonb_array_elements(canonical_qualification->'lines')) <>
     (select count(distinct line->>'style_id') from jsonb_array_elements(canonical_qualification->'lines') line) then
    raise exception 'Canonical basket contains duplicate product lines';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(canonical_qualification->'lines') as expected(
      supplier_id uuid,
      style_id text,
      product_name text,
      recommended_packs integer,
      recommended_units integer,
      units_per_pack integer,
      pack_cost_gbp numeric,
      line_cost_gbp numeric,
      source_recommendation_type text
    )
    where expected.supplier_id is distinct from expected_supplier_id
       or expected.style_id is null
       or length(trim(expected.style_id)) = 0
       or expected.recommended_packs <= 0
       or expected.units_per_pack <= 0
       or expected.recommended_units is distinct from expected.recommended_packs * expected.units_per_pack
       or expected.pack_cost_gbp <= 0
       or expected.line_cost_gbp is distinct from round(expected.pack_cost_gbp * expected.recommended_packs, 2)
       or expected.source_recommendation_type not in (
         'purchase_intelligence_required',
         'purchase_intelligence_bring_forward'
       )
  ) then
    raise exception 'Current canonical basket line evidence is internally inconsistent';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(canonical_qualification->'lines') as expected(
      supplier_id uuid,
      style_id text,
      product_name text,
      recommended_packs integer,
      recommended_units integer,
      units_per_pack integer,
      pack_cost_gbp numeric,
      line_cost_gbp numeric,
      source_recommendation_type text
    )
    full join (
      select line.*
      from public.vault_purchase_order_lines line
      where line.purchase_order_id = purchase_order.id
    ) persisted
      on persisted.style_id = expected.style_id
    where expected.style_id is null
       or persisted.id is null
       or persisted.supplier_id is distinct from expected.supplier_id
       or persisted.product_name is distinct from expected.product_name
       or persisted.recommended_packs is distinct from expected.recommended_packs
       or persisted.recommended_units is distinct from expected.recommended_units
       or persisted.units_per_pack is distinct from expected.units_per_pack
       or persisted.pack_cost_gbp is distinct from expected.pack_cost_gbp
       or persisted.line_cost_gbp is distinct from expected.line_cost_gbp
       or persisted.source_recommendation_type is distinct from expected.source_recommendation_type
  ) then
    raise exception 'Saved draft no longer exactly matches the current canonical supplier basket; create a new draft from Purchase Intelligence';
  end if;

  if purchase_order.total_packs is distinct from expected_total_packs
    or purchase_order.estimated_total_gbp is distinct from expected_total_gbp
    or purchase_order.currency is distinct from 'GBP'
    or (select coalesce(sum(line.recommended_packs), 0)
        from public.vault_purchase_order_lines line
        where line.purchase_order_id = purchase_order.id) is distinct from expected_total_packs
    or (select coalesce(sum(line.recommended_units), 0)
        from public.vault_purchase_order_lines line
        where line.purchase_order_id = purchase_order.id) is distinct from expected_total_units
    or (select coalesce(sum(line.line_cost_gbp), 0)
        from public.vault_purchase_order_lines line
        where line.purchase_order_id = purchase_order.id) is distinct from expected_total_gbp then
    raise exception 'Saved draft totals no longer exactly match the current canonical supplier basket; create a new draft from Purchase Intelligence';
  end if;

  -- This read occurs only after the global approval lock is held. A competing
  -- approval therefore sees commitments created by the preceding transaction.
  select * into wallet from public.vault_purchasing_wallet;
  if not found
    or wallet.wallet_last_updated is null
    or wallet.wallet_freshness_threshold_minutes is null then
    raise exception 'The canonical purchasing wallet is unavailable';
  end if;
  if wallet.wallet_last_updated < now() - make_interval(mins => wallet.wallet_freshness_threshold_minutes) then
    raise exception 'The canonical purchasing wallet is stale';
  end if;
  if expected_total_gbp > wallet.available_purchasing_power_gbp
    or wallet.ledger_balance_gbp - wallet.protected_reserve_gbp
      - wallet.committed_orders_gbp - expected_total_gbp < 0 then
    raise exception 'The exact saved basket exceeds current reserve-safe purchasing capacity';
  end if;

  next_approved_at := now();
  update public.vault_purchase_orders po
  set status = 'approved',
      approved_by_operator_id = target_operator_id,
      approved_at = next_approved_at
  where po.id = purchase_order.id
    and po.status = 'draft';

  if not found then
    raise exception 'Purchase order approval lost its canonical draft state';
  end if;

  return query select purchase_order.id, 'approved'::text,
    target_operator_id, next_approved_at, true;
end;
$function$;

revoke all on function public.approve_vault_purchase_order(uuid, uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.approve_vault_purchase_order(uuid, uuid, jsonb)
to service_role;

notify pgrst, 'reload schema';
