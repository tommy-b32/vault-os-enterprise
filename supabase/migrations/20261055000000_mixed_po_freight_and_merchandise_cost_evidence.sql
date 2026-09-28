begin;

create table public.vault_purchase_order_freight_evidence (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.vault_purchase_orders(id) on delete restrict,
  supplier_id uuid not null references public.vault_suppliers(id) on delete restrict,
  shipment_reference text not null check (nullif(trim(shipment_reference), '') is not null),
  currency text not null check (currency in ('GBP','EUR','USD','TRY')),
  freight_amount numeric(12,2) not null check (freight_amount > 0),
  shipment_weight numeric(12,3) check (shipment_weight is null or shipment_weight > 0),
  weight_unit text check (weight_unit is null or weight_unit = 'kg'),
  evidence_classification text not null check (evidence_classification = 'supplier_shipment_freight'),
  source_note text not null check (nullif(trim(source_note), '') is not null),
  captured_by_operator_id uuid not null references public.vault_operators(id) on delete restrict,
  captured_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  idempotency_key text not null check (nullif(trim(idempotency_key), '') is not null),
  supersedes_evidence_id uuid references public.vault_purchase_order_freight_evidence(id) on delete restrict,
  unique (purchase_order_id, idempotency_key)
);

create table public.vault_purchase_order_line_merchandise_cost_evidence (
  id uuid primary key default gen_random_uuid(),
  purchase_order_line_id uuid not null unique references public.vault_purchase_order_lines(id) on delete restrict,
  purchase_order_id uuid not null references public.vault_purchase_orders(id) on delete restrict,
  supplier_id uuid not null references public.vault_suppliers(id) on delete restrict,
  supplier_currency text not null check (supplier_currency in ('GBP','EUR','USD','TRY')),
  merchandise_pack_cost numeric(12,2) not null check (merchandise_pack_cost > 0),
  merchandise_line_total numeric(12,2) not null check (merchandise_line_total > 0),
  pack_count integer not null check (pack_count > 0),
  units_per_pack integer not null check (units_per_pack > 0),
  merchandise_evidence_id uuid not null references public.vault_supplier_product_type_merchandise_cost_evidence(id) on delete restrict,
  cost_type_id text not null references public.vault_cost_types(id) on delete restrict,
  pack_profile_id text not null references public.vault_pack_profiles(id) on delete restrict,
  cost_completeness text not null check (cost_completeness = 'merchandise_only_landed_cost_pending'),
  source_snapshot jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  check (merchandise_line_total = round(merchandise_pack_cost * pack_count, 2))
);

-- This reserves purchasing capacity against an evidenced supplier liability.
-- It is deliberately separate from product landed-cost and payment settlement.
create table public.vault_purchase_order_fx_commitment_evidence (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.vault_purchase_orders(id) on delete restrict,
  supplier_id uuid not null references public.vault_suppliers(id) on delete restrict,
  source_currency text not null check (source_currency in ('GBP','EUR','USD','TRY')),
  supplier_liability_amount numeric(12,2) not null check (supplier_liability_amount > 0),
  fx_rate_to_gbp numeric(12,6) not null check (fx_rate_to_gbp > 0),
  gbp_commitment_amount numeric(12,2) not null check (gbp_commitment_amount > 0),
  evidence_classification text not null check (evidence_classification = 'supplier_liability_fx_commitment'),
  liability_evidence_mode text not null check (liability_evidence_mode in ('reconciled_immutable_po_evidence','operator_supplied_supplier_liability_evidence')),
  source_evidence_snapshot jsonb not null,
  source_note text not null check (nullif(trim(source_note), '') is not null),
  captured_by_operator_id uuid not null references public.vault_operators(id) on delete restrict,
  captured_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  idempotency_key text not null check (nullif(trim(idempotency_key), '') is not null),
  supersedes_evidence_id uuid references public.vault_purchase_order_fx_commitment_evidence(id) on delete restrict,
  unique (purchase_order_id, idempotency_key),
  check (gbp_commitment_amount = round(supplier_liability_amount * fx_rate_to_gbp, 2)),
  check (jsonb_typeof(source_evidence_snapshot) = 'object' and source_evidence_snapshot <> '{}'::jsonb)
);

create function public.reject_purchase_cost_evidence_mutation() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Purchase cost evidence is append-only'; end $$;
create trigger purchase_order_freight_evidence_immutable before update or delete on public.vault_purchase_order_freight_evidence for each row execute function public.reject_purchase_cost_evidence_mutation();
create trigger purchase_order_line_merchandise_cost_evidence_immutable before update or delete on public.vault_purchase_order_line_merchandise_cost_evidence for each row execute function public.reject_purchase_cost_evidence_mutation();
create trigger purchase_order_fx_commitment_evidence_immutable before update or delete on public.vault_purchase_order_fx_commitment_evidence for each row execute function public.reject_purchase_cost_evidence_mutation();

