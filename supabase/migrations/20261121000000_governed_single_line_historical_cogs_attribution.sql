-- A narrowly-scoped, owner-attested historical COGS path.  This is deliberately
-- separate from class-wide historical policy: a proposal has one order line and
-- one approved delivery batch, and never changes product cost history.
begin;

create table public.vault_governed_historical_line_cogs_proposals (
  id uuid primary key default gen_random_uuid(),
  order_line_id uuid not null unique references public.vault_shopify_order_lines(id) on delete restrict,
  delivery_batch_id uuid not null references public.vault_historical_delivery_cost_batches(id) on delete restrict,
  unit_landed_cogs_gbp numeric(14,4) not null check (unit_landed_cogs_gbp >= 0),
  quantity integer not null check (quantity > 0),
  total_landed_cogs_gbp numeric(14,4) not null check (total_landed_cogs_gbp >= 0),
  owner_attestation text not null check (length(trim(owner_attestation)) > 0),
  proposed_by_operator_id uuid not null references public.vault_operators(id),
  proposed_at timestamptz not null default clock_timestamp(),
  approval_status text not null default 'PENDING' check (approval_status in ('PENDING','APPROVED','REJECTED')),
  approved_by_operator_id uuid references public.vault_operators(id),
  approved_at timestamptz,
  check ((approval_status = 'PENDING' and approved_by_operator_id is null and approved_at is null)
      or (approval_status in ('APPROVED','REJECTED') and approved_by_operator_id is not null and approved_at is not null)),
  check (total_landed_cogs_gbp = round(unit_landed_cogs_gbp * quantity, 4))
);

create table public.vault_governed_historical_line_cogs_proposal_audit (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.vault_governed_historical_line_cogs_proposals(id) on delete restrict,
  event_type text not null check (event_type in ('PROPOSED','APPROVED','REJECTED')),
  actor_operator_id uuid not null references public.vault_operators(id),
  note text not null check (length(trim(note)) > 0),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (proposal_id, event_type)
);

create function public.reject_governed_historical_line_cogs_audit_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'GOVERNED_HISTORICAL_LINE_COGS_AUDIT_APPEND_ONLY';
end $$;

create trigger vault_governed_historical_line_cogs_audit_append_only
before update or delete on public.vault_governed_historical_line_cogs_proposal_audit
for each row execute function public.reject_governed_historical_line_cogs_audit_mutation();

