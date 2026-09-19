-- Phase 1B4: factual size-distribution evidence only; no sufficiency or availability-opportunity policy.
create or replace view public.vault_canonical_resolved_commercial_order_lines as
with variant_counts as (select source_variant_id,count(*)::integer variant_count from public.vault_variants where source='shopify' and source_variant_id is not null group by source_variant_id),
safe_shopify_ownership as (select source_variant_id,min(product_id::text)::uuid parent_product_id from public.vault_variants where source='shopify' and source_variant_id is not null group by source_variant_id having count(distinct product_id)=1),
canonical_variants as (select v.source_variant_id,v.product_id parent_product_id,trim(v.model_design) model_design,trim(v.normalized_size) normalized_size from public.vault_variants v join variant_counts c on c.source_variant_id=v.source_variant_id where v.source='shopify' and c.variant_count=1 and v.identity_resolution_status='resolved' and nullif(trim(v.model_design),'') is not null and nullif(trim(v.normalized_size),'') is not null)
select l.id as order_line_id,l.shopify_variant_id,o.shopify_created_at,greatest(l.quantity-l.refunded_quantity,0)::numeric net_units,coalesce(v.parent_product_id,ownership.parent_product_id) parent_product_id,v.model_design,v.normalized_size,case when v.source_variant_id is not null then 'resolved' when ownership.source_variant_id is not null then 'known_parent_unresolved' when c.source_variant_id is not null then 'global_unresolved' else 'unmatched' end mapping_status,o.id as order_id
from public.vault_shopify_order_lines l join public.vault_shopify_orders o on o.id=l.order_id left join variant_counts c on c.source_variant_id=l.shopify_variant_id left join safe_shopify_ownership ownership on ownership.source_variant_id=l.shopify_variant_id left join canonical_variants v on v.source_variant_id=l.shopify_variant_id where o.cancelled_at is null and coalesce((o.metadata->>'test')::boolean,false)=false;