create function public.record_purchase_order_freight_evidence(authoritative_payload jsonb)
returns table(freight_evidence_id uuid,idempotent boolean) language plpgsql security invoker set search_path='' as $$
declare v_po uuid; v_supplier uuid; v_operator uuid; v_key text; existing public.vault_purchase_order_freight_evidence%rowtype;
begin
  v_po := (authoritative_payload->>'purchase_order_id')::uuid; v_supplier := (authoritative_payload->>'supplier_id')::uuid; v_operator := (authoritative_payload->>'operator_id')::uuid; v_key := nullif(trim(authoritative_payload->>'idempotency_key'),'');
  if v_po is null or v_supplier is null or v_operator is null or v_key is null then raise exception 'PO_FREIGHT_PAYLOAD_INVALID'; end if;
  if not exists(select 1 from public.vault_operators o where o.id=v_operator and o.is_active) then raise exception 'An active operator is required'; end if;
  if not exists(select 1 from public.vault_purchase_orders p where p.id=v_po and p.supplier_id=v_supplier and p.status='draft') then raise exception 'PO_FREIGHT_PO_INVALID'; end if;
  select * into existing from public.vault_purchase_order_freight_evidence where purchase_order_id=v_po and idempotency_key=v_key;
  if found then return query select existing.id,true; return; end if;
  insert into public.vault_purchase_order_freight_evidence(purchase_order_id,supplier_id,shipment_reference,currency,freight_amount,shipment_weight,weight_unit,evidence_classification,source_note,captured_by_operator_id,idempotency_key,supersedes_evidence_id)
  values(v_po,v_supplier,nullif(trim(authoritative_payload->>'shipment_reference'),''),upper(trim(authoritative_payload->>'currency')),(authoritative_payload->>'freight_amount')::numeric,(authoritative_payload->>'shipment_weight')::numeric,nullif(trim(authoritative_payload->>'weight_unit'),''),'supplier_shipment_freight',nullif(trim(authoritative_payload->>'source_note'),''),v_operator,v_key,nullif(authoritative_payload->>'supersedes_evidence_id','')::uuid) returning id into freight_evidence_id;
  return query select freight_evidence_id,false;
end $$;

create function public.record_purchase_order_fx_commitment_evidence(authoritative_payload jsonb)
returns table(fx_commitment_evidence_id uuid,idempotent boolean) language plpgsql security invoker set search_path='' as $$
declare
  v_po uuid; v_supplier uuid; v_operator uuid; v_key text; v_currency text;
  v_liability numeric(12,2); v_fx numeric(12,6); v_gbp numeric(12,2);
  v_mode text; v_snapshot jsonb; v_supersedes uuid;
  v_merchandise_total numeric(12,2); v_freight_total numeric(12,2); v_line_count integer; v_evidence_count integer; v_current_count integer;
  existing public.vault_purchase_order_fx_commitment_evidence%rowtype;
  superseded public.vault_purchase_order_fx_commitment_evidence%rowtype;
