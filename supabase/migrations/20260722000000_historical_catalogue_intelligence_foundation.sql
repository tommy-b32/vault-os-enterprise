-- ============================================================================
-- VAULT OS REPLAY COMPATIBILITY BOOTSTRAP
-- PROVENANCE CLASS: HISTORICAL_AUTHORITATIVE
--
-- This migration reconstructs historically source-backed structural foundations
-- that predate the active Supabase migration sequence. It contains schema only
-- and intentionally excludes historical operational/business data.
--
-- Sources: database/008, 009, 012, 013, 015, 016, and 017.
-- Explicitly excluded: all historical data/backfill INSERT statements, supplier
-- master data, wallet/account/policy data, transactions, schedules, cron,
-- secrets, URLs, and later schema evolution.
-- ============================================================================
-- BEGIN HISTORICAL SOURCE: database/008_shopify_catalog_sync.sql
-- ============================================================
-- VAULT OS
-- Migration 008: Shopify Catalogue and Inventory Sync
-- ============================================================

create table if not exists public.vault_products (
  id uuid primary key default gen_random_uuid(),

  source text not null default 'shopify',
  source_product_id text not null,

  title text not null,
  handle text,
  vendor text,
  product_type text,
  status text,

  featured_image_url text,
  shopify_updated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (source, source_product_id)
);


create table if not exists public.vault_variants (
  id uuid primary key default gen_random_uuid(),

  product_id uuid not null
    references public.vault_products(id)
    on delete cascade,

  source text not null default 'shopify',
  source_variant_id text not null,
  source_inventory_item_id text,

  title text,
  sku text,
  barcode text,

  option_1 text,
  option_2 text,
  option_3 text,

  price numeric(12, 2),
  compare_at_price numeric(12, 2),

  available_for_sale boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (source, source_variant_id)
);


create table if not exists public.vault_locations (
  id uuid primary key default gen_random_uuid(),

  source text not null default 'shopify',
  source_location_id text not null,

  name text not null,
  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (source, source_location_id)
);


create table if not exists public.vault_inventory_levels (
  id uuid primary key default gen_random_uuid(),

  variant_id uuid not null
    references public.vault_variants(id)
    on delete cascade,

  location_id uuid not null
    references public.vault_locations(id)
    on delete cascade,

  available_quantity integer not null default 0,
  committed_quantity integer not null default 0,
  incoming_quantity integer not null default 0,
  on_hand_quantity integer not null default 0,

  synced_at timestamptz not null default now(),

  unique (variant_id, location_id)
);


create index if not exists
  vault_products_handle_index
on public.vault_products(handle);


create index if not exists
  vault_variants_product_id_index
on public.vault_variants(product_id);


create index if not exists
  vault_variants_sku_index
on public.vault_variants(sku);


create index if not exists
  vault_inventory_levels_variant_index
on public.vault_inventory_levels(variant_id);


-- Operational catalogue data must not be publicly writable.

revoke all
  on table public.vault_products
  from anon;

revoke all
  on table public.vault_variants
  from anon;

revoke all
  on table public.vault_locations
  from anon;

revoke all
  on table public.vault_inventory_levels
  from anon;


notify pgrst, 'reload schema';
-- END HISTORICAL SOURCE: database/008_shopify_catalog_sync.sql


-- BEGIN HISTORICAL SOURCE: database/009_inventory_intelligence.sql
-- ============================================
-- Vault OS
-- Sprint 014.1
-- Inventory Intelligence Foundation
-- ============================================

create or replace view vault_inventory_intelligence as

select

    p.id                 as product_id,
    p.title              as product_name,
    p.vendor,
    p.product_type,

    count(v.id)          as total_variants,

    coalesce(
        sum(i.available_quantity),
        0
    )                    as stock_on_hand,

    coalesce(
        sum(i.committed_quantity),
        0
    )                    as committed_stock,

    coalesce(
        sum(i.incoming_quantity),
        0
    )                    as incoming_stock,

    max(i.synced_at)     as last_inventory_sync

from vault_products p

left join vault_variants v

    on v.product_id = p.id

left join vault_inventory_levels i

    on i.variant_id = v.id

group by

    p.id,
    p.title,
    p.vendor,
    p.product_type;

    -- ============================================================
-- VAULT OS
-- Sprint 014.2: Pack-Aware Inventory Intelligence
--
-- Tee pack:
-- S, M, L, XL, XXL
--
-- Polo pack:
-- S, M, L, XL, XXL, XXXL
-- ============================================================

create or replace view public.vault_variant_inventory_normalized as