create function public.stage_governed_historical_line_cogs_proposal(
  p_order_line_id uuid,
  p_delivery_batch_id uuid,
  p_unit_landed_cogs_gbp numeric,
  p_owner_attestation text,
  p_actor_id uuid
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_line public.vault_shopify_order_lines%rowtype;
  v_sale_at timestamptz;
  v_batch public.vault_historical_delivery_cost_batches%rowtype;
  v_expected_unit numeric(14,4);
  v_proposal_id uuid;
begin
  if not exists (select 1 from public.vault_operators operator where operator.id = p_actor_id and operator.is_active) then
    raise exception 'GOVERNED_HISTORICAL_LINE_COGS_ACTIVE_OPERATOR_REQUIRED';
  end if;
  select l.* into v_line
  from public.vault_shopify_order_lines l
  where l.id = p_order_line_id
  for key share;
  if not found or v_line.cogs_quantity <= 0 then
    raise exception 'GOVERNED_HISTORICAL_LINE_COGS_INVALID_ORDER_LINE';
  end if;
  select o.shopify_created_at into v_sale_at
  from public.vault_shopify_orders o
  where o.id = v_line.order_id
  for key share;
  if not found then raise exception 'GOVERNED_HISTORICAL_LINE_COGS_ORDER_NOT_FOUND'; end if;
  if v_line.cogs_status = 'trusted' then
    raise exception 'GOVERNED_HISTORICAL_LINE_COGS_DIRECT_CONFLICT';
  end if;
  if exists (select 1 from public.vault_stage1_sold_line_cogs_resolutions r where r.order_line_id = p_order_line_id) then
    raise exception 'GOVERNED_HISTORICAL_LINE_COGS_RESOLVER_CONFLICT';
  end if;

  select * into v_batch
  from public.vault_historical_delivery_cost_batches
  where id = p_delivery_batch_id
  for key share;
  if not found or v_batch.receipt_status <> 'RECEIVED' or v_batch.validation_status <> 'VALID'
     or v_batch.approval_status <> 'APPROVED' or v_batch.received_at is null then
    raise exception 'GOVERNED_HISTORICAL_LINE_COGS_DELIVERY_NOT_ELIGIBLE';
  end if;
  if v_batch.received_at > v_sale_at then
    raise exception 'GOVERNED_HISTORICAL_LINE_COGS_POST_SALE_DELIVERY';
  end if;
  v_expected_unit := round(v_batch.landed_cost_gbp / v_batch.received_quantity, 4);
  if p_unit_landed_cogs_gbp is null or p_unit_landed_cogs_gbp <> v_expected_unit then
    raise exception 'GOVERNED_HISTORICAL_LINE_COGS_UNIT_MISMATCH';
  end if;

  insert into public.vault_governed_historical_line_cogs_proposals(
    order_line_id, delivery_batch_id, unit_landed_cogs_gbp, quantity, total_landed_cogs_gbp,
    owner_attestation, proposed_by_operator_id
  ) values (
    p_order_line_id, p_delivery_batch_id, v_expected_unit, v_line.cogs_quantity,
    round(v_expected_unit * v_line.cogs_quantity, 4), trim(p_owner_attestation), p_actor_id
  ) returning id into v_proposal_id;
  insert into public.vault_governed_historical_line_cogs_proposal_audit(
    proposal_id, event_type, actor_operator_id, note
  ) values (v_proposal_id, 'PROPOSED', p_actor_id, trim(p_owner_attestation));
  return v_proposal_id;
end $$;

create function public.decide_governed_historical_line_cogs_proposal(
  p_proposal_id uuid,
  p_decision text,
  p_approval_note text,
  p_actor_id uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_status text;
begin
  if p_decision not in ('APPROVED','REJECTED') or nullif(trim(p_approval_note),'') is null then
    raise exception 'GOVERNED_HISTORICAL_LINE_COGS_INVALID_DECISION';
  end if;
  if not exists (select 1 from public.vault_operators operator where operator.id = p_actor_id and operator.is_active and operator.role = 'owner') then
    raise exception 'GOVERNED_HISTORICAL_LINE_COGS_OWNER_APPROVAL_REQUIRED';
  end if;
  select approval_status into v_status from public.vault_governed_historical_line_cogs_proposals
  where id = p_proposal_id for update;
  if not found then raise exception 'GOVERNED_HISTORICAL_LINE_COGS_PROPOSAL_NOT_FOUND'; end if;
  if v_status <> 'PENDING' then raise exception 'GOVERNED_HISTORICAL_LINE_COGS_PROPOSAL_ALREADY_DECIDED'; end if;
  update public.vault_governed_historical_line_cogs_proposals
  set approval_status = p_decision, approved_by_operator_id = p_actor_id, approved_at = clock_timestamp()
  where id = p_proposal_id;
  insert into public.vault_governed_historical_line_cogs_proposal_audit(proposal_id,event_type,actor_operator_id,note)
  values (p_proposal_id,p_decision,p_actor_id,trim(p_approval_note));
end $$;

create view public.vault_governed_approved_historical_line_cogs_attributions
with (security_barrier = true, security_invoker = true) as
select p.id as attribution_id, p.order_line_id, l.order_id,
  'GOVERNED_SINGLE_LINE_HISTORICAL_DELIVERY'::text as evidence_method,
  'single_line_historical_delivery'::text as cogs_classification,
  p.total_landed_cogs_gbp as resolved_cogs_gbp,
  p.delivery_batch_id::text as provenance_id
from public.vault_governed_historical_line_cogs_proposals p
join public.vault_shopify_order_lines l on l.id = p.order_line_id
join public.vault_shopify_orders o on o.id = l.order_id
join public.vault_historical_delivery_cost_batches b on b.id = p.delivery_batch_id
where p.approval_status = 'APPROVED'
  and exists (select 1 from public.vault_governed_historical_line_cogs_proposal_audit a
              where a.proposal_id = p.id and a.event_type = 'APPROVED')
  and b.receipt_status = 'RECEIVED'
  and b.validation_status = 'VALID'
  and b.approval_status = 'APPROVED'
  and b.received_at is not null and b.received_at <= o.shopify_created_at
  and p.unit_landed_cogs_gbp = round(b.landed_cost_gbp / b.received_quantity, 4);

create or replace view public.vault_stage1_sold_line_cogs_resolutions
with (security_barrier = true, security_invoker = true) as
with direct as (
  select l.id order_line_id, l.order_id, 'DIRECT_TRUSTED_SALE_TIME_COGS'::text evidence_method,
    'direct'::text cogs_classification, l.total_cogs_gbp resolved_cogs_gbp, l.cogs_history_id::text provenance_id
  from public.vault_shopify_order_lines l
  where l.cogs_quantity > 0 and l.cogs_status='trusted' and l.cogs_history_id is not null
    and l.cogs_snapshotted_at is not null and l.unit_cogs_gbp is not null and l.unit_cogs_gbp >= 0
    and l.total_cogs_gbp is not null and l.total_cogs_gbp >= 0
), single_line as (
  select a.order_line_id,a.order_id,a.evidence_method,a.cogs_classification,a.resolved_cogs_gbp,a.provenance_id
  from public.vault_governed_approved_historical_line_cogs_attributions a
), policy as (
  select a.order_line_id,a.order_id,a.evidence_method,'policy_derived'::text cogs_classification,
    a.total_policy_derived_cogs_gbp resolved_cogs_gbp,a.policy_version_id::text || ':' || a.batch_evidence_id::text provenance_id
  from public.vault_historical_policy_derived_cogs_line_attributions a
  where a.evidence_method='POLICY_DERIVED_BATCH_AVERAGE'
), service as (
  select a.order_line_id,a.order_id,a.evidence_method,'historical_service'::text cogs_classification,
    a.total_direct_sale_time_cogs_gbp resolved_cogs_gbp,a.historical_service_treatment_evidence_id::text provenance_id
  from public.vault_historical_vaultcare_service_treatment_line_attributions a
  where a.evidence_method='HISTORICAL_OWNER_ATTESTED_NO_DIRECT_COGS_AT_SALE'
), candidates as (
  select * from direct union all
  select s.* from single_line s where not exists (select 1 from direct d where d.order_line_id=s.order_line_id) union all
  select p.* from policy p where not exists (select 1 from direct d where d.order_line_id=p.order_line_id)
    and not exists (select 1 from single_line s where s.order_line_id=p.order_line_id) union all
  select s.* from service s where not exists (select 1 from direct d where d.order_line_id=s.order_line_id)
    and not exists (select 1 from single_line h where h.order_line_id=s.order_line_id)
    and not exists (select 1 from policy p where p.order_line_id=s.order_line_id)
), counted as (select c.*,count(*) over (partition by order_line_id) candidate_count from candidates c)
select order_line_id,order_id,evidence_method,cogs_classification,resolved_cogs_gbp,provenance_id
from counted where candidate_count=1;

alter table public.vault_governed_historical_line_cogs_proposals enable row level security;
alter table public.vault_governed_historical_line_cogs_proposal_audit enable row level security;
revoke all on public.vault_governed_historical_line_cogs_proposals, public.vault_governed_historical_line_cogs_proposal_audit from public, anon, authenticated, service_role;
revoke all on public.vault_governed_approved_historical_line_cogs_attributions from public, anon, authenticated;
grant select on public.vault_governed_historical_line_cogs_proposals, public.vault_governed_historical_line_cogs_proposal_audit, public.vault_governed_approved_historical_line_cogs_attributions to service_role;
revoke all on function public.stage_governed_historical_line_cogs_proposal(uuid,uuid,numeric,text,uuid), public.decide_governed_historical_line_cogs_proposal(uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.stage_governed_historical_line_cogs_proposal(uuid,uuid,numeric,text,uuid), public.decide_governed_historical_line_cogs_proposal(uuid,text,text,uuid) to service_role;
revoke all on function public.reject_governed_historical_line_cogs_audit_mutation() from public, anon, authenticated, service_role;
notify pgrst, 'reload schema';
commit;