begin
  if authoritative_payload is null or jsonb_typeof(authoritative_payload) <> 'object' then raise exception 'PO_FX_COMMITMENT_PAYLOAD_INVALID'; end if;
  v_po := nullif(authoritative_payload->>'purchase_order_id','')::uuid;
  v_supplier := nullif(authoritative_payload->>'supplier_id','')::uuid;
  v_operator := nullif(authoritative_payload->>'operator_id','')::uuid;
  v_key := nullif(trim(authoritative_payload->>'idempotency_key'),'');
  v_currency := upper(nullif(trim(authoritative_payload->>'source_currency'),''));
  v_liability := nullif(authoritative_payload->>'supplier_liability_amount','')::numeric;
  v_fx := nullif(authoritative_payload->>'fx_rate_to_gbp','')::numeric;
  v_gbp := nullif(authoritative_payload->>'gbp_commitment_amount','')::numeric;
  v_mode := nullif(trim(authoritative_payload->>'liability_evidence_mode'),'');
  v_snapshot := authoritative_payload->'source_evidence_snapshot';
  v_supersedes := nullif(authoritative_payload->>'supersedes_evidence_id','')::uuid;
  if v_po is null or v_supplier is null or v_operator is null or v_key is null or v_currency is null or v_liability is null or v_fx is null or v_gbp is null or v_mode is null or v_snapshot is null or nullif(trim(authoritative_payload->>'source_note'),'') is null then raise exception 'PO_FX_COMMITMENT_PAYLOAD_INVALID'; end if;
  if not exists(select 1 from public.vault_operators o where o.id=v_operator and o.is_active) then raise exception 'An active operator is required'; end if;
  if not exists(select 1 from public.vault_purchase_orders p where p.id=v_po and p.supplier_id=v_supplier and p.status='draft') then raise exception 'PO_FX_COMMITMENT_PO_INVALID'; end if;
  if v_currency not in ('GBP','EUR','USD','TRY') or v_liability<=0 or v_fx<=0 or v_gbp<=0 or v_gbp<>round(v_liability*v_fx,2) then raise exception 'PO_FX_COMMITMENT_ARITHMETIC_INVALID'; end if;
  if v_mode not in ('reconciled_immutable_po_evidence','operator_supplied_supplier_liability_evidence') or jsonb_typeof(v_snapshot)<>'object' or v_snapshot='{}'::jsonb then raise exception 'PO_FX_COMMITMENT_PROVENANCE_INVALID'; end if;
  select * into existing from public.vault_purchase_order_fx_commitment_evidence where purchase_order_id=v_po and idempotency_key=v_key;
  if found then return query select existing.id,true; return; end if;
  select count(*) into v_current_count from public.vault_purchase_order_fx_commitment_evidence evidence where evidence.purchase_order_id=v_po and not exists(select 1 from public.vault_purchase_order_fx_commitment_evidence correction where correction.supersedes_evidence_id=evidence.id);
  if v_supersedes is null and v_current_count<>0 then raise exception 'PO_FX_COMMITMENT_CURRENT_EVIDENCE_EXISTS'; end if;
  if v_supersedes is not null and v_current_count<>1 then raise exception 'PO_FX_COMMITMENT_CURRENT_EVIDENCE_CONFLICT'; end if;
  if v_supersedes is not null then
    select * into superseded from public.vault_purchase_order_fx_commitment_evidence where id=v_supersedes for update;
    if not found or superseded.purchase_order_id<>v_po or superseded.supplier_id<>v_supplier or exists(select 1 from public.vault_purchase_order_fx_commitment_evidence correction where correction.supersedes_evidence_id=v_supersedes) then raise exception 'PO_FX_COMMITMENT_SUPERSESSION_INVALID'; end if;
  end if;
  if v_mode='reconciled_immutable_po_evidence' then
    select count(*) into v_line_count from public.vault_purchase_order_lines line where line.purchase_order_id=v_po;
    select count(*),coalesce(sum(evidence.merchandise_line_total),0) into v_evidence_count,v_merchandise_total from public.vault_purchase_order_line_merchandise_cost_evidence evidence where evidence.purchase_order_id=v_po and evidence.supplier_id=v_supplier and evidence.supplier_currency=v_currency;
    select coalesce(sum(freight.freight_amount),0) into v_freight_total from public.vault_purchase_order_freight_evidence freight where freight.purchase_order_id=v_po and freight.supplier_id=v_supplier and freight.currency=v_currency and not exists(select 1 from public.vault_purchase_order_freight_evidence correction where correction.supersedes_evidence_id=freight.id);
    if v_line_count=0 or v_evidence_count<>v_line_count or v_liability<>round(v_merchandise_total+v_freight_total,2) then raise exception 'PO_FX_COMMITMENT_LIABILITY_NOT_RECONCILED'; end if;
  end if;
  insert into public.vault_purchase_order_fx_commitment_evidence(purchase_order_id,supplier_id,source_currency,supplier_liability_amount,fx_rate_to_gbp,gbp_commitment_amount,evidence_classification,liability_evidence_mode,source_evidence_snapshot,source_note,captured_by_operator_id,idempotency_key,supersedes_evidence_id)
  values(v_po,v_supplier,v_currency,v_liability,v_fx,v_gbp,'supplier_liability_fx_commitment',v_mode,v_snapshot,nullif(trim(authoritative_payload->>'source_note'),''),v_operator,v_key,v_supersedes)
  returning id into fx_commitment_evidence_id;
  return query select fx_commitment_evidence_id,false;
end $$;

create view public.vault_purchase_order_landed_cost_completeness with (security_invoker=true) as
select po.id as purchase_order_id, case when exists(select 1 from public.vault_purchase_order_line_merchandise_cost_evidence line where line.purchase_order_id=po.id) or exists(select 1 from public.vault_purchase_order_freight_evidence freight where freight.purchase_order_id=po.id and not exists(select 1 from public.vault_purchase_order_freight_evidence correction where correction.supersedes_evidence_id=freight.id)) then 'landed_cost_pending' else 'complete_landed_cost' end as landed_cost_completeness
from public.vault_purchase_orders po;

create view public.vault_purchase_order_current_fx_commitment with (security_invoker=true) as
with current_evidence as (
  select evidence.*
  from public.vault_purchase_order_fx_commitment_evidence evidence
  where not exists (select 1 from public.vault_purchase_order_fx_commitment_evidence correction where correction.supersedes_evidence_id=evidence.id)
), counts as (
  select purchase_order_id,count(*)::integer as current_evidence_count
  from current_evidence
  group by purchase_order_id
)
select po.id as purchase_order_id,
  coalesce(counts.current_evidence_count,0) as current_evidence_count,
  case when coalesce(counts.current_evidence_count,0)=1 then 'available' when coalesce(counts.current_evidence_count,0)=0 then 'missing' else 'conflicting' end as commitment_evidence_state,
  case when counts.current_evidence_count=1 then (array_agg(evidence.id))[1] end as fx_commitment_evidence_id,
  case when counts.current_evidence_count=1 then min(evidence.source_currency) end as source_currency,
  case when counts.current_evidence_count=1 then min(evidence.supplier_liability_amount) end as supplier_liability_amount,
  case when counts.current_evidence_count=1 then min(evidence.fx_rate_to_gbp) end as fx_rate_to_gbp,
  case when counts.current_evidence_count=1 then min(evidence.gbp_commitment_amount) end as gbp_commitment_amount