select
  p.id as product_id,
  p.title as product_name,
  p.handle,
  p.vendor,

  case
    when p.title ilike '%polo%'
      then 'polo_6_piece'
    else 'tee_5_piece'
  end as pack_profile,

  case
    when p.title ilike '%polo%'
      then 6
    else 5
  end as pack_size,

  coalesce(
    nullif(trim(v.option_1), ''),
    'Default'
  ) as colour_design,

  v.id as variant_id,
  v.title as variant_title,

  v.option_2 as size_raw,

  case
    when upper(trim(v.option_2)) in ('S', 'SMALL')
      then 'S'

    when upper(trim(v.option_2)) in ('M', 'MEDIUM')
      then 'M'

    when upper(trim(v.option_2)) in ('L', 'LARGE')
      then 'L'

    when upper(trim(v.option_2)) in ('XL', 'X-LARGE', 'EXTRA LARGE')
      then 'XL'

    when upper(trim(v.option_2)) in (
      '2XL',
      'XXL',
      '2X',
      'XX-LARGE',
      'EXTRA EXTRA LARGE'
    )
      then 'XXL'

    when upper(trim(v.option_2)) in (
      '3XL',
      'XXXL',
      '3X',
      'XXX-LARGE',
      'EXTRA EXTRA EXTRA LARGE'
    )
      then 'XXXL'

    else upper(trim(v.option_2))
  end as normalized_size,

  coalesce(
    sum(i.available_quantity),
    0
  )::integer as available_quantity,

  coalesce(
    sum(i.committed_quantity),
    0
  )::integer as committed_quantity,

  coalesce(
    sum(i.incoming_quantity),
    0
  )::integer as incoming_quantity,

  max(i.synced_at) as last_inventory_sync

from public.vault_products p

join public.vault_variants v
  on v.product_id = p.id

left join public.vault_inventory_levels i
  on i.variant_id = v.id

where p.source = 'shopify'
  and upper(coalesce(p.status, '')) = 'ACTIVE'

  -- Exclude dropship shoe products from owned-stock intelligence.
  and not (
    v.option_2 is null
    and upper(trim(v.option_1)) ~ '^[0-9]+(\.[0-9]+)?$'
  )

group by
  p.id,
  p.title,
  p.handle,
  p.vendor,
  v.id,
  v.title,
  v.option_1,
  v.option_2;


create or replace view public.vault_pack_inventory_intelligence as

with size_stock as (

  select
    product_id,
    product_name,
    handle,
    vendor,
    pack_profile,
    pack_size,
    colour_design,

    coalesce(
      sum(available_quantity)
        filter (where normalized_size = 'S'),
      0
    )::integer as small_stock,

    coalesce(
      sum(available_quantity)
        filter (where normalized_size = 'M'),
      0
    )::integer as medium_stock,

    coalesce(
      sum(available_quantity)
        filter (where normalized_size = 'L'),
      0
    )::integer as large_stock,

    coalesce(
      sum(available_quantity)
        filter (where normalized_size = 'XL'),
      0
    )::integer as xl_stock,

    coalesce(
      sum(available_quantity)
        filter (where normalized_size = 'XXL'),
      0
    )::integer as xxl_stock,

    coalesce(
      sum(available_quantity)
        filter (where normalized_size = 'XXXL'),
      0
    )::integer as xxxl_stock,

    coalesce(
      sum(available_quantity),
      0
    )::integer as total_available_stock,

    coalesce(
      sum(committed_quantity),
      0
    )::integer as total_committed_stock,

    coalesce(
      sum(incoming_quantity),
      0
    )::integer as total_incoming_stock,

    max(last_inventory_sync) as last_inventory_sync

  from public.vault_variant_inventory_normalized

  group by
    product_id,
    product_name,
    handle,
    vendor,
    pack_profile,
    pack_size,
    colour_design
),

pack_calculation as (

  select
    *,

    case
      when pack_profile = 'polo_6_piece'
        then least(
          small_stock,
          medium_stock,
          large_stock,
          xl_stock,
          xxl_stock,
          xxxl_stock
        )

      else least(
        small_stock,
        medium_stock,
        large_stock,
        xl_stock,
        xxl_stock
      )
    end::integer as complete_packs

  from size_stock
)

