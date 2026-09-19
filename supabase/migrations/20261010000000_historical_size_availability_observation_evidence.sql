-- Phase 1B7B: retained inventory observation facts only. Observations are points,
-- not availability intervals, opportunity, censoring, demand, or size-curve evidence.
create or replace view public.vault_historical_size_availability_observation_evidence as
with variant_counts as (
  select source_variant_id, count(*)::integer as variant_count
  from public.vault_variants
  where source = 'shopify' and source_variant_id is not null
  group by source_variant_id
), retained_successful_observations as (
  select
    snapshot.variant_id,
    snapshot.location_id,
    snapshot.inventory_sync_run_id,
    snapshot.observed_at,
    snapshot.available,
    snapshot.history_kind,
    variant.product_id as parent_product_id,
    trim(variant.model_design) as model_design,
    trim(variant.normalized_size) as normalized_size
  from public.vault_inventory_level_snapshots snapshot
  join public.vault_shopify_inventory_sync_runs run
    on run.id = snapshot.inventory_sync_run_id
   and run.sync_status = 'current'
  join public.vault_variants variant on variant.id = snapshot.variant_id
  join variant_counts counts on counts.source_variant_id = variant.source_variant_id
  where variant.source = 'shopify'
    and counts.variant_count = 1
    and variant.identity_resolution_status = 'resolved'
    and nullif(trim(variant.model_design), '') is not null
    and nullif(trim(variant.normalized_size), '') is not null
)
select
  parent_product_id::text || '::' || model_design as canonical_style_id,
  parent_product_id,
  model_design,
  normalized_size,
  min(observed_at) as first_observed_at,
  max(observed_at) as latest_observed_at,
  min((observed_at at time zone 'Europe/London')::date) as first_observation_date,
  max((observed_at at time zone 'Europe/London')::date) as latest_observation_date,
  count(*)::bigint as total_observation_count,
  count(distinct (observed_at at time zone 'Europe/London')::date)::bigint as distinct_observation_date_count,
  count(distinct inventory_sync_run_id)::bigint as distinct_successful_inventory_sync_run_count,
  count(distinct location_id)::bigint as distinct_location_count,
  count(*) filter (where available > 0)::bigint as positive_available_observation_count,
  count(*) filter (where available = 0)::bigint as zero_available_observation_count,
  count(*) filter (where available < 0)::bigint as negative_available_observation_count,
  count(*) filter (where available <= 0)::bigint as zero_or_negative_available_observation_count,
  min(available) as minimum_observed_available,
  max(available) as maximum_observed_available,
  count(*) filter (where history_kind = 'legacy')::bigint as legacy_observation_count,
  count(*) filter (where history_kind = 'daily_baseline')::bigint as daily_baseline_observation_count,
  count(*) filter (where history_kind = 'change')::bigint as change_observation_count
from retained_successful_observations
group by parent_product_id, model_design, normalized_size;

create or replace view public.vault_historical_size_availability_observation_provenance as
with variant_counts as (
  select source_variant_id, count(*)::integer as variant_count
  from public.vault_variants
  where source = 'shopify' and source_variant_id is not null
  group by source_variant_id
), successful_observations as (
  select snapshot.*, variant.source, variant.source_variant_id,
    variant.identity_resolution_status, variant.model_design, variant.normalized_size,
    counts.variant_count
  from public.vault_inventory_level_snapshots snapshot
  join public.vault_shopify_inventory_sync_runs run
    on run.id = snapshot.inventory_sync_run_id
   and run.sync_status = 'current'
  join public.vault_variants variant on variant.id = snapshot.variant_id
  left join variant_counts counts on counts.source_variant_id = variant.source_variant_id
)
select
  min(observed_at) as first_successful_observed_at,
  max(observed_at) as latest_successful_observed_at,
  count(*)::bigint as total_successful_observation_count,
  count(distinct (observed_at at time zone 'Europe/London')::date)::bigint as distinct_successful_observation_date_count,
  count(distinct inventory_sync_run_id)::bigint as distinct_successful_inventory_sync_run_count,
  count(distinct location_id)::bigint as distinct_location_count,
  count(*) filter (
    where source = 'shopify'
      and variant_count = 1
      and identity_resolution_status = 'resolved'
      and nullif(trim(model_design), '') is not null
      and nullif(trim(normalized_size), '') is not null
  )::bigint as deterministically_mapped_observation_count,
  count(*) filter (
    where not coalesce((
      source = 'shopify'
      and variant_count = 1
      and identity_resolution_status = 'resolved'
      and nullif(trim(model_design), '') is not null
      and nullif(trim(normalized_size), '') is not null
    ), false)
  )::bigint as unresolved_or_incomplete_canonical_mapping_observation_count
from successful_observations;

comment on view public.vault_historical_size_availability_observation_evidence is
  'Phase 1B7B factual retained inventory observation evidence by canonical style and normalized size. Counts are point observations only; no continuous availability, opportunity, censoring, demand, or curve inference. Canonical identity is resolved through the current governed vault_variants mapping at query time, is not historically versioned, and does not prove the current identity was the historical identity at an observation timestamp.';
comment on view public.vault_historical_size_availability_observation_provenance is
  'Phase 1B7B global successful inventory-observation population and canonical-mapping coverage. Unmapped observations are deliberately not assigned to a canonical style or size.';

notify pgrst, 'reload schema';