from public.vault_purchase_orders po
left join counts on counts.purchase_order_id=po.id
left join current_evidence evidence on evidence.purchase_order_id=po.id
group by po.id,counts.current_evidence_count;

-- Supplier-liability FX commitments reserve purchasing capacity only. They do
-- not populate landed-cost or settlement columns on the canonical PO.
create or replace view public.vault_purchasing_wallet as
with ledger as (
  select coalesce(sum(amount_gbp), 0)::numeric(12, 2) as ledger_balance_gbp,
    max(updated_at) as last_updated_at
  from public.vault_cash_transactions
), commitment_rows as (
  select po.id,
    po.updated_at,
    po.paid_amount_gbp,
    po.actual_total_gbp,
    po.estimated_total_gbp,
    completeness.landed_cost_completeness,
    current_commitment.commitment_evidence_state,
    current_commitment.gbp_commitment_amount,
    case
      when po.actual_total_gbp is not null then false
      when completeness.landed_cost_completeness = 'landed_cost_pending'
        and current_commitment.commitment_evidence_state <> 'available' then true
      else false
    end as unresolved_commitment,
    case
      when po.actual_total_gbp is not null then greatest(po.actual_total_gbp - po.paid_amount_gbp, 0)
      when completeness.landed_cost_completeness = 'complete_landed_cost' then greatest(coalesce(po.estimated_total_gbp, 0) - po.paid_amount_gbp, 0)
      when completeness.landed_cost_completeness = 'landed_cost_pending'
        and current_commitment.commitment_evidence_state = 'available'
        then greatest(current_commitment.gbp_commitment_amount - po.paid_amount_gbp, 0)
      else null
    end as commitment_amount_gbp
  from public.vault_purchase_orders po
  join public.vault_purchase_order_landed_cost_completeness completeness on completeness.purchase_order_id=po.id
  join public.vault_purchase_order_current_fx_commitment current_commitment on current_commitment.purchase_order_id=po.id
  where po.status in ('approved', 'ordered', 'part_paid', 'shipped', 'received')
), commitments as (
  select coalesce(sum(commitment_amount_gbp), 0)::numeric(12, 2) as known_committed_orders_gbp,
    count(*) filter (where unresolved_commitment)::integer as unresolved_commitment_order_count,
    max(updated_at) as last_updated_at
  from commitment_rows
), policy as (
  select protected_reserve_gbp, manual_spending_limit_gbp, reserve_override_allowed,
    wallet_freshness_threshold_minutes, updated_at
  from public.vault_purchasing_policy where policy_key = 'primary'
), resolved as (
  select ledger.ledger_balance_gbp,
    coalesce(policy.protected_reserve_gbp, 0)::numeric(12, 2) as protected_reserve_gbp,
    commitments.known_committed_orders_gbp,
    commitments.unresolved_commitment_order_count,
    ledger.last_updated_at as ledger_last_updated_at,
    commitments.last_updated_at as commitments_last_updated_at,
    policy.manual_spending_limit_gbp,
    coalesce(policy.reserve_override_allowed, false) as reserve_override_allowed,
    policy.updated_at as policy_updated_at,
    policy.wallet_freshness_threshold_minutes
  from ledger cross join commitments left join policy on true
)
select ledger_balance_gbp,
  protected_reserve_gbp,
  case when unresolved_commitment_order_count > 0 then null else known_committed_orders_gbp end::numeric(12, 2) as committed_orders_gbp,
  case when unresolved_commitment_order_count > 0 then null else greatest(ledger_balance_gbp - protected_reserve_gbp - known_committed_orders_gbp, 0) end::numeric(12, 2) as calculated_purchasing_power_gbp,
  case when unresolved_commitment_order_count > 0 then null
    when manual_spending_limit_gbp is null then greatest(ledger_balance_gbp - protected_reserve_gbp - known_committed_orders_gbp, 0)
    else least(manual_spending_limit_gbp, greatest(ledger_balance_gbp - protected_reserve_gbp - known_committed_orders_gbp, 0))
  end::numeric(12, 2) as available_purchasing_power_gbp,
  manual_spending_limit_gbp,
  reserve_override_allowed,
  case
    when unresolved_commitment_order_count > 0 then 'unavailable'
    when ledger_balance_gbp <= 0 then 'no_cash'
    when ledger_balance_gbp - protected_reserve_gbp - known_committed_orders_gbp <= 0 then 'reserve_protected'
    when ledger_balance_gbp - protected_reserve_gbp - known_committed_orders_gbp < 500 then 'limited'
    else 'healthy'
  end as purchasing_power_state,
  case when unresolved_commitment_order_count > 0 then null else greatest(ledger_last_updated_at, commitments_last_updated_at, policy_updated_at) end as wallet_last_updated,
  wallet_freshness_threshold_minutes,
  unresolved_commitment_order_count
