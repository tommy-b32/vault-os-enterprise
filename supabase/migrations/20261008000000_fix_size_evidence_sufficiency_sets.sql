-- Phase 1B5B forward contract fix: preserve Phase 1B4 style-level arrays without multidimensional aggregation.
-- The deployed defect exposed these five arrays as text; PostgreSQL cannot change a view column type with CREATE OR REPLACE.
-- No CASCADE: an unexpected downstream dependency must block this corrective migration safely.
drop view public.vault_size_evidence_sufficiency;
create view public.vault_size_evidence_sufficiency as
with historical_bounds as (
  select style_id, min(historical_evidence_start) historical_evidence_start, max(historical_evidence_end) historical_evidence_end
  from public.vault_historical_model_size_evidence group by style_id
), style_sets as (
  select distinct on (canonical_style_id)
    canonical_style_id, sizes_observed_current, sizes_observed_historically, sizes_observed_both, sizes_observed_current_only, sizes_observed_historical_only
  from public.vault_size_distribution_evidence_assessment
  order by canonical_style_id, canonical_size
), style_evidence as (
  select
    a.canonical_style_id,
    (array_agg(a.parent_product_id))[1] parent_product_id,
    min(a.model_design) model_design,
    min(a.trading_evidence_maturity) trading_evidence_maturity,
    bool_and(a.current_evidence_available) current_evidence_available,
    (array_agg(a.current_evidence_unavailable_reason) filter (where a.current_evidence_unavailable_reason is not null))[1] current_evidence_unavailable_reason,
    bool_and(a.historical_evidence_available) historical_evidence_available,
    (array_agg(a.historical_evidence_unavailable_reason) filter (where a.historical_evidence_unavailable_reason is not null))[1] historical_evidence_unavailable_reason,
    max(a.total_current_observed_units) total_current_observed_units,
    max(a.total_historical_observed_units) total_historical_observed_units,
    count(*)::bigint canonical_size_count,
    count(*) filter (where a.observed_current)::bigint currently_observed_size_count,
    count(*) filter (where a.observed_historically)::bigint historically_observed_size_count,
    min(a.historical_first_observed_at) historical_first_observed_at,
    max(a.historical_latest_observed_at) historical_latest_observed_at
  from public.vault_size_distribution_evidence_assessment a group by a.canonical_style_id
), historical_observations as (
  select s.canonical_style_id,
    count(distinct l.order_id)::bigint historical_distinct_commercial_orders,
    count(distinct (l.shopify_created_at at time zone 'Europe/London')::date)::bigint historical_distinct_selling_dates,
    count(distinct date_trunc('week', l.shopify_created_at at time zone 'Europe/London'))::bigint historical_distinct_selling_weeks,
    min(l.shopify_created_at) historical_first_observed_at, max(l.shopify_created_at) historical_latest_observed_at
  from style_evidence s
  join historical_bounds b on b.style_id=s.canonical_style_id
  join public.vault_canonical_resolved_commercial_order_lines l on l.parent_product_id=s.parent_product_id and l.model_design=s.model_design and l.mapping_status='resolved' and l.shopify_created_at>=b.historical_evidence_start and l.shopify_created_at<b.historical_evidence_end
  where s.current_evidence_available and s.historical_evidence_available and l.net_units>0
  group by s.canonical_style_id
)
select s.canonical_style_id,s.parent_product_id,s.model_design,s.trading_evidence_maturity,
  case when not coalesce(s.current_evidence_available,false) or not coalesce(s.historical_evidence_available,false) then 'UNAVAILABLE' when coalesce(s.total_historical_observed_units,0)=0 then 'NOT_OBSERVED' else 'DESCRIPTIVE_ONLY' end size_evidence_sufficiency_state,
  s.current_evidence_available,s.current_evidence_unavailable_reason,s.historical_evidence_available,s.historical_evidence_unavailable_reason,
  s.total_current_observed_units,s.total_historical_observed_units,s.historically_observed_size_count,s.currently_observed_size_count,s.canonical_size_count,
  sets.sizes_observed_current,sets.sizes_observed_historically,sets.sizes_observed_both,sets.sizes_observed_current_only,sets.sizes_observed_historical_only,
  coalesce(o.historical_distinct_commercial_orders,0)::bigint historical_distinct_commercial_orders,
  coalesce(o.historical_distinct_selling_dates,0)::bigint historical_distinct_selling_dates,
  coalesce(o.historical_distinct_selling_weeks,0)::bigint historical_distinct_selling_weeks,
  coalesce(o.historical_first_observed_at,s.historical_first_observed_at) historical_first_observed_at,
  coalesce(o.historical_latest_observed_at,s.historical_latest_observed_at) historical_latest_observed_at,
  coalesce(o.historical_latest_observed_at,s.historical_latest_observed_at)-coalesce(o.historical_first_observed_at,s.historical_first_observed_at) historical_observation_span,
  coalesce(o.historical_distinct_commercial_orders,0)>1 has_multiple_historical_orders,
  coalesce(o.historical_distinct_selling_dates,0)>1 has_multiple_historical_selling_dates,
  coalesce(o.historical_distinct_selling_weeks,0)>1 has_multiple_historical_selling_weeks,
  s.historically_observed_size_count>1 has_multiple_historically_observed_sizes,
  s.historically_observed_size_count>s.currently_observed_size_count historical_adds_sizes_beyond_current,
  'NOT_EVALUATED'::text availability_censoring_limitation
from style_evidence s join style_sets sets using(canonical_style_id) left join historical_observations o using(canonical_style_id);

comment on view public.vault_size_evidence_sufficiency is 'Phase 1B5B factual style-level size evidence only. DESCRIPTIVE_ONLY is not a curve, confidence, buying, replenishment, or actionability decision.';
notify pgrst, 'reload schema';
