-- Phase 1B7G: factual B7D x B7F bridge. No inventory or demand inference.
create view public.vault_governed_size_availability_member_location_daily
with (security_barrier = true) as
select
  availability.evidence_date,
  availability.observed_at,
  availability.parent_product_id as canonical_product_id,
  availability.canonical_style_id,
  availability.model_design,
  availability.normalized_size,
  availability.variant_id,
  availability.shopify_variant_id,
  availability.shopify_inventory_item_id,
  availability.shopify_location_id,
  availability.available as observed_signed_available,
  availability.committed,
  availability.incoming,
  availability.on_hand,
  case
    when availability.available > 0 then 'positive'
    when availability.available = 0 then 'zero'
    else 'negative'
  end as observed_quantity_state,
  availability.canonical_mapping_status,
  availability.attesting_inventory_sync_run_id
from public.vault_governed_inventory_observation_daily_member_location_availability availability
where availability.canonical_mapping_status = 'resolved'
  and availability.parent_product_id is not null
  and availability.canonical_style_id is not null
  and availability.normalized_size is not null;

comment on view public.vault_governed_size_availability_member_location_daily is
  'B7G factual B7D resolved member/location/day signed quantity evidence. observed_quantity_state is derived only from signed available; it is not sellability or complete-location availability.';

create view public.vault_governed_size_demand_daily_availability_status
with (security_barrier = true) as
with demand_daily as (
  select
    (demand.ordered_at at time zone 'Europe/London')::date as operational_date,
    demand.canonical_product_id,
    demand.canonical_style_id,
    demand.normalized_size,
    sum(demand.gross_ordered_units)::bigint as gross_ordered_units,
    sum(demand.cancelled_units)::bigint as cancelled_units,
    sum(demand.refunded_units)::bigint as refunded_units,
    sum(demand.net_retained_units)::bigint as net_retained_units,
    sum(demand.financially_qualified_net_retained_units)::bigint as financially_qualified_net_retained_units,
    count(*)::integer as demand_line_count,
    count(distinct demand.shopify_order_id)::integer as distinct_order_count
  from public.vault_governed_size_demand_evidence demand
  group by 1, 2, 3, 4
), availability_daily as (
  select
    availability.evidence_date as operational_date,
    availability.canonical_product_id,
    availability.canonical_style_id,
    availability.normalized_size,
    count(distinct availability.shopify_location_id)::integer as observed_location_count,
    count(*)::integer as observed_member_location_row_count,
    count(distinct availability.variant_id)::integer as observed_member_count,
    count(distinct availability.shopify_location_id) filter (where availability.observed_quantity_state = 'positive')::integer as positive_observed_location_count,
    count(distinct availability.shopify_location_id) filter (where availability.observed_quantity_state = 'zero')::integer as zero_observed_location_count,
    count(distinct availability.shopify_location_id) filter (where availability.observed_quantity_state = 'negative')::integer as negative_observed_location_count,
    count(*) filter (where availability.observed_quantity_state = 'positive')::integer as positive_observed_member_location_row_count,
    count(*) filter (where availability.observed_quantity_state = 'zero')::integer as zero_observed_member_location_row_count,
    count(*) filter (where availability.observed_quantity_state = 'negative')::integer as negative_observed_member_location_row_count,
    sum(availability.observed_signed_available)::bigint as observed_signed_available_total
  from public.vault_governed_size_availability_member_location_daily availability
  group by 1, 2, 3, 4
)
select
  coalesce(demand.operational_date, availability.operational_date) as operational_date,
  coalesce(demand.canonical_product_id, availability.canonical_product_id) as canonical_product_id,
  coalesce(demand.canonical_style_id, availability.canonical_style_id) as canonical_style_id,
  coalesce(demand.normalized_size, availability.normalized_size) as normalized_size,
  coalesce(demand.gross_ordered_units, 0)::bigint as gross_ordered_units,
  coalesce(demand.cancelled_units, 0)::bigint as cancelled_units,
  coalesce(demand.refunded_units, 0)::bigint as refunded_units,
  coalesce(demand.net_retained_units, 0)::bigint as net_retained_units,
  coalesce(demand.financially_qualified_net_retained_units, 0)::bigint as financially_qualified_net_retained_units,
  coalesce(demand.demand_line_count, 0)::integer as demand_line_count,
  coalesce(demand.distinct_order_count, 0)::integer as distinct_order_count,
  availability.observed_location_count,
  availability.observed_member_location_row_count,
  availability.observed_member_count,
  availability.positive_observed_location_count,
  availability.zero_observed_location_count,
  availability.negative_observed_location_count,
  availability.positive_observed_member_location_row_count,
  availability.zero_observed_member_location_row_count,
  availability.negative_observed_member_location_row_count,
  availability.observed_signed_available_total,
  case
    when demand.operational_date is not null and availability.operational_date is not null then 'governed_comparable'
    when demand.operational_date is not null then 'availability_unknown'
    else 'availability_only'
  end as governance_status
from demand_daily demand
full outer join availability_daily availability
  on availability.operational_date = demand.operational_date
 and availability.canonical_product_id = demand.canonical_product_id
 and availability.canonical_style_id = demand.canonical_style_id
 and availability.normalized_size = demand.normalized_size;

comment on view public.vault_governed_size_demand_daily_availability_status is
  'B7G factual Europe/London daily demand and governed observed-location quantity bridge. Demand is independently aggregated before availability joining. NULL availability facts mean unknown, not zero. This does not establish sellability, complete location coverage, duration, lost demand, or recommendations.';

revoke all on public.vault_governed_size_availability_member_location_daily, public.vault_governed_size_demand_daily_availability_status from anon, authenticated;
notify pgrst, 'reload schema';
