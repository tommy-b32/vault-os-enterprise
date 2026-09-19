-- Phase 1B7C: prospective daily member-level governed collection attestations.
-- No historical inventory, B7E membership, or snapshot evidence is backfilled.
create table public.vault_inventory_observation_daily_member_attestations (
  id uuid primary key default gen_random_uuid(),
  evidence_date date not null,
  attesting_inventory_sync_run_id uuid not null references public.vault_shopify_inventory_sync_runs(id) on delete restrict,
  variant_id uuid not null references public.vault_variants(id) on delete restrict,
  shopify_variant_id text,
  shopify_inventory_item_id text not null,
  parent_product_id uuid,
  model_design text,
  normalized_size text,
  canonical_style_id text,
  canonical_mapping_status text not null check (canonical_mapping_status in ('resolved','unresolved_or_incomplete')),
  observed_inventory_level_count integer not null check (observed_inventory_level_count >= 0),
  observed_location_count integer not null check (observed_location_count >= 0),
  attested_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique nulls not distinct (
    evidence_date, variant_id, shopify_inventory_item_id, parent_product_id,
    model_design, normalized_size, canonical_style_id, canonical_mapping_status
  )
);

create index vault_inventory_observation_daily_attestations_date_variant_idx
  on public.vault_inventory_observation_daily_member_attestations (evidence_date, variant_id);

create view public.vault_governed_inventory_observation_daily_member_coverage
with (security_barrier = true)
as
select attestation.*
from public.vault_inventory_observation_daily_member_attestations attestation
join public.vault_shopify_inventory_sync_runs run
  on run.id = attestation.attesting_inventory_sync_run_id
 and run.sync_status = 'current'
join public.vault_inventory_observation_governance_runs governance
  on governance.inventory_sync_run_id = run.id
 and governance.terminal_run_status = 'current'
 and governance.daily_baseline_completion_recorded
 and governance.expected_population_known
 and governance.reconciliation_state = 'reconciled'
 and governance.current_inventory_write_completed
 and governance.history_write_completed;

revoke all on public.vault_inventory_observation_daily_member_attestations from anon, authenticated;
revoke all on public.vault_governed_inventory_observation_daily_member_coverage from anon, authenticated;

comment on table public.vault_inventory_observation_daily_member_attestations is
  'Phase 1B7C prospective immutable daily evidence that this exact selected member participated in a terminally successful governed collection. This is coverage evidence only: it does not infer continuous availability, expected locations, demand, censoring, or buying action. First successful daily attestation is preserved; no historical backfill.';
comment on view public.vault_governed_inventory_observation_daily_member_coverage is
  'Only B7C daily member attestations whose referenced operational and B7E governance runs remain terminally current and complete. An attestation tied to a failed or incomplete run is not governed coverage.';

notify pgrst, 'reload schema';
