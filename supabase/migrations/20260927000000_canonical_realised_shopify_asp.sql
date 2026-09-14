-- Canonical realised selling price. This is derived from completed Shopify order
-- evidence and intentionally leaves vault_product_costs.average_selling_price intact
-- as legacy operator-entered history.
create or replace view public.vault_product_realised_selling_price as
with latest_sync as (
  select completed_at
  from public.vault_shopify_order_sync_runs
  -- Match the canonical replenishment evidence: a successful bounded sync of at
  -- least seven days establishes freshness; complete thirty-day history is proved
  -- separately from the persisted order evidence below.
  where sync_days >= 7
  order by completed_at desc
  limit 1
),
valid_orders as (
  select o.*
  from public.vault_shopify_orders o
  cross join latest_sync s
  where o.cancelled_at is null
    and coalesce((o.metadata ->> 'test')::boolean, false) = false
    and o.shopify_created_at >= s.completed_at - interval '30 days'
    and o.shopify_created_at < s.completed_at
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
safe_lines as (
  select l.shopify_variant_id, o.id as order_id, o.shopify_created_at,
    o.currency, l.net_line_revenue,
    greatest(l.quantity - l.refunded_quantity, 0)::numeric as net_units,
    ownership.product_id, ownership.parent_count
  from public.vault_shopify_order_lines l
  join valid_orders o on o.id = l.order_id
  left join variant_ownership ownership
    on ownership.source_variant_id = l.shopify_variant_id
),
parent_sales as (
  select product_id,
    coalesce(sum(net_line_revenue) filter (where currency = 'GBP' and parent_count = 1), 0)::numeric as net_revenue_gbp,
    coalesce(sum(net_units) filter (where currency = 'GBP' and parent_count = 1), 0)::numeric as net_units_sold,
    count(distinct order_id) filter (where currency = 'GBP' and parent_count = 1 and net_units > 0)::integer as order_count,
    max(shopify_created_at) filter (where currency = 'GBP' and parent_count = 1 and net_units > 0) as latest_sale_at,
    coalesce(sum(net_units) filter (where parent_count = 1 and currency <> 'GBP'), 0)::numeric as non_gbp_units,
    coalesce(sum(net_units) filter (where parent_count <> 1), 0)::numeric as ambiguous_units
  from safe_lines
  where product_id is not null
  group by product_id
),
products_with_ambiguous_sales as (
  select distinct v.product_id
  from public.vault_variants v
  join variant_ownership ownership on ownership.source_variant_id = v.source_variant_id
  join safe_lines l on l.shopify_variant_id = v.source_variant_id
  where v.source = 'shopify' and ownership.parent_count <> 1 and l.net_units > 0
)
select p.id as product_id,
  case when s.completed_at is not null
      and s.completed_at >= now() - interval '30 minutes'
      and h.earliest_order_at <= s.completed_at - interval '30 days'
      and a.product_id is null
      and coalesce(ps.net_units_sold, 0) > 0
    then round(ps.net_revenue_gbp / nullif(ps.net_units_sold, 0), 2)
    else null end as realised_average_selling_price_gbp,
  coalesce(ps.net_revenue_gbp, 0)::numeric as net_revenue_gbp,
  coalesce(ps.net_units_sold, 0)::numeric as net_units_sold,
  coalesce(ps.order_count, 0)::integer as order_count,
  s.completed_at - interval '30 days' as window_start,
  s.completed_at as window_end,
  ps.latest_sale_at,
  s.completed_at as order_history_freshness,
  (s.completed_at is not null and h.earliest_order_at is not null
    and h.earliest_order_at <= s.completed_at - interval '30 days') as history_complete,
  (a.product_id is null) as mapping_complete,
  case
    when s.completed_at is null then 'unavailable'
    when s.completed_at < now() - interval '30 minutes' then 'unavailable'
    when h.earliest_order_at is null or h.earliest_order_at > s.completed_at - interval '30 days' then 'unavailable'
    when a.product_id is not null then 'unavailable'
    when coalesce(ps.net_units_sold, 0) <= 0 then 'unavailable'
    else 'available'
  end as availability,
  case
    when s.completed_at is null then 'shopify_order_history_unavailable'
    when s.completed_at < now() - interval '30 minutes' then 'shopify_order_history_stale'
    when h.earliest_order_at is null or h.earliest_order_at > s.completed_at - interval '30 days' then 'shopify_order_history_incomplete'
    when a.product_id is not null then 'shopify_variant_mapping_ambiguous'
    when coalesce(ps.net_units_sold, 0) <= 0 and coalesce(ps.non_gbp_units, 0) > 0 then 'shopify_sales_non_gbp_only'
    when coalesce(ps.net_units_sold, 0) <= 0 then 'no_net_shopify_sales'
    else null
  end as unavailable_reason
from public.vault_products p
left join parent_sales ps on ps.product_id = p.id
left join products_with_ambiguous_sales a on a.product_id = p.id
left join latest_sync s on true
cross join history h;

-- Preserve the former view as the stable source of operator-controlled replacement
-- cost inputs, then expose realised ASP as the canonical commercial value.
alter view public.vault_product_commercial_intelligence rename to vault_product_commercial_intelligence_legacy;

create view public.vault_product_commercial_intelligence as
select
  legacy.product_id, legacy.product_name, legacy.product_type, legacy.shopify_status,
  legacy.supplier_id, legacy.supplier_company, legacy.inventory_strategy,
  legacy.restock_enabled, legacy.pack_profile, legacy.currency,
  legacy.exchange_rate_to_gbp, legacy.pack_cost, legacy.shipping_cost_per_pack,
  legacy.import_cost_per_pack, legacy.units_per_pack, legacy.landed_cost_per_pack,
  legacy.landed_cost_per_pack_gbp, legacy.landed_cost_per_unit,
  asp.realised_average_selling_price_gbp as average_selling_price,
  case when asp.realised_average_selling_price_gbp is null or legacy.landed_cost_per_unit is null
    then null else round(asp.realised_average_selling_price_gbp - legacy.landed_cost_per_unit, 2) end as estimated_gross_profit_per_unit,
  case when asp.realised_average_selling_price_gbp is null or asp.realised_average_selling_price_gbp <= 0 or legacy.landed_cost_per_unit is null
    then null else round((asp.realised_average_selling_price_gbp - legacy.landed_cost_per_unit) / asp.realised_average_selling_price_gbp * 100, 2) end as estimated_margin_percent,
  case when asp.realised_average_selling_price_gbp is null or legacy.landed_cost_per_unit is null or legacy.landed_cost_per_unit <= 0
    then null else round((asp.realised_average_selling_price_gbp - legacy.landed_cost_per_unit) / legacy.landed_cost_per_unit * 100, 2) end as estimated_return_on_pack_capital_percent,
  case when legacy.inventory_strategy <> 'stocked' then true
    when legacy.supplier_id is null or legacy.pack_cost is null or legacy.pack_cost <= 0
      or legacy.units_per_pack is null or legacy.units_per_pack <= 0
      or asp.realised_average_selling_price_gbp is null or asp.realised_average_selling_price_gbp <= 0
      or legacy.exchange_rate_to_gbp <= 0 then false else true end as commercial_cost_trusted,
  array_remove(array[
    case when legacy.inventory_strategy = 'stocked' and legacy.supplier_id is null then 'supplier' end,
    case when legacy.inventory_strategy = 'stocked' and (legacy.pack_cost is null or legacy.pack_cost <= 0) then 'pack_cost' end,
    case when legacy.inventory_strategy = 'stocked' and (legacy.units_per_pack is null or legacy.units_per_pack <= 0) then 'units_per_pack' end,
    case when legacy.inventory_strategy = 'stocked' and (asp.realised_average_selling_price_gbp is null or asp.realised_average_selling_price_gbp <= 0) then 'average_selling_price' end,
    case when legacy.inventory_strategy = 'stocked' and legacy.exchange_rate_to_gbp <= 0 then 'exchange_rate' end
  ], null) as missing_commercial_requirements,
  legacy.last_supplier_price_update, legacy.commercial_notes, legacy.cost_created_at, legacy.cost_updated_at,
  asp.net_revenue_gbp, asp.net_units_sold, asp.order_count, asp.window_start,
  asp.window_end, asp.latest_sale_at, asp.order_history_freshness,
  asp.history_complete, asp.mapping_complete, asp.availability as realised_asp_availability,
  asp.unavailable_reason as realised_asp_unavailable_reason
from public.vault_product_commercial_intelligence_legacy legacy
left join public.vault_product_realised_selling_price asp on asp.product_id = legacy.product_id;

create or replace view public.vault_product_commercial_summary as
select count(*)::integer as total_products,
  count(*) filter (where inventory_strategy = 'stocked')::integer as stocked_products,
  count(*) filter (where inventory_strategy = 'stocked' and commercial_cost_trusted)::integer as commercially_configured_products,
  count(*) filter (where inventory_strategy = 'stocked' and not commercial_cost_trusted)::integer as products_missing_costs,
  case when count(*) filter (where inventory_strategy = 'stocked') = 0 then 0 else round(
    count(*) filter (where inventory_strategy = 'stocked' and commercial_cost_trusted)::numeric /
    count(*) filter (where inventory_strategy = 'stocked') * 100, 1) end as commercial_completion_percentage
from public.vault_product_commercial_intelligence;

notify pgrst, 'reload schema';