from resolved;

-- Preserve the complete-landed-cost approval contract while allowing a NULL
-- GBP line only when immutable merchandise evidence and a PO FX commitment
-- make the operational supplier liability governed and reserve-safe.
create or replace function public.approve_mixed_supplier_purchase_order(target_purchase_order_id uuid,target_operator_id uuid)
returns table(purchase_order_id uuid,status text,approved_by_operator_id uuid,approved_at timestamptz,transitioned boolean)
language plpgsql security invoker set search_path='' as $$
declare
  po public.vault_purchase_orders%rowtype;
  l public.vault_purchase_order_lines%rowtype;
  pending public.vault_pending_catalogue_products%rowtype;
  merchandise public.vault_purchase_order_line_merchandise_cost_evidence%rowtype;
  fx record;
  packs integer:=0; units integer:=0; total numeric:=0; complete_line_count integer:=0;
  allocation_packs integer; allocation_units integer; merchandise_count integer;
  expected_header_total numeric; landed_cost_state text; approved_time timestamptz;
begin
  if not exists(select 1 from public.vault_operators o where o.id=target_operator_id and o.is_active) then raise exception 'An active operator is required'; end if;
  select * into po from public.vault_purchase_orders where id=target_purchase_order_id for update;
  if not found then raise exception 'Purchase order was not found'; end if;
  if po.status='approved' and po.approved_by_operator_id is not null and po.approved_at is not null then return query select po.id,po.status,po.approved_by_operator_id,po.approved_at,false; return; end if;
  if po.status<>'draft' then raise exception 'PO_NOT_DRAFT'; end if;
  if not exists(select 1 from public.vault_suppliers s where s.id=po.supplier_id and s.is_active) then raise exception 'PO_SUPPLIER_INVALID'; end if;
  for l in select * from public.vault_purchase_order_lines where purchase_order_id=po.id for update loop
    if l.source_recommendation_type not in ('fixed_pack_purchase_recommendation','manual_fixed_pack_purchase','pending_catalogue_purchase') or l.supplier_id<>po.supplier_id or l.recommended_packs<=0 or l.units_per_pack<=0 or l.recommended_units<>l.recommended_packs*l.units_per_pack then raise exception 'MIXED_PO_LINE_INVALID'; end if;
    if l.pack_cost_gbp is not null and l.line_cost_gbp is not null then
      if l.pack_cost_gbp<=0 or l.line_cost_gbp<>round(l.pack_cost_gbp*l.recommended_packs,2) then raise exception 'MIXED_PO_LINE_INVALID'; end if;
      complete_line_count:=complete_line_count+1;
      total:=total+l.line_cost_gbp;
    elsif l.pack_cost_gbp is null and l.line_cost_gbp is null then
      select count(*) into merchandise_count from public.vault_purchase_order_line_merchandise_cost_evidence evidence where evidence.purchase_order_line_id=l.id;
      if merchandise_count<>1 then raise exception 'MIXED_PO_MERCHANDISE_EVIDENCE_REQUIRED'; end if;
      select * into merchandise from public.vault_purchase_order_line_merchandise_cost_evidence evidence where evidence.purchase_order_line_id=l.id for share;
      if merchandise.cost_completeness<>'merchandise_only_landed_cost_pending' or merchandise.purchase_order_id<>po.id or merchandise.supplier_id<>po.supplier_id or merchandise.pack_count<>l.recommended_packs or merchandise.units_per_pack<>l.units_per_pack or merchandise.merchandise_pack_cost<=0 or merchandise.merchandise_line_total<=0 or merchandise.merchandise_line_total<>round(merchandise.merchandise_pack_cost*merchandise.pack_count,2) or merchandise.supplier_currency not in ('GBP','EUR','USD','TRY') or not exists(select 1 from public.vault_cost_type_pack_profile_compatibilities compatibility where compatibility.cost_type_id=merchandise.cost_type_id and compatibility.pack_profile_id=merchandise.pack_profile_id and compatibility.active) then raise exception 'MIXED_PO_MERCHANDISE_EVIDENCE_INVALID'; end if;
      if (l.source_snapshot ? 'cost_type_id' and l.source_snapshot->>'cost_type_id'<>merchandise.cost_type_id) or (l.source_snapshot ? 'pack_profile_id' and l.source_snapshot->>'pack_profile_id'<>merchandise.pack_profile_id) then raise exception 'MIXED_PO_MERCHANDISE_EVIDENCE_INVALID'; end if;
    else
      raise exception 'MIXED_PO_LINE_INVALID';
    end if;
    select coalesce(sum(a.units_per_pack),0),coalesce(sum(a.ordered_units),0) into allocation_packs,allocation_units from public.vault_purchase_order_line_size_allocations a where a.purchase_order_line_id=l.id;
    if allocation_packs<>l.units_per_pack or allocation_units<>l.recommended_units or exists(select 1 from public.vault_purchase_order_line_size_allocations a where a.purchase_order_line_id=l.id and a.ordered_units<>l.recommended_packs*a.units_per_pack) then raise exception 'MIXED_PO_ALLOCATION_INVALID'; end if;
    if l.source_recommendation_type='pending_catalogue_purchase' then
      select p.* into pending from public.vault_purchase_order_line_size_allocations a join public.vault_pending_catalogue_products p on p.id=a.pending_catalogue_product_id where a.purchase_order_line_id=l.id limit 1;
      if not found or pending.supplier_id<>po.supplier_id or pending.status<>'pending' then raise exception 'PENDING_CATALOGUE_PRODUCT_INVALID'; end if;
      if exists(select 1 from public.vault_purchase_order_line_size_allocations a where a.purchase_order_line_id=l.id and (a.identity_mode<>'pending_catalogue' or a.pending_catalogue_product_id<>pending.id or a.ordered_units<=0)) then raise exception 'PENDING_CATALOGUE_ALLOCATION_INVALID'; end if;
    end if;
    packs:=packs+l.recommended_packs;
    units:=units+l.recommended_units;
  end loop;
  expected_header_total:=case when complete_line_count=0 then null else total end;
  if packs=0 or po.total_packs<>packs or po.estimated_total_gbp is distinct from expected_header_total then raise exception 'HEADER_TOTAL_MISMATCH'; end if;
  if complete_line_count<> (select count(*) from public.vault_purchase_order_lines line where line.purchase_order_id=po.id) then
    select landed_cost_completeness into landed_cost_state from public.vault_purchase_order_landed_cost_completeness where purchase_order_id=po.id;
    if landed_cost_state<>'landed_cost_pending' then raise exception 'MIXED_PO_LANDED_COST_COMPLETENESS_INVALID'; end if;
    select * into fx from public.vault_purchase_order_current_fx_commitment where purchase_order_id=po.id;
    if not found or fx.commitment_evidence_state<>'available' or fx.gbp_commitment_amount is null or fx.gbp_commitment_amount<=0 or not exists(select 1 from public.vault_purchase_order_fx_commitment_evidence evidence where evidence.id=fx.fx_commitment_evidence_id and evidence.purchase_order_id=po.id and evidence.supplier_id=po.supplier_id and evidence.gbp_commitment_amount=fx.gbp_commitment_amount and not exists(select 1 from public.vault_purchase_order_fx_commitment_evidence correction where correction.supersedes_evidence_id=evidence.id)) then raise exception 'MIXED_PO_FX_COMMITMENT_REQUIRED'; end if;
  end if;
  approved_time:=clock_timestamp();
  update public.vault_purchase_orders set status='approved',approved_by_operator_id=target_operator_id,approved_at=approved_time where id=po.id;
  insert into public.vault_purchase_order_events(purchase_order_id,operator_id,event_type,idempotency_key,event_snapshot) values(po.id,target_operator_id,'mixed_supplier_purchase_order_approved','mixed-approval:'||po.id::text,jsonb_build_object('total_packs',packs,'total_units',units,'total_gbp',expected_header_total));
  return query select po.id,'approved'::text,target_operator_id,approved_time,true;