select
  product_id,
  product_name,
  handle,
  vendor,
  colour_design,

  pack_profile,
  pack_size,

  small_stock,
  medium_stock,
  large_stock,
  xl_stock,
  xxl_stock,
  xxxl_stock,

  total_available_stock,
  total_committed_stock,
  total_incoming_stock,

  complete_packs,

  (
    total_available_stock
    - (complete_packs * pack_size)
  )::integer as loose_units_after_complete_packs,

  case
    when pack_profile = 'polo_6_piece' then
      array_remove(
        array[
          case when small_stock = 0 then 'S' end,
          case when medium_stock = 0 then 'M' end,
          case when large_stock = 0 then 'L' end,
          case when xl_stock = 0 then 'XL' end,
          case when xxl_stock = 0 then 'XXL' end,
          case when xxxl_stock = 0 then 'XXXL' end
        ],
        null
      )

    else
      array_remove(
        array[
          case when small_stock = 0 then 'S' end,
          case when medium_stock = 0 then 'M' end,
          case when large_stock = 0 then 'L' end,
          case when xl_stock = 0 then 'XL' end,
          case when xxl_stock = 0 then 'XXL' end
        ],
        null
      )
  end as missing_sizes,

  complete_packs > 0
    as full_size_run_available,

  (
    total_available_stock > 0
    and complete_packs = 0
  ) as broken_size_run,

  case
    when total_available_stock = 0
      then 'out_of_stock'

    when complete_packs = 0
      then 'broken_size_run'

    when complete_packs = 1
      then 'critical'

    when complete_packs <= 3
      then 'low'

    when complete_packs <= 6
      then 'monitor'

    else 'healthy'
  end as stock_status,

  last_inventory_sync

from pack_calculation;
-- END HISTORICAL SOURCE: database/009_inventory_intelligence.sql


-- BEGIN HISTORICAL SOURCE: database/012_product_settings.sql
-- ============================================================
-- VAULT OS
-- Sprint 017: Product Master Settings
-- ============================================================

create table if not exists public.vault_product_settings (
  id uuid primary key default gen_random_uuid(),

  product_id uuid not null
    references public.vault_products(id)
    on delete cascade,

  supplier_id uuid null
    references public.vault_suppliers(id)
    on delete set null,

  inventory_strategy text not null default 'stocked'
    check (
      inventory_strategy in (
        'stocked',
        'do_not_restock',
        'discontinued',
        'dropship',
        'service'
      )
    ),

  restock_enabled boolean not null default true,

  pack_profile text null
    check (
      pack_profile is null
      or pack_profile in (
        'tee_5_piece',
        'polo_6_piece',
        'hoodie',
        'custom'
      )
    ),

  supplier_moq_packs integer null
    check (
      supplier_moq_packs is null
      or supplier_moq_packs >= 0
    ),

  target_stock_days integer null
    check (
      target_stock_days is null
      or target_stock_days >= 0
    ),

  decision_reason text null,
  notes text null,

  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint vault_product_settings_product_unique
    unique (product_id)
);

create index if not exists
  vault_product_settings_supplier_idx
on public.vault_product_settings(supplier_id);

create index if not exists
  vault_product_settings_strategy_idx
on public.vault_product_settings(inventory_strategy);

create or replace function public.set_vault_product_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists
  vault_product_settings_updated_at
on public.vault_product_settings;

create trigger vault_product_settings_updated_at
before update on public.vault_product_settings
for each row
execute function public.set_vault_product_settings_updated_at();



create or replace view public.vault_product_master as
select
  p.id as product_id,
  p.title as product_name,
  p.handle,
  p.vendor,
  p.product_type,
  p.status,

  s.id as supplier_id,
  s.supplier_name as supplier_company,

  ps.inventory_strategy,
  ps.restock_enabled,
  ps.pack_profile,
  ps.supplier_moq_packs,
  ps.target_stock_days,
  ps.decision_reason,
  ps.notes,
  ps.updated_at as settings_updated_at

from public.vault_products p

left join public.vault_product_settings ps
  on ps.product_id = p.id

left join public.vault_suppliers s
  on s.id = ps.supplier_id;
-- END HISTORICAL SOURCE: database/012_product_settings.sql


-- BEGIN HISTORICAL SOURCE: database/013_configuration_intelligence.sql
-- ============================================================
-- VAULT OS
-- Sprint 018: Configuration Intelligence
-- ============================================================

create or replace view public.vault_configuration_intelligence as

