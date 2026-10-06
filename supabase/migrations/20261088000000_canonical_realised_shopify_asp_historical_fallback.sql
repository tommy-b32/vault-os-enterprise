-- Prefer recent realised Shopify ASP, while retaining a bounded, governed
-- historical fallback for products without a sale in the current 30-day window.
create or replace view public.vault_product_realised_selling_price as
with latest_sync as (
  select completed_at
  from public.vault_shopify_order_sync_runs
  where sync_days >= 7
  order by completed_at desc
  limit 1
),
history as (
  select min(o.shopify_created_at) as earliest_order_at
  from public.vault_shopify_orders o
  where o.cancelled_at is null
    and coalesce((o.metadata ->> 'test')::boolean, false) = false
),
variant_ownership as (
  select source_variant_id, min(product_id::text)::uuid as product_id,
    count(distinct product_id)::integer as parent_count
  from public.vault_variants
  where source = 'shopify' and source_variant_id is not null
  group by source_variant_id
),
bounded_orders as (
  select o.*
  from public.vault_shopify_orders o
  cross join latest_sync s
  where o.cancelled_at is null
    and coalesce((o.metadata ->> 'test')::boolean, false) = false
    and o.shopify_created_at >= s.completed_at - interval '180 days'
    and o.shopify_created_at < s.completed_at
),
safe_lines as (
  select l.shopify_variant_id, o.id as order_id, o.shopify_created_at,
    o.currency, l.net_line_revenue,
    greatest(l.quantity - l.refunded_quantity, 0)::numeric as net_units,
    ownership.product_id, ownership.parent_count
  from public.vault_shopify_order_lines l
  join bounded_orders o on o.id = l.order_id
  left join variant_ownership ownership
    on ownership.source_variant_id = l.shopify_variant_id
),
recent_sales as (
  select lines.product_id,
    coalesce(sum(lines.net_line_revenue) filter (where lines.currency = 'GBP' and lines.parent_count = 1), 0)::numeric as net_revenue_gbp,
    coalesce(sum(lines.net_units) filter (where lines.currency = 'GBP' and lines.parent_count = 1), 0)::numeric as net_units_sold,
    count(distinct lines.order_id) filter (where lines.currency = 'GBP' and lines.parent_count = 1 and lines.net_units > 0)::integer as order_count,
    max(lines.shopify_created_at) filter (where lines.currency = 'GBP' and lines.parent_count = 1 and lines.net_units > 0) as latest_sale_at,
    coalesce(sum(lines.net_units) filter (where lines.parent_count = 1 and lines.currency <> 'GBP'), 0)::numeric as non_gbp_units
  from safe_lines lines
  cross join latest_sync s
  where lines.product_id is not null
    and lines.shopify_created_at >= s.completed_at - interval '30 days'
  group by lines.product_id
),
historical_sales as (
  select lines.product_id,
    coalesce(sum(lines.net_line_revenue) filter (where lines.currency = 'GBP' and lines.parent_count = 1), 0)::numeric as net_revenue_gbp,
    coalesce(sum(lines.net_units) filter (where lines.currency = 'GBP' and lines.parent_count = 1), 0)::numeric as net_units_sold,
    count(distinct lines.order_id) filter (where lines.currency = 'GBP' and lines.parent_count = 1 and lines.net_units > 0)::integer as order_count,
    max(lines.shopify_created_at) filter (where lines.currency = 'GBP' and lines.parent_count = 1 and lines.net_units > 0) as latest_sale_at,
    coalesce(sum(lines.net_units) filter (where lines.parent_count = 1 and lines.currency <> 'GBP'), 0)::numeric as non_gbp_units
  from safe_lines lines
  cross join latest_sync s
  where lines.product_id is not null
    and lines.shopify_created_at < s.completed_at - interval '30 days'
  group by lines.product_id
),
recent_ambiguous_sales as (
  select distinct v.product_id
  from public.vault_variants v
  join variant_ownership ownership on ownership.source_variant_id = v.source_variant_id
  join safe_lines lines on lines.shopify_variant_id = v.source_variant_id
  cross join latest_sync s
  where v.source = 'shopify' and ownership.parent_count <> 1 and lines.net_units > 0
    and lines.shopify_created_at >= s.completed_at - interval '30 days'
),
historical_ambiguous_sales as (
  select distinct v.product_id
  from public.vault_variants v
  join variant_ownership ownership on ownership.source_variant_id = v.source_variant_id
  join safe_lines lines on lines.shopify_variant_id = v.source_variant_id
  cross join latest_sync s
  where v.source = 'shopify' and ownership.parent_count <> 1 and lines.net_units > 0
    and lines.shopify_created_at < s.completed_at - interval '30 days'
),
resolved as (
  select p.id as product_id, s.completed_at, h.earliest_order_at,
    recent.net_revenue_gbp as recent_revenue_gbp, recent.net_units_sold as recent_units_sold,
    recent.order_count as recent_order_count, recent.latest_sale_at as recent_latest_sale_at,
    recent.non_gbp_units as recent_non_gbp_units,
    historical.net_revenue_gbp as historical_revenue_gbp, historical.net_units_sold as historical_units_sold,
    historical.order_count as historical_order_count, historical.latest_sale_at as historical_latest_sale_at,
    historical.non_gbp_units as historical_non_gbp_units,
    recent_ambiguous.product_id is null as recent_mapping_complete,
    historical_ambiguous.product_id is null as historical_mapping_complete
  from public.vault_products p
  left join recent_sales recent on recent.product_id = p.id
  left join historical_sales historical on historical.product_id = p.id
  left join recent_ambiguous_sales recent_ambiguous on recent_ambiguous.product_id = p.id
  left join historical_ambiguous_sales historical_ambiguous on historical_ambiguous.product_id = p.id
  left join latest_sync s on true
  cross join history h
),
selected as (
  select *,
    case
      when completed_at is not null
        and completed_at >= now() - interval '30 minutes'
        and earliest_order_at <= completed_at - interval '30 days'
        and recent_mapping_complete
        and coalesce(recent_units_sold, 0) > 0
        then 'recent_30d'
      when completed_at is not null
        and completed_at >= now() - interval '30 minutes'
        and earliest_order_at <= completed_at - interval '30 days'
        and recent_mapping_complete
        and historical_mapping_complete
        and coalesce(historical_units_sold, 0) > 0
        then 'historical_fallback'
      else 'unavailable'
    end as asp_provenance
  from resolved
)
select product_id,
  case when asp_provenance = 'recent_30d' then round(recent_revenue_gbp / nullif(recent_units_sold, 0), 2)
    when asp_provenance = 'historical_fallback' then round(historical_revenue_gbp / nullif(historical_units_sold, 0), 2)
    else null end as realised_average_selling_price_gbp,
  case when asp_provenance = 'recent_30d' then coalesce(recent_revenue_gbp, 0)
    when asp_provenance = 'historical_fallback' then coalesce(historical_revenue_gbp, 0)
    else 0 end::numeric as net_revenue_gbp,
  case when asp_provenance = 'recent_30d' then coalesce(recent_units_sold, 0)
    when asp_provenance = 'historical_fallback' then coalesce(historical_units_sold, 0)
    else 0 end::numeric as net_units_sold,
  case when asp_provenance = 'recent_30d' then coalesce(recent_order_count, 0)
    when asp_provenance = 'historical_fallback' then coalesce(historical_order_count, 0)
    else 0 end::integer as order_count,
  case when asp_provenance = 'recent_30d' then completed_at - interval '30 days'
    when asp_provenance = 'historical_fallback' then completed_at - interval '180 days'
    else completed_at - interval '30 days' end as window_start,
  case when asp_provenance = 'recent_30d' then completed_at
    when asp_provenance = 'historical_fallback' then completed_at - interval '30 days'
    else completed_at end as window_end,
  case when asp_provenance = 'recent_30d' then recent_latest_sale_at
    when asp_provenance = 'historical_fallback' then historical_latest_sale_at
    else null end as latest_sale_at,
  completed_at as order_history_freshness,
  (completed_at is not null and earliest_order_at is not null and earliest_order_at <= completed_at - interval '30 days') as history_complete,
  case when asp_provenance = 'recent_30d' then recent_mapping_complete
    when asp_provenance = 'historical_fallback' then historical_mapping_complete
    else recent_mapping_complete and historical_mapping_complete end as mapping_complete,
  case when asp_provenance = 'unavailable' then 'unavailable' else 'available' end as availability,
  case
    when completed_at is null then 'shopify_order_history_unavailable'
    when completed_at < now() - interval '30 minutes' then 'shopify_order_history_stale'
    when earliest_order_at is null or earliest_order_at > completed_at - interval '30 days' then 'shopify_order_history_incomplete'
    when not recent_mapping_complete or (coalesce(recent_units_sold, 0) <= 0 and not historical_mapping_complete) then 'shopify_variant_mapping_ambiguous'
    when coalesce(recent_units_sold, 0) <= 0 and coalesce(historical_units_sold, 0) <= 0
      and coalesce(recent_non_gbp_units, 0) + coalesce(historical_non_gbp_units, 0) > 0 then 'shopify_sales_non_gbp_only'
    when coalesce(recent_units_sold, 0) <= 0 and coalesce(historical_units_sold, 0) <= 0 then 'no_net_shopify_sales'
    else null end as unavailable_reason,
  asp_provenance
from selected;

notify pgrst, 'reload schema';