end $$;

revoke all on function public.approve_mixed_supplier_purchase_order(uuid,uuid) from public,anon,authenticated;
grant execute on function public.approve_mixed_supplier_purchase_order(uuid,uuid) to service_role;

-- A separate transactional boundary for governed merchandise-only purchasing.
-- The established complete-landed-cost intake RPC remains untouched.
create function public.create_pending_catalogue_merchandise_only_purchase_line(authoritative_payload jsonb)
returns table(purchase_order_id uuid,purchase_order_line_id uuid,pending_catalogue_product_id uuid,idempotent boolean)
language plpgsql security invoker set search_path='' as $$
declare
  v_operator uuid; v_po uuid; v_supplier uuid; v_key text; v_title text; v_reference text;
  v_brand text; v_category text; v_colour_model text; v_model_design text; v_notes text;
  v_cost_type text; v_pack_profile text; v_pack_count integer; v_governed_units integer; v_ordered integer;
  v_snapshot jsonb; v_merchandise_line_total numeric(12,2);
  po public.vault_purchase_orders%rowtype; existing_event public.vault_purchase_order_events%rowtype;
  merchandise public.vault_supplier_product_type_merchandise_cost_evidence%rowtype;
  pending_id uuid; line_id uuid; size_row jsonb; merchandise_evidence_count integer;