with product_configuration as (

  select
    pm.product_id,
    pm.product_name,
    pm.handle,
    pm.vendor,
    pm.product_type,
    pm.status as shopify_status,

    pm.supplier_id,
    pm.supplier_company,

    coalesce(
      pm.inventory_strategy,
      'stocked'
    ) as inventory_strategy,

    coalesce(
      pm.restock_enabled,
      true
    ) as restock_enabled,

    pm.pack_profile,
    pm.supplier_moq_packs,
    pm.target_stock_days,
    pm.decision_reason,
    pm.notes,
    pm.settings_updated_at,

    /*
     * Supplier requirement
     *
     * Required for stocked and dropship products.
     * Optional for do-not-restock, discontinued and service.
     */
    case
      when coalesce(pm.inventory_strategy, 'stocked')
        in ('do_not_restock', 'discontinued', 'service')
        then true
      else pm.supplier_id is not null
    end as supplier_complete,

    /*
     * Inventory strategy is always required.
     */
    case
      when coalesce(pm.inventory_strategy, '') in (
        'stocked',
        'do_not_restock',
        'discontinued',
        'dropship',
        'service'
      )
        then true
      else false
    end as strategy_complete,

    /*
     * Pack profile is required only for stocked products.
     */
    case
      when coalesce(pm.inventory_strategy, 'stocked') <> 'stocked'
        then true
      else pm.pack_profile is not null
    end as pack_profile_complete,

    /*
     * MOQ is required only for stocked products that can be restocked.
     */
    case
      when coalesce(pm.inventory_strategy, 'stocked') <> 'stocked'
        then true
      when coalesce(pm.restock_enabled, true) = false
        then true
      else (
        pm.supplier_moq_packs is not null
        and pm.supplier_moq_packs >= 0
      )
    end as moq_complete,

    /*
     * Target stock days are required only for stocked products
     * that can be restocked.
     */
    case
      when coalesce(pm.inventory_strategy, 'stocked') <> 'stocked'
        then true
      when coalesce(pm.restock_enabled, true) = false
        then true
      else (
        pm.target_stock_days is not null
        and pm.target_stock_days > 0
      )
    end as target_days_complete

  from public.vault_product_master pm
),

scored_configuration as (

  select
    *,

    (
      case when supplier_complete then 20 else 0 end
      +
      case when strategy_complete then 20 else 0 end
      +
      case when pack_profile_complete then 20 else 0 end
      +
      case when moq_complete then 20 else 0 end
      +
      case when target_days_complete then 20 else 0 end
    )::integer as configuration_score,

    array_remove(
      array[
        case
          when not supplier_complete
            then 'supplier'
        end,

        case
          when not strategy_complete
            then 'inventory_strategy'
        end,

        case
          when not pack_profile_complete
            then 'pack_profile'
        end,

        case
          when not moq_complete
            then 'supplier_moq'
        end,

        case
          when not target_days_complete
            then 'target_stock_days'
        end
      ],
      null
    ) as missing_requirements

  from product_configuration
)

select
  product_id,
  product_name,
  handle,
  vendor,
  product_type,
  shopify_status,

  supplier_id,
  supplier_company,

  inventory_strategy,
  restock_enabled,
  pack_profile,
  supplier_moq_packs,
  target_stock_days,
  decision_reason,
  notes,
  settings_updated_at,

  supplier_complete,
  strategy_complete,
  pack_profile_complete,
  moq_complete,
  target_days_complete,

  configuration_score,
  missing_requirements,

  cardinality(missing_requirements)
    as missing_requirement_count,

  case
    when inventory_strategy = 'dropship'
      and configuration_score = 100
      then 'dropship_ready'

    when inventory_strategy = 'do_not_restock'
      then 'do_not_restock'

    when inventory_strategy = 'discontinued'
      then 'discontinued'

    when inventory_strategy = 'service'
      then 'service'

    when configuration_score = 100
      then 'ready'

    when configuration_score = 80
      then 'almost_ready'

    else 'needs_configuration'
  end as configuration_state,

  /*
   * Vault Brain may trust the configuration itself.
   */
  configuration_score = 100
    as configuration_trusted,

  /*
   * Reorder recommendations are permitted only for fully
   * configured, stocked and restock-enabled products.
   */
  (
    configuration_score = 100
    and inventory_strategy = 'stocked'
    and restock_enabled = true
  ) as trusted_for_reorder,

  case
    when configuration_score = 100
      then 'high'

    when configuration_score = 80
      then 'limited'

    else 'untrusted'
  end as brain_confidence

from scored_configuration;


create or replace view public.vault_configuration_summary as

