-- Phase 3A, step 1.  Populated authoritatively by shopify-sync; views are updated later.
alter table public.vault_variants
  add column if not exists option_1_name text,
  add column if not exists option_2_name text,
  add column if not exists option_3_name text,
  add column if not exists model_design text,
  add column if not exists normalized_size text,
  add column if not exists identity_resolution_status text not null default 'unresolved'
    check (identity_resolution_status in ('resolved', 'unresolved'));

-- Conservative one-time backfill.  It uses complete product structure only and
-- deliberately leaves Shopify option names null: reconciliation remains authoritative.
create function pg_temp.phase3a_size(value text) returns text language sql immutable as $$
  select case upper(trim(value))
    when 'S' then 'S' when 'SMALL' then 'S' when 'M' then 'M' when 'MEDIUM' then 'M'
    when 'L' then 'L' when 'LARGE' then 'L' when 'XL' then 'XL' when 'X-LARGE' then 'XL'
    when 'EXTRA LARGE' then 'XL' when 'XXL' then '2XL' when '2XL' then '2XL'
    when '2X' then '2XL' when 'XXXL' then '3XL' when '3XL' then '3XL' when '3X' then '3XL' end;
$$;

with product_roles as (
  select product_id,
    bool_and(nullif(trim(option_1), '') is null or pg_temp.phase3a_size(option_1) is not null) as one_sizes,
    bool_and(nullif(trim(option_2), '') is null or pg_temp.phase3a_size(option_2) is not null) as two_sizes,
    bool_or(nullif(trim(option_1), '') is not null) as one_present,
    bool_or(nullif(trim(option_2), '') is not null) as two_present
  from public.vault_variants where source = 'shopify' group by product_id
)
update public.vault_variants v set
  model_design = case when r.one_sizes and not r.two_present then 'Default' when r.two_sizes and not r.one_present then 'Default' when r.one_sizes then nullif(trim(v.option_2), '') when r.two_sizes then nullif(trim(v.option_1), '') end,
  normalized_size = case when r.one_sizes then pg_temp.phase3a_size(v.option_1) when r.two_sizes then pg_temp.phase3a_size(v.option_2) end,
  identity_resolution_status = 'resolved'
from product_roles r
where v.product_id = r.product_id and v.identity_resolution_status = 'unresolved'
  and ((r.one_present and r.one_sizes and not (r.two_present and r.two_sizes)) or (r.two_present and r.two_sizes and not (r.one_present and r.one_sizes)))
  and ((r.one_present and r.one_sizes and (not r.two_present or nullif(trim(v.option_2), '') is not null)) or (r.two_present and r.two_sizes and (not r.one_present or nullif(trim(v.option_1), '') is not null)));

-- Step 2B: resolved semantic identity is the only pack grouping input.
create or replace view public.vault_pack_inventory_intelligence as
with size_stock as (
  select p.id as product_id, p.title as product_name, p.handle, p.vendor,
    case when p.title ilike '%polo%' then 'polo_6_piece' else 'tee_5_piece' end as pack_profile,
    case when p.title ilike '%polo%' then 6 else 5 end as pack_size,
    v.model_design as colour_design,
    coalesce(sum(i.available_quantity) filter (where v.normalized_size = 'S'), 0)::integer as small_stock,
    coalesce(sum(i.available_quantity) filter (where v.normalized_size = 'M'), 0)::integer as medium_stock,
    coalesce(sum(i.available_quantity) filter (where v.normalized_size = 'L'), 0)::integer as large_stock,
    coalesce(sum(i.available_quantity) filter (where v.normalized_size = 'XL'), 0)::integer as xl_stock,
    coalesce(sum(i.available_quantity) filter (where v.normalized_size = '2XL'), 0)::integer as xxl_stock,
    coalesce(sum(i.available_quantity) filter (where v.normalized_size = '3XL'), 0)::integer as xxxl_stock,
    coalesce(sum(i.available_quantity), 0)::integer as total_available_stock,
    coalesce(sum(i.committed_quantity), 0)::integer as total_committed_stock,
    coalesce(sum(i.incoming_quantity), 0)::integer as total_incoming_stock,
    max(i.synced_at) as last_inventory_sync
  from public.vault_products p join public.vault_variants v on v.product_id = p.id
  left join public.vault_inventory_levels i on i.variant_id = v.id
  where p.source = 'shopify' and v.source_active = true and upper(coalesce(p.status, '')) = 'ACTIVE'
    and v.identity_resolution_status = 'resolved' and v.model_design is not null and v.normalized_size is not null
  group by p.id, p.title, p.handle, p.vendor, v.model_design
), packs as (
  select *, case when pack_profile = 'polo_6_piece' then least(small_stock,medium_stock,large_stock,xl_stock,xxl_stock,xxxl_stock)
    else least(small_stock,medium_stock,large_stock,xl_stock,xxl_stock) end::integer as complete_packs from size_stock
)
select product_id, product_name, handle, vendor, colour_design, pack_profile, pack_size,
  small_stock, medium_stock, large_stock, xl_stock, xxl_stock, xxxl_stock,
  total_available_stock, total_committed_stock, total_incoming_stock, complete_packs,
  (total_available_stock - complete_packs * pack_size)::integer as loose_units_after_complete_packs,
  case when pack_profile = 'polo_6_piece' then array_remove(array[case when small_stock=0 then 'S' end,case when medium_stock=0 then 'M' end,case when large_stock=0 then 'L' end,case when xl_stock=0 then 'XL' end,case when xxl_stock=0 then 'XXL' end,case when xxxl_stock=0 then 'XXXL' end],null)
  else array_remove(array[case when small_stock=0 then 'S' end,case when medium_stock=0 then 'M' end,case when large_stock=0 then 'L' end,case when xl_stock=0 then 'XL' end,case when xxl_stock=0 then 'XXL' end],null) end as missing_sizes,
  complete_packs > 0 as full_size_run_available, (total_available_stock > 0 and complete_packs = 0) as broken_size_run,
  case when total_available_stock=0 then 'out_of_stock' when complete_packs=0 then 'broken_size_run' when complete_packs=1 then 'critical' when complete_packs<=3 then 'low' when complete_packs<=6 then 'monitor' else 'healthy' end as stock_status,
  last_inventory_sync from packs;


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
  where shopify_created_at >=
    ('2026-05-04 00:00:00'::timestamp AT TIME ZONE 'Europe/London')
    and cancelled_at is null
    and coalesce((metadata ->> 'test')::boolean, false) = false
),
variant_styles as (
  select distinct
    v.product_id as parent_product_id,
    v.source_variant_id,
    v.product_id::text || '::' || trim(v.model_design) as style_id
  from public.vault_variants v
  where v.source = 'shopify'
    and v.source_variant_id is not null
    and v.identity_resolution_status = 'resolved'
    and nullif(trim(v.model_design), '') is not null
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
    and orders.shopify_created_at >=
      ('2026-05-04 00:00:00'::timestamp AT TIME ZONE 'Europe/London')
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