begin
  if authoritative_payload is null or jsonb_typeof(authoritative_payload)<>'object'
    or jsonb_typeof(authoritative_payload->'sizes')<>'array'
    or jsonb_array_length(authoritative_payload->'sizes')=0 then
    raise exception 'PENDING_CATALOGUE_MERCHANDISE_ONLY_PAYLOAD_INVALID';
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
    v_cost_type:=nullif(trim(authoritative_payload->>'cost_type_id'),'');
    v_pack_profile:=nullif(trim(authoritative_payload->>'pack_profile_id'),'');
    v_pack_count:=(authoritative_payload->>'pack_count')::integer;
  exception when others then raise exception 'PENDING_CATALOGUE_MERCHANDISE_ONLY_PAYLOAD_INVALID'; end;
  if v_operator is null or v_po is null or v_supplier is null or v_key is null or v_title is null or v_model_design is null or v_cost_type is null or v_pack_profile is null or v_pack_count is null or v_pack_count<=0 then
    raise exception 'PENDING_CATALOGUE_MERCHANDISE_ONLY_PAYLOAD_INVALID';
  end if;
  if not exists(select 1 from public.vault_operators o where o.id=v_operator and o.is_active) then raise exception 'An active operator is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_po::text,0));
  perform pg_advisory_xact_lock(hashtextextended(v_operator::text||':'||v_key,0));
  select * into po from public.vault_purchase_orders where id=v_po for update;
  if not found or po.created_by_operator_id is distinct from v_operator then raise exception 'PENDING_CATALOGUE_DRAFT_NOT_FOUND'; end if;
  if po.status<>'draft' then raise exception 'PENDING_CATALOGUE_PO_NOT_DRAFT'; end if;
  if po.supplier_id<>v_supplier or not exists(select 1 from public.vault_suppliers s where s.id=v_supplier and s.is_active) then raise exception 'PENDING_CATALOGUE_SUPPLIER_INVALID'; end if;
  if exists(select 1 from public.vault_purchase_order_lines l where l.purchase_order_id=v_po and l.source_recommendation_type not in ('pending_catalogue_purchase','fixed_pack_purchase_recommendation','manual_fixed_pack_purchase')) then raise exception 'PENDING_CATALOGUE_SOURCE_INVALID'; end if;
  if not exists(select 1 from public.vault_cost_types t where t.id=v_cost_type and t.active) then raise exception 'PENDING_CATALOGUE_GOVERNED_CLASSIFICATION_INVALID'; end if;
  select p.units_per_pack into v_governed_units from public.vault_pack_profiles p where p.id=v_pack_profile and p.active for share;
  if v_governed_units is null or v_governed_units<=0 then raise exception 'PENDING_CATALOGUE_PACK_PROFILE_INVALID'; end if;
  if not exists(select 1 from public.vault_cost_type_pack_profile_compatibilities compatibility where compatibility.cost_type_id=v_cost_type and compatibility.pack_profile_id=v_pack_profile and compatibility.active) then raise exception 'PENDING_CATALOGUE_PACK_PROFILE_INCOMPATIBLE'; end if;
  if exists(select 1 from jsonb_array_elements(authoritative_payload->'sizes') s where jsonb_typeof(s.value)<>'object' or nullif(trim(s.value->>'supplier_size_label'),'') is null or nullif(trim(s.value->>'normalized_size'),'') is null or (s.value->>'units_per_pack') !~ '^[0-9]+$' or (s.value->>'units_per_pack')::integer<=0)
    or (select count(*) from jsonb_array_elements(authoritative_payload->'sizes'))<>(select count(distinct trim(s.value->>'normalized_size')) from jsonb_array_elements(authoritative_payload->'sizes') s)
    or (select coalesce(sum((s.value->>'units_per_pack')::integer),0) from jsonb_array_elements(authoritative_payload->'sizes') s)<>v_governed_units then raise exception 'PENDING_CATALOGUE_PACK_COMPOSITION_INVALID'; end if;
  select count(*) into merchandise_evidence_count from public.vault_supplier_product_type_merchandise_cost_evidence evidence where evidence.supplier_id=v_supplier and evidence.cost_type_id=v_cost_type and evidence.pack_profile_id=v_pack_profile and evidence.cost_scope='merchandise_only' and evidence.shipping_evidence_status='unknown' and evidence.supplier_currency in ('GBP','EUR','USD','TRY') and evidence.merchandise_pack_cost>0;
  if merchandise_evidence_count<>1 then raise exception 'PENDING_CATALOGUE_MERCHANDISE_EVIDENCE_UNAVAILABLE'; end if;
  select * into merchandise from public.vault_supplier_product_type_merchandise_cost_evidence evidence where evidence.supplier_id=v_supplier and evidence.cost_type_id=v_cost_type and evidence.pack_profile_id=v_pack_profile and evidence.cost_scope='merchandise_only' and evidence.shipping_evidence_status='unknown' and evidence.supplier_currency in ('GBP','EUR','USD','TRY') and evidence.merchandise_pack_cost>0 for share;
  v_ordered:=v_pack_count*v_governed_units;
  v_merchandise_line_total:=round(merchandise.merchandise_pack_cost*v_pack_count,2);
  v_snapshot:=jsonb_build_object('source_type','pending_catalogue_purchase','governed_intake',true,'commercial_evidence_mode','merchandise_only_landed_cost_pending','purchase_order_id',v_po,'supplier_id',v_supplier,'working_title',v_title,'supplier_reference',v_reference,'brand',v_brand,'product_category',v_category,'colour_model',v_colour_model,'model_design',v_model_design,'cost_type_id',v_cost_type,'pack_profile_id',v_pack_profile,'merchandise_evidence_id',merchandise.id,'supplier_currency',merchandise.supplier_currency,'merchandise_pack_cost',merchandise.merchandise_pack_cost,'merchandise_line_total',v_merchandise_line_total,'pack_count',v_pack_count,'units_per_pack',v_governed_units,'ordered_units',v_ordered,'sizes',authoritative_payload->'sizes');
  select * into existing_event from public.vault_purchase_order_events e where e.purchase_order_id=v_po and e.idempotency_key=v_key for update;
  if found then
    if existing_event.operator_id<>v_operator or existing_event.event_type<>'pending_catalogue_product_added_to_draft' or existing_event.event_snapshot is distinct from v_snapshot or existing_event.purchase_order_line_id is null then raise exception 'PENDING_CATALOGUE_IDEMPOTENCY_CONFLICT'; end if;
    select a.pending_catalogue_product_id into pending_id from public.vault_purchase_order_line_size_allocations a where a.purchase_order_line_id=existing_event.purchase_order_line_id limit 1;
    if pending_id is null then raise exception 'PENDING_CATALOGUE_IDEMPOTENCY_CONFLICT'; end if;
    return query select v_po,existing_event.purchase_order_line_id,pending_id,true; return;
  end if;
  insert into public.vault_pending_catalogue_products(supplier_id,supplier_reference,working_title,brand,product_category,colour_model,notes,created_by_operator_id,cost_type_id,pack_profile_id)
  values(v_supplier,v_reference,v_title,v_brand,v_category,v_colour_model,v_notes,v_operator,v_cost_type,v_pack_profile) returning id into pending_id;
  insert into public.vault_purchase_order_lines(purchase_order_id,supplier_id,style_id,product_name,recommended_packs,recommended_units,units_per_pack,product_moq_packs,pack_cost_gbp,line_cost_gbp,source_recommendation_type,source_snapshot)
  values(v_po,v_supplier,'pending_catalogue:'||pending_id::text,v_title,v_pack_count,v_ordered,v_governed_units,null,null,null,'pending_catalogue_purchase',v_snapshot) returning id into line_id;
  for size_row in select value from jsonb_array_elements(authoritative_payload->'sizes') loop
    insert into public.vault_purchase_order_line_size_allocations(purchase_order_line_id,pending_catalogue_product_id,supplier_size_label,identity_mode,model_design,normalized_size,units_per_pack,ordered_units)
    values(line_id,pending_id,trim(size_row->>'supplier_size_label'),'pending_catalogue',v_model_design,trim(size_row->>'normalized_size'),(size_row->>'units_per_pack')::integer,v_pack_count*(size_row->>'units_per_pack')::integer);
  end loop;
  insert into public.vault_purchase_order_line_merchandise_cost_evidence(purchase_order_line_id,purchase_order_id,supplier_id,supplier_currency,merchandise_pack_cost,merchandise_line_total,pack_count,units_per_pack,merchandise_evidence_id,cost_type_id,pack_profile_id,cost_completeness,source_snapshot)
  values(line_id,v_po,v_supplier,merchandise.supplier_currency,merchandise.merchandise_pack_cost,v_merchandise_line_total,v_pack_count,v_governed_units,merchandise.id,v_cost_type,v_pack_profile,'merchandise_only_landed_cost_pending',v_snapshot);
  update public.vault_purchase_orders set total_packs=(select sum(l.recommended_packs) from public.vault_purchase_order_lines l where l.purchase_order_id=v_po),estimated_total_gbp=(select sum(l.line_cost_gbp) from public.vault_purchase_order_lines l where l.purchase_order_id=v_po) where id=v_po;
  insert into public.vault_purchase_order_events(purchase_order_id,purchase_order_line_id,operator_id,event_type,idempotency_key,event_snapshot) values(v_po,line_id,v_operator,'pending_catalogue_product_added_to_draft',v_key,v_snapshot);
  return query select v_po,line_id,pending_id,false;
end $$;

revoke all on function public.create_pending_catalogue_merchandise_only_purchase_line(jsonb) from public,anon,authenticated;
grant execute on function public.create_pending_catalogue_merchandise_only_purchase_line(jsonb) to service_role;

alter table public.vault_purchase_order_freight_evidence enable row level security;
alter table public.vault_purchase_order_line_merchandise_cost_evidence enable row level security;
alter table public.vault_purchase_order_fx_commitment_evidence enable row level security;
revoke all on public.vault_purchase_order_freight_evidence, public.vault_purchase_order_line_merchandise_cost_evidence, public.vault_purchase_order_fx_commitment_evidence from public, anon, authenticated;
grant select, insert on public.vault_purchase_order_freight_evidence, public.vault_purchase_order_line_merchandise_cost_evidence, public.vault_purchase_order_fx_commitment_evidence to service_role;
revoke all on function public.record_purchase_order_freight_evidence(jsonb), public.record_purchase_order_fx_commitment_evidence(jsonb), public.reject_purchase_cost_evidence_mutation() from public, anon, authenticated;
grant execute on function public.record_purchase_order_freight_evidence(jsonb), public.record_purchase_order_fx_commitment_evidence(jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