select
  count(*)::integer as total_products,

  count(*) filter (
    where configuration_score = 100
  )::integer as fully_configured_products,

  count(*) filter (
    where configuration_score < 100
  )::integer as products_needing_configuration,

  count(*) filter (
    where configuration_state = 'almost_ready'
  )::integer as almost_ready_products,

  count(*) filter (
    where configuration_state = 'dropship_ready'
  )::integer as dropship_products,

  count(*) filter (
    where configuration_state = 'do_not_restock'
  )::integer as do_not_restock_products,

  count(*) filter (
    where configuration_state = 'discontinued'
  )::integer as discontinued_products,

  count(*) filter (
    where configuration_state = 'service'
  )::integer as service_products,

  count(*) filter (
    where trusted_for_reorder = true
  )::integer as reorder_ready_products,

  coalesce(
    round(avg(configuration_score), 1),
    0
  ) as average_configuration_score,

  case
    when count(*) = 0
      then 0
    else round(
      (
        count(*) filter (
          where configuration_score = 100
        )::numeric
        /
        count(*)::numeric
      ) * 100,
      1
    )
  end as catalogue_completion_percentage

from public.vault_configuration_intelligence;


notify pgrst, 'reload schema';
-- END HISTORICAL SOURCE: database/013_configuration_intelligence.sql


-- BEGIN HISTORICAL SOURCE: database/015_product_cost_intelligence.sql
-- ============================================================
-- VAULT OS
-- Sprint 019.2
-- Product Cost Intelligence
-- ============================================================

create table if not exists public.vault_product_costs (

  id uuid primary key default gen_random_uuid(),

  product_id uuid not null
    references public.vault_products(id)
    on delete cascade,

  supplier_id uuid null
    references public.vault_suppliers(id)
    on delete set null,

  currency text not null default 'GBP',

  pack_cost numeric(12,2),

  units_per_pack integer,

  shipping_cost_per_pack numeric(12,2) default 0,

  import_cost_per_pack numeric(12,2) default 0,

  landed_cost_per_pack numeric(12,2),

  landed_cost_per_unit numeric(12,2),

  average_selling_price numeric(12,2),

  estimated_gross_margin numeric(12,2),

  estimated_margin_percent numeric(5,2),

  capital_efficiency_score numeric(5,2),

  return_on_capital numeric(8,2),

  last_supplier_price_update date,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint vault_product_costs_product_unique
    unique(product_id)

);

create index if not exists
vault_product_costs_supplier_idx
on public.vault_product_costs(supplier_id);

create or replace function public.set_vault_product_cost_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists
vault_product_costs_updated
on public.vault_product_costs;

create trigger
vault_product_costs_updated

before update
on public.vault_product_costs

for each row

execute function
public.set_vault_product_cost_updated_at();



notify pgrst,'reload schema';
-- END HISTORICAL SOURCE: database/015_product_cost_intelligence.sql


-- BEGIN HISTORICAL SOURCE: database/016_supplier_purchasing_rules.sql
-- ============================================================
-- VAULT OS
-- Sprint 020: Purchasing Recommendation Engine
-- Supplier Purchasing Rules
-- ============================================================

create table if not exists public.vault_supplier_purchasing_rules (
  id uuid primary key default gen_random_uuid(),

  supplier_id uuid not null
    references public.vault_suppliers(id)
    on delete cascade,

  fulfilment_model text not null default 'stocked'
    check (
      fulfilment_model in (
        'stocked',
        'dropship',
        'service'
      )
    ),

  minimum_order_packs integer null
    check (
      minimum_order_packs is null
      or minimum_order_packs >= 0
    ),

  mixed_products_allowed boolean not null default false,

  typical_order_min_packs integer null
    check (
      typical_order_min_packs is null
      or typical_order_min_packs >= 0
    ),

  typical_order_max_packs integer null
    check (
      typical_order_max_packs is null
      or typical_order_max_packs >= 0
    ),

  recommendation_enabled boolean not null default true,

  rules_confirmed boolean not null default false,

  notes text null,

  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint vault_supplier_purchasing_rules_supplier_unique
    unique (supplier_id),

  constraint vault_supplier_order_range_valid
    check (
      typical_order_min_packs is null
      or typical_order_max_packs is null
      or typical_order_max_packs >= typical_order_min_packs
    )
);

create index if not exists
  vault_supplier_purchasing_rules_model_idx
on public.vault_supplier_purchasing_rules(
  fulfilment_model
);

create or replace function
  public.set_vault_supplier_purchasing_rules_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists
  vault_supplier_purchasing_rules_updated_at
on public.vault_supplier_purchasing_rules;

create trigger
  vault_supplier_purchasing_rules_updated_at
before update
on public.vault_supplier_purchasing_rules
for each row
execute function
  public.set_vault_supplier_purchasing_rules_updated_at();


