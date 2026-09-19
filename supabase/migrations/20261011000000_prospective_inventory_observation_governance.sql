-- Phase 1B7E: prospective collector-governance evidence only. No historical
-- backfill is performed and this does not assess availability or coverage.
create table public.vault_inventory_observation_governance_runs (
  inventory_sync_run_id uuid primary key references public.vault_shopify_inventory_sync_runs(id) on delete restrict,
  collector_version text not null,
  expected_population_known boolean not null default false,
  expected_variant_count integer check (expected_variant_count is null or expected_variant_count >= 0),
  requested_inventory_item_count integer check (requested_inventory_item_count is null or requested_inventory_item_count >= 0),
  returned_inventory_item_count integer check (returned_inventory_item_count is null or returned_inventory_item_count >= 0),
  processed_variant_count integer check (processed_variant_count is null or processed_variant_count >= 0),
  observed_location_count integer check (observed_location_count is null or observed_location_count >= 0),
  current_inventory_write_completed boolean not null default false,
  history_write_completed boolean not null default false,
  reconciliation_state text not null default 'unknown' check (reconciliation_state in ('unknown','reconciled','unreconciled')),
  daily_baseline_completion_recorded boolean not null default false,
  terminal_run_status text not null default 'running' check (terminal_run_status in ('running','current','failed')),
  selection_recorded_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vault_inventory_observation_daily_expected_members (
  id uuid primary key default gen_random_uuid(),
  evidence_date date not null,
  first_selected_inventory_sync_run_id uuid not null references public.vault_shopify_inventory_sync_runs(id) on delete restrict,
  variant_id uuid not null references public.vault_variants(id) on delete restrict,
  shopify_variant_id text,
  shopify_inventory_item_id text not null,
  parent_product_id uuid,
  model_design text,
  normalized_size text,
  canonical_style_id text,
  canonical_mapping_status text not null check (canonical_mapping_status in ('resolved','unresolved_or_incomplete')),
  collector_eligibility_basis text not null check (collector_eligibility_basis = 'shopify_active_variant_with_inventory_item'),
  selected_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique nulls not distinct (
    evidence_date, variant_id, shopify_inventory_item_id, parent_product_id,
    model_design, normalized_size, canonical_style_id, canonical_mapping_status
  )
);

create index vault_inventory_observation_daily_members_date_idx
  on public.vault_inventory_observation_daily_expected_members (evidence_date, variant_id);

create table public.vault_inventory_observation_run_exceptions (
  id uuid primary key default gen_random_uuid(),
  inventory_sync_run_id uuid not null references public.vault_shopify_inventory_sync_runs(id) on delete restrict,
  variant_id uuid references public.vault_variants(id) on delete restrict,
  shopify_inventory_item_id text,
  exception_stage text not null check (exception_stage in ('duplicate_inventory_item_mapping','shopify_not_returned','current_inventory_write_failed','history_write_failed')),
  recorded_at timestamptz not null default now(),
  unique nulls not distinct (inventory_sync_run_id, variant_id, shopify_inventory_item_id, exception_stage)
);

revoke all on public.vault_inventory_observation_governance_runs from anon, authenticated;
revoke all on public.vault_inventory_observation_daily_expected_members from anon, authenticated;
revoke all on public.vault_inventory_observation_run_exceptions from anon, authenticated;

comment on table public.vault_inventory_observation_governance_runs is
  'Phase 1B7E prospective per-run collector-stage facts. Expected population remains unknown until selection is durably recorded; no historical backfill.';
comment on table public.vault_inventory_observation_daily_expected_members is
  'Phase 1B7E prospective immutable daily collector-eligibility and identity-at-selection facts. This is not a coverage, availability, or baseline-completeness conclusion.';
comment on table public.vault_inventory_observation_run_exceptions is
  'Phase 1B7E prospective factual deviations from selected inventory-member processing. duplicate_inventory_item_mapping records local selected-population ambiguity, not a Shopify failure; other stages do not infer a cause beyond the recorded collector stage.';

notify pgrst, 'reload schema';
