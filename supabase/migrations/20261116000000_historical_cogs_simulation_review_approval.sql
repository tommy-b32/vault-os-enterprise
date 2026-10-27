-- Immutable, inactive-only review and owner approval for Exclusive Tee COGS drafts.
-- This migration deliberately creates no attribution, policy activation, or cost recalculation path.
begin;

create function public.assert_historical_cogs_policy_owner(p_operator_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.vault_operators
    where id = p_operator_id and is_active and role = 'owner'
  ) then
    raise exception 'HISTORICAL_COGS_POLICY_OWNER_UNAUTHORISED';
  end if;
end;
$$;

create table public.vault_historical_cogs_simulation_reviews (
  id uuid primary key default gen_random_uuid(),
  draft_policy_version_id uuid not null references public.vault_historical_cogs_policy_versions(id) on delete restrict,
  policy_rule text not null check (policy_rule = 'date_only_receipts_eligible_following_europe_london_calendar_day_v1'),
  simulation_input_sha256 text not null check (simulation_input_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  simulation_resolution_sha256 text not null check (simulation_resolution_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  simulator_code_sha256 text not null check (simulator_code_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  per_line_report_sha256 text not null check (per_line_report_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  calculated_line_count integer not null check (calculated_line_count >= 0),
  returned_restocked_line_count integer not null check (returned_restocked_line_count >= 0),
  same_day_receipt_warning_count integer not null check (same_day_receipt_warning_count >= 0),
  exception_summary jsonb not null check (jsonb_typeof(exception_summary) = 'object'),
  simulated_cogs_gbp numeric not null check (simulated_cogs_gbp >= 0),
  existing_policy_cogs_gbp numeric not null check (existing_policy_cogs_gbp >= 0),
  simulated_closing_inventory_units integer not null check (simulated_closing_inventory_units >= 0),
  simulated_closing_inventory_landed_gbp numeric not null check (simulated_closing_inventory_landed_gbp >= 0),
  created_by_operator_id uuid not null references public.vault_operators(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (draft_policy_version_id, simulation_input_sha256, simulation_resolution_sha256, simulator_code_sha256, per_line_report_sha256)
);

create table public.vault_historical_cogs_simulation_review_evidence (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.vault_historical_cogs_simulation_reviews(id) on delete restrict,
  evidence_kind text not null check (evidence_kind in ('legacy_supplier_batch', 'governed_historical_delivery')),
  legacy_batch_evidence_id uuid references public.vault_historical_supplier_batch_evidence(id) on delete restrict,
  governed_delivery_batch_id uuid references public.vault_historical_delivery_cost_batches(id) on delete restrict,
  governed_approval_revision bigint check (governed_approval_revision > 0),
  check (
    (evidence_kind = 'legacy_supplier_batch' and legacy_batch_evidence_id is not null and governed_delivery_batch_id is null and governed_approval_revision is null)
    or
    (evidence_kind = 'governed_historical_delivery' and legacy_batch_evidence_id is null and governed_delivery_batch_id is not null and governed_approval_revision is not null)
  ),
  unique (review_id, legacy_batch_evidence_id),
  unique (review_id, governed_delivery_batch_id)
);

create table public.vault_historical_cogs_simulation_review_approvals (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.vault_historical_cogs_simulation_reviews(id) on delete restrict,
  draft_policy_version_id uuid not null references public.vault_historical_cogs_policy_versions(id) on delete restrict,
  policy_rule text not null check (policy_rule = 'date_only_receipts_eligible_following_europe_london_calendar_day_v1'),
  simulation_input_sha256 text not null check (simulation_input_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  simulation_resolution_sha256 text not null check (simulation_resolution_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  simulator_code_sha256 text not null check (simulator_code_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  per_line_report_sha256 text not null check (per_line_report_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  approval_note text not null check (nullif(trim(approval_note), '') is not null),
  approved_by_operator_id uuid not null references public.vault_operators(id) on delete restrict,
  approved_at timestamptz not null default now()
);

create trigger historical_cogs_simulation_review_immutable
before update or delete on public.vault_historical_cogs_simulation_reviews
for each row execute function public.reject_historical_cogs_evidence_mutation();
create trigger historical_cogs_simulation_review_evidence_immutable
before update or delete on public.vault_historical_cogs_simulation_review_evidence
for each row execute function public.reject_historical_cogs_evidence_mutation();
create trigger historical_cogs_simulation_review_approval_immutable
before update or delete on public.vault_historical_cogs_simulation_review_approvals
for each row execute function public.reject_historical_cogs_evidence_mutation();

alter table public.vault_historical_cogs_simulation_reviews enable row level security;
alter table public.vault_historical_cogs_simulation_review_evidence enable row level security;
alter table public.vault_historical_cogs_simulation_review_approvals enable row level security;
revoke all on public.vault_historical_cogs_simulation_reviews, public.vault_historical_cogs_simulation_review_evidence, public.vault_historical_cogs_simulation_review_approvals from public, anon, authenticated, service_role;
grant select on public.vault_historical_cogs_simulation_reviews, public.vault_historical_cogs_simulation_review_evidence, public.vault_historical_cogs_simulation_review_approvals to service_role;

create function public.create_exclusive_tee_historical_cogs_simulation_review(
  p_draft_policy_version_id uuid,
  p_policy_rule text,
  p_simulation_input_sha256 text,
  p_simulation_resolution_sha256 text,
  p_simulator_code_sha256 text,
  p_per_line_report_sha256 text,
  p_calculated_line_count integer,
  p_returned_restocked_line_count integer,
  p_same_day_receipt_warning_count integer,
  p_exception_summary jsonb,
  p_simulated_cogs_gbp numeric,
  p_existing_policy_cogs_gbp numeric,
  p_simulated_closing_inventory_units integer,
  p_simulated_closing_inventory_landed_gbp numeric,
  p_actor_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_review_id uuid; v_status text; v_legacy_count integer; v_governed_count integer;
begin
  perform public.assert_governed_historical_delivery_operator(p_actor_id);
  if p_policy_rule <> 'date_only_receipts_eligible_following_europe_london_calendar_day_v1'
    or p_simulation_input_sha256 !~ '^[0-9A-Fa-f]{64}$'
    or p_simulation_resolution_sha256 !~ '^[0-9A-Fa-f]{64}$'
    or p_simulator_code_sha256 !~ '^[0-9A-Fa-f]{64}$'
    or p_per_line_report_sha256 !~ '^[0-9A-Fa-f]{64}$'
    or p_calculated_line_count < 0 or p_returned_restocked_line_count < 0 or p_same_day_receipt_warning_count < 0
    or jsonb_typeof(p_exception_summary) <> 'object'
    or p_simulated_cogs_gbp < 0 or p_existing_policy_cogs_gbp < 0
    or p_simulated_closing_inventory_units < 0 or p_simulated_closing_inventory_landed_gbp < 0 then
    raise exception 'HISTORICAL_COGS_SIMULATION_REVIEW_INVALID';
  end if;
  select status into v_status from public.vault_historical_cogs_policy_versions where id = p_draft_policy_version_id for share;
  if v_status is distinct from 'draft' then raise exception 'HISTORICAL_COGS_SIMULATION_REVIEW_DRAFT_INVALID'; end if;
  select count(*) into v_legacy_count from public.vault_historical_cogs_policy_batch_evidence where policy_version_id = p_draft_policy_version_id;
  select count(*) into v_governed_count from public.vault_historical_cogs_policy_governed_delivery_evidence where policy_version_id = p_draft_policy_version_id;
  if v_legacy_count <> 6 or v_governed_count <> 2 then raise exception 'HISTORICAL_COGS_SIMULATION_REVIEW_EVIDENCE_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtext(p_draft_policy_version_id::text));
  select id into v_review_id from public.vault_historical_cogs_simulation_reviews
    where draft_policy_version_id = p_draft_policy_version_id and simulation_input_sha256 = p_simulation_input_sha256
      and simulation_resolution_sha256 = p_simulation_resolution_sha256 and simulator_code_sha256 = p_simulator_code_sha256
      and per_line_report_sha256 = p_per_line_report_sha256;
  if found then return v_review_id; end if;
  insert into public.vault_historical_cogs_simulation_reviews(
    draft_policy_version_id, policy_rule, simulation_input_sha256, simulation_resolution_sha256, simulator_code_sha256, per_line_report_sha256,
    calculated_line_count, returned_restocked_line_count, same_day_receipt_warning_count, exception_summary, simulated_cogs_gbp,
    existing_policy_cogs_gbp, simulated_closing_inventory_units, simulated_closing_inventory_landed_gbp, created_by_operator_id
  ) values (
    p_draft_policy_version_id, p_policy_rule, p_simulation_input_sha256, p_simulation_resolution_sha256, p_simulator_code_sha256, p_per_line_report_sha256,
    p_calculated_line_count, p_returned_restocked_line_count, p_same_day_receipt_warning_count, p_exception_summary, p_simulated_cogs_gbp,
    p_existing_policy_cogs_gbp, p_simulated_closing_inventory_units, p_simulated_closing_inventory_landed_gbp, p_actor_id
  ) returning id into v_review_id;
  insert into public.vault_historical_cogs_simulation_review_evidence(review_id,evidence_kind,legacy_batch_evidence_id)
    select v_review_id, 'legacy_supplier_batch', batch_evidence_id from public.vault_historical_cogs_policy_batch_evidence where policy_version_id = p_draft_policy_version_id;
  insert into public.vault_historical_cogs_simulation_review_evidence(review_id,evidence_kind,governed_delivery_batch_id,governed_approval_revision)
    select v_review_id, 'governed_historical_delivery', delivery_batch_id, approval_revision from public.vault_historical_cogs_policy_governed_delivery_evidence where policy_version_id = p_draft_policy_version_id;
  return v_review_id;
end;
$$;

create function public.approve_exclusive_tee_historical_cogs_simulation_review(
  p_review_id uuid,
  p_policy_rule text,
  p_simulation_input_sha256 text,
  p_simulation_resolution_sha256 text,
  p_simulator_code_sha256 text,
  p_per_line_report_sha256 text,
  p_approval_note text,
  p_actor_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.vault_historical_cogs_simulation_reviews%rowtype; v_approval_id uuid; v_current_legacy_count integer; v_current_governed_count integer;
begin
  perform public.assert_historical_cogs_policy_owner(p_actor_id);
  if p_policy_rule <> 'date_only_receipts_eligible_following_europe_london_calendar_day_v1' or nullif(trim(p_approval_note), '') is null then
    raise exception 'HISTORICAL_COGS_SIMULATION_APPROVAL_INVALID';
  end if;
  select * into r from public.vault_historical_cogs_simulation_reviews where id = p_review_id for update;
  if not found then raise exception 'HISTORICAL_COGS_SIMULATION_REVIEW_NOT_FOUND'; end if;
  if r.policy_rule <> p_policy_rule or r.simulation_input_sha256 <> p_simulation_input_sha256
    or r.simulation_resolution_sha256 <> p_simulation_resolution_sha256 or r.simulator_code_sha256 <> p_simulator_code_sha256
    or r.per_line_report_sha256 <> p_per_line_report_sha256 then raise exception 'HISTORICAL_COGS_SIMULATION_SNAPSHOT_MISMATCH'; end if;
  if not exists(select 1 from public.vault_historical_cogs_policy_versions where id = r.draft_policy_version_id and status = 'draft') then
    raise exception 'HISTORICAL_COGS_SIMULATION_DRAFT_NO_LONGER_INACTIVE';
  end if;
  select count(*) into v_current_legacy_count from public.vault_historical_cogs_policy_batch_evidence where policy_version_id = r.draft_policy_version_id;
  select count(*) into v_current_governed_count from public.vault_historical_cogs_policy_governed_delivery_evidence where policy_version_id = r.draft_policy_version_id;
  if v_current_legacy_count <> 6 or v_current_governed_count <> 2
    or exists (
      (select batch_evidence_id from public.vault_historical_cogs_policy_batch_evidence where policy_version_id = r.draft_policy_version_id)
      except
      (select legacy_batch_evidence_id from public.vault_historical_cogs_simulation_review_evidence where review_id = r.id and evidence_kind = 'legacy_supplier_batch')
    )
    or exists (
      (select delivery_batch_id, approval_revision from public.vault_historical_cogs_policy_governed_delivery_evidence where policy_version_id = r.draft_policy_version_id)
      except
      (select governed_delivery_batch_id, governed_approval_revision from public.vault_historical_cogs_simulation_review_evidence where review_id = r.id and evidence_kind = 'governed_historical_delivery')
    ) then raise exception 'HISTORICAL_COGS_SIMULATION_EVIDENCE_SNAPSHOT_MISMATCH'; end if;
  select id into v_approval_id from public.vault_historical_cogs_simulation_review_approvals where review_id = r.id;
  if found then return v_approval_id; end if;
  insert into public.vault_historical_cogs_simulation_review_approvals(
    review_id,draft_policy_version_id,policy_rule,simulation_input_sha256,simulation_resolution_sha256,simulator_code_sha256,per_line_report_sha256,approval_note,approved_by_operator_id
  ) values (
    r.id,r.draft_policy_version_id,r.policy_rule,r.simulation_input_sha256,r.simulation_resolution_sha256,r.simulator_code_sha256,r.per_line_report_sha256,p_approval_note,p_actor_id
  ) returning id into v_approval_id;
  return v_approval_id;
end;
$$;

revoke all on function public.assert_historical_cogs_policy_owner(uuid),
  public.create_exclusive_tee_historical_cogs_simulation_review(uuid,text,text,text,text,text,integer,integer,integer,jsonb,numeric,numeric,integer,numeric,uuid),
  public.approve_exclusive_tee_historical_cogs_simulation_review(uuid,text,text,text,text,text,text,uuid)
from public, anon, authenticated;
grant execute on function public.create_exclusive_tee_historical_cogs_simulation_review(uuid,text,text,text,text,text,integer,integer,integer,jsonb,numeric,numeric,integer,numeric,uuid),
  public.approve_exclusive_tee_historical_cogs_simulation_review(uuid,text,text,text,text,text,text,uuid)
to service_role;

notify pgrst, 'reload schema';
commit;