-- Exclusive:
-- Minimum 20 packs across a mixed order.
-- Typical orders are 20–40 packs.



-- Icon:
-- Stocked supplier, but MOQ still needs confirming.



-- Tony:
-- Dropship footwear only; never recommend owned-stock orders.



create or replace view
  public.vault_supplier_purchasing_readiness
as
select
  s.id as supplier_id,
  s.supplier_name,
  s.currency_code,
  s.default_lead_time_days,
  s.is_active,

  r.fulfilment_model,
  r.minimum_order_packs,
  r.mixed_products_allowed,
  r.typical_order_min_packs,
  r.typical_order_max_packs,
  r.recommendation_enabled,
  r.rules_confirmed,
  r.notes as purchasing_rule_notes,

  case
    when r.supplier_id is null
      then 'setup_required'

    when r.fulfilment_model = 'dropship'
      then 'dropship'

    when r.rules_confirmed = false
      then 'rule_incomplete'

    when r.recommendation_enabled = true
      then 'ready'

    else 'disabled'
  end as purchasing_readiness_state

from public.vault_suppliers s

left join public.vault_supplier_purchasing_rules r
  on r.supplier_id = s.id

where s.is_active = true;


notify pgrst, 'reload schema';
-- END HISTORICAL SOURCE: database/016_supplier_purchasing_rules.sql


-- BEGIN HISTORICAL SOURCE: database/017_product_commercial_intelligence.sql
-- ============================================================
-- VAULT OS
-- Sprint 020.2
-- Product Commercial Intelligence
-- ============================================================

create or replace view
  public.vault_product_commercial_intelligence
as

with commercial_base as (
  select
    pm.product_id,
    pm.product_name,
    pm.product_type,
    pm.status as shopify_status,

    pm.supplier_id,
    pm.supplier_company,
    pm.inventory_strategy,
    pm.restock_enabled,
    pm.pack_profile,

    pc.currency,

    pc.pack_cost,
    pc.shipping_cost_per_pack,
    pc.import_cost_per_pack,

    /*
     * Use a manual units-per-pack override when one exists.
     * Otherwise infer it from the saved pack profile.
     */
    coalesce(
      pc.units_per_pack,
      case
        when pm.pack_profile = 'tee_5_piece'
          then 5

        when pm.pack_profile = 'polo_6_piece'
          then 6

        else null
      end
    )::integer as units_per_pack,

    pc.average_selling_price,
    pc.last_supplier_price_update,
    pc.notes as commercial_notes,

    pc.created_at as cost_created_at,
    pc.updated_at as cost_updated_at

  from public.vault_product_master pm

  left join public.vault_product_costs pc
    on pc.product_id = pm.product_id
),

calculated_costs as (
  select
    *,

    case
      when pack_cost is null
        then null

      else round(
        pack_cost
        + coalesce(shipping_cost_per_pack, 0)
        + coalesce(import_cost_per_pack, 0),
        2
      )
    end as landed_cost_per_pack

  from commercial_base
),

unit_economics as (
  select
    *,

    case
      when landed_cost_per_pack is null
        or units_per_pack is null
        or units_per_pack <= 0
        then null

      else round(
        landed_cost_per_pack
        / units_per_pack,
        2
      )
    end as landed_cost_per_unit

  from calculated_costs
)

select
  product_id,
  product_name,
  product_type,
  shopify_status,

  supplier_id,
  supplier_company,
  inventory_strategy,
  restock_enabled,
  pack_profile,

  currency,
  pack_cost,
  shipping_cost_per_pack,
  import_cost_per_pack,
  units_per_pack,

  landed_cost_per_pack,
  landed_cost_per_unit,

  average_selling_price,

  case
    when average_selling_price is null
      or landed_cost_per_unit is null
      then null

    else round(
      average_selling_price
      - landed_cost_per_unit,
      2
    )
  end as estimated_gross_profit_per_unit,

  case
    when average_selling_price is null
      or average_selling_price <= 0
      or landed_cost_per_unit is null
      then null

    else round(
      (
        average_selling_price
        - landed_cost_per_unit
      )
      / average_selling_price
      * 100,
      2
    )
  end as estimated_margin_percent,

  case
    when landed_cost_per_unit is null
      or landed_cost_per_unit <= 0
      or average_selling_price is null
      then null

    else round(
      (
        average_selling_price
        - landed_cost_per_unit
      )
      / landed_cost_per_unit
      * 100,
      2
    )
  end as estimated_return_on_pack_capital_percent,

  /*
   * Cost readiness is intentionally separate from Product
   * Readiness. Sales history will later strengthen confidence.
   */
  case
    when inventory_strategy <> 'stocked'
      then true

    when supplier_id is null
      then false

    when pack_cost is null
      or pack_cost <= 0
      then false

    when units_per_pack is null
      or units_per_pack <= 0
      then false

    when average_selling_price is null
      or average_selling_price <= 0
      then false

    else true
  end as commercial_cost_trusted,

  array_remove(
    array[
      case
        when inventory_strategy = 'stocked'
          and supplier_id is null
          then 'supplier'
      end,

      case
        when inventory_strategy = 'stocked'
          and (
            pack_cost is null
            or pack_cost <= 0
          )
          then 'pack_cost'
      end,

      case
        when inventory_strategy = 'stocked'
          and (
            units_per_pack is null
            or units_per_pack <= 0
          )
          then 'units_per_pack'
      end,

      case
        when inventory_strategy = 'stocked'
          and (
            average_selling_price is null
            or average_selling_price <= 0
          )
          then 'average_selling_price'
      end
    ],
    null
  ) as missing_commercial_requirements,

  last_supplier_price_update,
  commercial_notes,
  cost_created_at,
  cost_updated_at