create or replace view public.vault_size_distribution_evidence_assessment as
with current_style as (
  select style_id,bool_and(trusted and sales_30_day_units is not null) current_evidence_available
  from public.vault_model_size_replenishment_intelligence group by style_id
), current_reason as (
  select distinct on (style_id) style_id,missing_requirements[1] current_evidence_unavailable_reason
  from public.vault_model_size_replenishment_intelligence
  where not trusted or sales_30_day_units is null order by style_id,model_size_id
), current_sizes as (
  select c.style_id,c.parent_product_id,c.model_design,c.normalized_size,
    case when s.current_evidence_available then c.sales_30_day_units else null end current_observed_units,
    case when s.current_evidence_available then sum(c.sales_30_day_units) over(partition by c.style_id) else null end total_current_observed_units,
    case when s.current_evidence_available and sum(c.sales_30_day_units) over(partition by c.style_id)>0 then c.sales_30_day_units/sum(c.sales_30_day_units) over(partition by c.style_id) else null end current_observed_share,
    s.current_evidence_available,r.current_evidence_unavailable_reason
  from public.vault_model_size_replenishment_intelligence c join current_style s using(style_id) left join current_reason r using(style_id)
), historical_sizes as (
  select h.*,case when h.historical_evidence_available then h.historical_attributable_observed_units else null end historical_observed_units,
    case when h.historical_evidence_available then h.historical_observed_demand_share else null end historical_observed_share
  from public.vault_historical_model_size_evidence h
), keys as (
  select style_id,parent_product_id,model_design,normalized_size from current_sizes union select style_id,parent_product_id,model_design,normalized_size from historical_sizes
), historical_observations as (
  select h.style_id,h.normalized_size,count(distinct l.order_id)::bigint historical_distinct_order_count,min(l.shopify_created_at) historical_first_observed_at,max(l.shopify_created_at) historical_latest_observed_at,count(distinct (l.shopify_created_at at time zone 'Europe/London')::date)::bigint historical_distinct_selling_dates,count(distinct date_trunc('week',l.shopify_created_at at time zone 'Europe/London'))::bigint historical_distinct_selling_weeks,
    max(l.shopify_created_at)-min(l.shopify_created_at) historical_observation_span
  from historical_sizes h join public.vault_canonical_resolved_commercial_order_lines l on l.parent_product_id=h.parent_product_id and l.model_design=h.model_design and l.normalized_size=h.normalized_size and l.mapping_status='resolved' and l.shopify_created_at>=h.historical_evidence_start and l.shopify_created_at<h.historical_evidence_end
  where h.historical_evidence_available and l.net_units>0 group by h.style_id,h.normalized_size
), variant_counts as (select source_variant_id,count(*) variant_count from public.vault_variants where source='shopify' and source_variant_id is not null group by source_variant_id), retained_snapshots as (
  select v.product_id parent_product_id,trim(v.model_design) model_design,trim(v.normalized_size) normalized_size,s.variant_id,s.location_id,s.observed_at,s.available
  from public.vault_inventory_level_snapshots s join public.vault_shopify_inventory_sync_runs run on run.id=s.inventory_sync_run_id and run.sync_status='current' join public.vault_variants v on v.id=s.variant_id join variant_counts c on c.source_variant_id=v.source_variant_id
  where v.source='shopify' and c.variant_count=1 and v.identity_resolution_status='resolved' and nullif(trim(v.model_design),'') is not null and nullif(trim(v.normalized_size),'') is not null
), inventory_facts as (
  select k.style_id,k.normalized_size,min(s.observed_at) retained_inventory_first_observed_at,max(s.observed_at) retained_inventory_latest_observed_at,count(distinct (s.variant_id,s.location_id,s.observed_at))::bigint retained_inventory_observation_count,count(distinct (s.variant_id,s.location_id,s.observed_at)) filter(where s.available>0)::bigint retained_positive_availability_observations,count(distinct (s.variant_id,s.location_id,s.observed_at)) filter(where s.available<=0)::bigint retained_zero_or_negative_availability_observations
  from keys k join retained_snapshots s on s.parent_product_id=k.parent_product_id and s.model_design=k.model_design and s.normalized_size=k.normalized_size group by k.style_id,k.normalized_size
), style_sets as (
  select k.style_id,array_agg(k.normalized_size order by k.normalized_size) filter(where coalesce(c.current_observed_units,0)>0) sizes_observed_current,array_agg(k.normalized_size order by k.normalized_size) filter(where coalesce(h.historical_observed_units,0)>0) sizes_observed_historically,array_agg(k.normalized_size order by k.normalized_size) filter(where coalesce(c.current_observed_units,0)>0 and coalesce(h.historical_observed_units,0)>0) sizes_observed_both,array_agg(k.normalized_size order by k.normalized_size) filter(where coalesce(c.current_observed_units,0)>0 and coalesce(h.historical_observed_units,0)=0) sizes_observed_current_only,array_agg(k.normalized_size order by k.normalized_size) filter(where coalesce(c.current_observed_units,0)=0 and coalesce(h.historical_observed_units,0)>0) sizes_observed_historical_only from keys k left join current_sizes c using(style_id,normalized_size) left join historical_sizes h using(style_id,normalized_size) group by k.style_id
)
select k.style_id canonical_style_id,k.parent_product_id,k.model_design,t.maturity_state trading_evidence_maturity,c.current_evidence_available,c.current_evidence_unavailable_reason,h.historical_evidence_available,h.historical_evidence_unavailable_reason,c.total_current_observed_units,h.total_historical_size_attributable_observed_units total_historical_observed_units,sets.sizes_observed_current,sets.sizes_observed_historically,sets.sizes_observed_both,sets.sizes_observed_current_only,sets.sizes_observed_historical_only,'not_evaluated'::text historical_availability_opportunity,k.normalized_size canonical_size,c.current_observed_units,h.historical_observed_units,c.current_observed_share,h.historical_observed_share,case when c.current_observed_share is not null and h.historical_observed_share is not null then (c.current_observed_share-h.historical_observed_share)*100 else null end share_difference_percentage_points,coalesce(c.current_observed_units,0)>0 observed_current,coalesce(h.historical_observed_units,0)>0 observed_historically,o.historical_distinct_order_count,o.historical_first_observed_at,o.historical_latest_observed_at,o.historical_distinct_selling_dates,o.historical_distinct_selling_weeks,o.historical_observation_span,i.retained_inventory_first_observed_at,i.retained_inventory_latest_observed_at,i.retained_inventory_observation_count,i.retained_positive_availability_observations,i.retained_zero_or_negative_availability_observations
from keys k left join current_sizes c using(style_id,normalized_size) left join historical_sizes h using(style_id,normalized_size) left join public.vault_style_trading_evidence t on t.style_id=k.style_id left join historical_observations o on o.style_id=k.style_id and o.normalized_size=k.normalized_size left join inventory_facts i on i.style_id=k.style_id and i.normalized_size=k.normalized_size join style_sets sets on sets.style_id=k.style_id;

notify pgrst, 'reload schema';
