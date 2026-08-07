-- Append canonical sales signals required by deterministic demand scoring.

create or replace view public.vault_style_replenishment_intelligence as
with latest_sync as (
  select completed_at, sync_days
  from public.vault_shopify_order_sync_runs
  where sync_days >= 7
  order by completed_at desc
  limit 1
),
canonical_history as (
  select min(shopify_created_at) as earliest_order_at
  from public.vault_shopify_orders
),
variant_styles as (
  select distinct
    v.product_id as parent_product_id,
    v.source_variant_id,
    v.product_id::text || '::' || coalesce(nullif(trim(v.option_1), ''), 'Default') as style_id
  from public.vault_variants v
  where v.source = 'shopify' and v.source_variant_id is not null
),
style_sales as (
  select
    mapping.style_id,
    sum(greatest(line.quantity - line.refunded_quantity, 0)) filter (
      where orders.shopify_created_at >= sync.completed_at - interval '7 days'
    )::numeric as sales_7_day_units,
    sum(greatest(line.quantity - line.refunded_quantity, 0)) filter (
      where orders.shopify_created_at >= sync.completed_at - interval '14 days'
    )::numeric as sales_14_day_units,
    sum(greatest(line.quantity - line.refunded_quantity, 0)) filter (
      where orders.shopify_created_at >= sync.completed_at - interval '30 days'
    )::numeric as sales_30_day_units,
    max(orders.shopify_created_at) filter (
      where greatest(line.quantity - line.refunded_quantity, 0) > 0
    ) as last_sale_date
  from public.vault_shopify_order_lines line
  join public.vault_shopify_orders orders on orders.id = line.order_id
  join variant_styles mapping on mapping.source_variant_id = line.shopify_variant_id
  cross join latest_sync sync
  where orders.cancelled_at is null
    and coalesce((orders.metadata ->> 'test')::boolean, false) = false
    and orders.shopify_created_at < sync.completed_at
  group by mapping.style_id
),
style_mapping as (
  select style_id, count(*)::integer as mapped_variant_count
  from variant_styles
  group by style_id
)
select
  style.style_id,
  style.parent_product_id,
  style.stock_on_hand,
  style.committed_stock,
  style.incoming_stock,
  case
    when style.stock_on_hand is null or style.committed_stock is null or style.incoming_stock is null then null
    else style.stock_on_hand - style.committed_stock + style.incoming_stock
  end as net_available_stock,
  case when sync.completed_at is not null and mapping.mapped_variant_count > 0
    then coalesce(sales.sales_7_day_units, 0) / 7.0 else null end as average_daily_sales,
  case when sync.completed_at is not null and mapping.mapped_variant_count > 0
    then coalesce(sales.sales_7_day_units, 0) else null end as average_weekly_sales,
  case when sync.completed_at is not null and mapping.mapped_variant_count > 0 then 7 else null end as sales_history_days,
  null::numeric as reorder_point,
  null::numeric as safety_stock,
  style.target_stock_days,
  supplier.default_lead_time_days as supplier_lead_time_days,
  coalesce(commercial.units_per_pack, style.pack_size) as units_per_pack,
  style.supplier_moq_packs,
  inventory.last_inventory_sync as freshness,
  case
    when supplier.minimum_order_value = 0 and supplier_rule.minimum_order_packs = 0 then 'not_applicable'
    when supplier.minimum_order_value > 0 or supplier_rule.minimum_order_packs > 0 then 'not_satisfied'
    else 'unknown'
  end as supplier_minimum_order_state,
  (
    sync.completed_at is not null
    and sync.completed_at >= now() - interval '30 minutes'
    and inventory.last_inventory_sync is not null
    and inventory.last_inventory_sync >= now() - interval '30 minutes'
    and mapping.mapped_variant_count > 0
    and style.stock_on_hand is not null
    and style.committed_stock is not null
    and style.incoming_stock is not null
    and supplier.is_active = true
    and supplier.default_lead_time_days > 0
    and style.target_stock_days > 0
    and coalesce(commercial.units_per_pack, style.pack_size) > 0
    and style.supplier_moq_packs is not null
    and style.supplier_moq_packs >= 0
  ) as trusted,
  array_remove(array[
    case when sync.completed_at is null then 'sales_history_unavailable' end,
    case when sync.completed_at < now() - interval '30 minutes' then 'sales_history_stale' end,
    case when coalesce(mapping.mapped_variant_count, 0) = 0 then 'variant_mapping_missing' end,
    case when style.stock_on_hand is null then 'stock_unavailable' end,
    case when style.committed_stock is null then 'committed_stock_unavailable' end,
    case when style.incoming_stock is null then 'incoming_stock_unavailable' end,
    case when inventory.last_inventory_sync is null then 'inventory_freshness_unavailable' end,
    case when inventory.last_inventory_sync < now() - interval '30 minutes' then 'inventory_stale' end,
    case when supplier.is_active is distinct from true then 'active_supplier_missing' end,
    case when supplier.default_lead_time_days is null or supplier.default_lead_time_days <= 0 then 'supplier_lead_time_missing' end,
    case when style.target_stock_days is null or style.target_stock_days <= 0 then 'target_stock_days_missing' end,
    case when coalesce(commercial.units_per_pack, style.pack_size) is null or coalesce(commercial.units_per_pack, style.pack_size) <= 0 then 'units_per_pack_missing' end,
    case when style.supplier_moq_packs is null or style.supplier_moq_packs < 0 then 'supplier_moq_missing' end
  ], null) as missing_requirements,
  sync.completed_at as order_history_freshness,
  array_remove(array[
    case when supplier.minimum_order_value is null then 'supplier_minimum_value_unknown' end,
    case when supplier.minimum_order_value > 0 then 'supplier_minimum_value_not_evaluated' end,
    case when supplier_rule.minimum_order_packs is null then 'supplier_minimum_packs_unknown' end,
    case when supplier_rule.minimum_order_packs > 0 then 'supplier_minimum_packs_not_evaluated' end
  ], null) as supplier_policy_requirements,
  case when sync.completed_at is not null and mapping.mapped_variant_count > 0
    then coalesce(sales.sales_7_day_units, 0) else null end as sales_7_day_units,
  case when sync.completed_at is not null and mapping.mapped_variant_count > 0
    then coalesce(sales.sales_14_day_units, 0) else null end as sales_14_day_units,
  case when sync.completed_at is not null and mapping.mapped_variant_count > 0
    then coalesce(sales.sales_30_day_units, 0) else null end as sales_30_day_units,
  sales.last_sale_date,
  case when sales.last_sale_date is null then null
    else greatest(0, floor(extract(epoch from (sync.completed_at - sales.last_sale_date)) / 86400))::integer
  end as days_since_last_sale,
  (
    sync.completed_at is not null
    and mapping.mapped_variant_count > 0
    and history.earliest_order_at is not null
    and history.earliest_order_at <= sync.completed_at - interval '30 days'
  ) as sales_history_30_complete
from public.vault_style_catalogue_intelligence style
left join style_mapping mapping on mapping.style_id = style.style_id
left join style_sales sales on sales.style_id = style.style_id
left join public.vault_pack_inventory_intelligence inventory
  on inventory.product_id = style.parent_product_id and inventory.colour_design = style.style_name
left join public.vault_product_commercial_intelligence commercial on commercial.product_id = style.parent_product_id
left join public.vault_suppliers supplier on supplier.id = style.supplier_id
left join public.vault_supplier_purchasing_rules supplier_rule on supplier_rule.supplier_id = supplier.id
left join latest_sync sync on true
left join canonical_history history on true;

revoke all on public.vault_style_replenishment_intelligence from anon, authenticated;
notify pgrst, 'reload schema';