from unit_economics;


create or replace view
  public.vault_product_commercial_summary
as

select
  count(*)::integer as total_products,

  count(*) filter (
    where inventory_strategy = 'stocked'
  )::integer as stocked_products,

  count(*) filter (
    where inventory_strategy = 'stocked'
      and commercial_cost_trusted = true
  )::integer as commercially_configured_products,

  count(*) filter (
    where inventory_strategy = 'stocked'
      and commercial_cost_trusted = false
  )::integer as products_missing_costs,

  case
    when count(*) filter (
      where inventory_strategy = 'stocked'
    ) = 0
      then 0

    else round(
      (
        count(*) filter (
          where inventory_strategy = 'stocked'
            and commercial_cost_trusted = true
        )::numeric
        /
        count(*) filter (
          where inventory_strategy = 'stocked'
        )::numeric
      ) * 100,
      1
    )
  end as commercial_completion_percentage

from public.vault_product_commercial_intelligence;


notify pgrst, 'reload schema';
-- END HISTORICAL SOURCE: database/017_product_commercial_intelligence.sql

-- BEGIN HISTORICAL SOURCE: database/019_product_cost_currency.sql
-- Historical-authoritative structural schema only. No currency values, backfills,
-- or other business data are included in this bootstrap evolution.
alter table public.vault_product_costs
add column if not exists exchange_rate_to_gbp numeric(12, 6)
default 1
check (
  exchange_rate_to_gbp > 0
);

comment on column
  public.vault_product_costs.exchange_rate_to_gbp
is
  'GBP value of one unit of supplier currency. Example: 1 EUR = 0.86 GBP means enter 0.86.';

-- The view structure is changing, so it must be rebuilt.
drop view if exists
  public.vault_product_commercial_summary;

drop view if exists
  public.vault_product_commercial_intelligence;

create view
  public.vault_product_commercial_intelligence
as

with commercial_base as (
  select
    pm.product_id,
    pm.product_name,
    pm.product_type,
    pm.status as shopify_status,

    pm.supplier_id,
    pm.supplier_company,
    pm.inventory_strategy,
    pm.restock_enabled,
    pm.pack_profile,

    coalesce(pc.currency, 'GBP') as currency,

    coalesce(
      pc.exchange_rate_to_gbp,
      1
    ) as exchange_rate_to_gbp,

    pc.pack_cost,

    coalesce(
      pc.shipping_cost_per_pack,
      0
    ) as shipping_cost_per_pack,

    coalesce(
      pc.import_cost_per_pack,
      0
    ) as import_cost_per_pack,

    coalesce(
      pc.units_per_pack,
      case
        when pm.pack_profile = 'tee_5_piece'
          then 5

        when pm.pack_profile = 'polo_6_piece'
          then 6

        else null
      end
    )::integer as units_per_pack,

    pc.average_selling_price,
    pc.last_supplier_price_update,
    pc.notes as commercial_notes,

    pc.created_at as cost_created_at,
    pc.updated_at as cost_updated_at

  from public.vault_product_master pm

  left join public.vault_product_costs pc
    on pc.product_id = pm.product_id
),

supplier_currency_costs as (
  select
    *,

    case
      when pack_cost is null
        then null

      else round(
        pack_cost
        + shipping_cost_per_pack
        + import_cost_per_pack,
        2
      )
    end as landed_cost_per_pack_supplier_currency

  from commercial_base
),

gbp_costs as (
  select
    *,

    case
      when landed_cost_per_pack_supplier_currency
        is null
        then null

      else round(
        landed_cost_per_pack_supplier_currency
        * exchange_rate_to_gbp,
        2
      )
    end as landed_cost_per_pack_gbp

  from supplier_currency_costs
),

unit_economics as (
  select
    *,

    case
      when landed_cost_per_pack_gbp is null
        or units_per_pack is null
        or units_per_pack <= 0
        then null

      else round(
        landed_cost_per_pack_gbp
        / units_per_pack,
        2
      )
    end as landed_cost_per_unit_gbp

  from gbp_costs
)

select
  product_id,
  product_name,
  product_type,
  shopify_status,

  supplier_id,
  supplier_company,
  inventory_strategy,
  restock_enabled,
  pack_profile,

  currency,
  exchange_rate_to_gbp,

  pack_cost,
  shipping_cost_per_pack,
  import_cost_per_pack,
  units_per_pack,

  landed_cost_per_pack_supplier_currency
    as landed_cost_per_pack,

  landed_cost_per_pack_gbp,

  landed_cost_per_unit_gbp
    as landed_cost_per_unit,

  average_selling_price,

  case
    when average_selling_price is null
      or landed_cost_per_unit_gbp is null
      then null

    else round(
      average_selling_price
      - landed_cost_per_unit_gbp,
      2
    )
  end as estimated_gross_profit_per_unit,

  case
    when average_selling_price is null
      or average_selling_price <= 0
      or landed_cost_per_unit_gbp is null
      then null

    else round(
      (
        average_selling_price
        - landed_cost_per_unit_gbp
      )
      / average_selling_price
      * 100,
      2
    )
  end as estimated_margin_percent,

  case
    when landed_cost_per_unit_gbp is null
      or landed_cost_per_unit_gbp <= 0
      or average_selling_price is null
      then null

    else round(
      (
        average_selling_price
        - landed_cost_per_unit_gbp
      )
      / landed_cost_per_unit_gbp
      * 100,
      2
    )
  end as estimated_return_on_pack_capital_percent,

  case
    when inventory_strategy <> 'stocked'
      then true

    when supplier_id is null
      then false

    when pack_cost is null
      or pack_cost <= 0
      then false

    when units_per_pack is null
      or units_per_pack <= 0
      then false

    when average_selling_price is null
      or average_selling_price <= 0
      then false

    when exchange_rate_to_gbp <= 0
      then false

    else true
  end as commercial_cost_trusted,

  array_remove(
    array[
      case
        when inventory_strategy = 'stocked'
          and supplier_id is null
          then 'supplier'
      end,

      case
        when inventory_strategy = 'stocked'
          and (
            pack_cost is null
            or pack_cost <= 0
          )
          then 'pack_cost'
      end,

      case
        when inventory_strategy = 'stocked'
          and (
            units_per_pack is null
            or units_per_pack <= 0
          )
          then 'units_per_pack'
      end,

      case
        when inventory_strategy = 'stocked'
          and (
            average_selling_price is null
            or average_selling_price <= 0
          )
          then 'average_selling_price'
      end,

      case
        when inventory_strategy = 'stocked'
          and exchange_rate_to_gbp <= 0
          then 'exchange_rate'
      end
    ],
    null
  ) as missing_commercial_requirements,

  last_supplier_price_update,
  commercial_notes,
  cost_created_at,
  cost_updated_at

from unit_economics;

create view
  public.vault_product_commercial_summary
as

select
  count(*)::integer as total_products,

  count(*) filter (
    where inventory_strategy = 'stocked'
  )::integer as stocked_products,

  count(*) filter (
    where inventory_strategy = 'stocked'
      and commercial_cost_trusted = true
  )::integer as commercially_configured_products,

  count(*) filter (
    where inventory_strategy = 'stocked'
      and commercial_cost_trusted = false
  )::integer as products_missing_costs,

  case
    when count(*) filter (
      where inventory_strategy = 'stocked'
    ) = 0
      then 0

    else round(
      (
        count(*) filter (
          where inventory_strategy = 'stocked'
            and commercial_cost_trusted = true
        )::numeric
        /
        count(*) filter (
          where inventory_strategy = 'stocked'
        )::numeric
      ) * 100,
      1
    )
  end as commercial_completion_percentage

from public.vault_product_commercial_intelligence;

notify pgrst, 'reload schema';
-- END HISTORICAL SOURCE: database/019_product_cost_currency.sql
