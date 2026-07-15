-- ============================================================
-- VAULT OS
-- Migration 004: Supply Intelligence
-- Pack-based purchasing and variant-level stock forecasting
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- SUPPLIERS
-- ------------------------------------------------------------

create table if not exists public.vault_suppliers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  supplier_name text not null,
  supplier_reference text,
  currency_code text not null default 'EUR',

  default_lead_time_days integer not null default 10,
  default_order_interval_days integer,
  minimum_order_value numeric(12, 2),

  is_active boolean not null default true,
  notes text,

  constraint vault_suppliers_lead_time_valid
    check (default_lead_time_days >= 0),

  constraint vault_suppliers_order_interval_valid
    check (
      default_order_interval_days is null
      or default_order_interval_days >= 0
    )
);

-- ------------------------------------------------------------
-- SUPPLIER PRODUCTS
--
-- A supplier product represents one purchasable pack:
-- Brand + Model + Colour + Supplier
-- ------------------------------------------------------------

create table if not exists public.vault_supplier_products (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  supplier_id uuid not null
    references public.vault_suppliers(id)
    on delete restrict,

  brand text not null,
  model text not null,
  colour text not null,

  supplier_product_reference text,

  pack_name text not null default 'Standard Pack',
  pack_size integer not null default 5,

  pack_cost numeric(12, 2) not null default 0,
  estimated_shipping_per_pack numeric(12, 2) not null default 0,

  lead_time_days integer,
  minimum_pack_order integer not null default 1,

  target_safety_stock_days integer not null default 7,

  is_active boolean not null default true,
  notes text,

  constraint vault_supplier_products_pack_size_valid
    check (pack_size > 0),

  constraint vault_supplier_products_pack_cost_valid
    check (pack_cost >= 0),

  constraint vault_supplier_products_shipping_valid
    check (estimated_shipping_per_pack >= 0),

  constraint vault_supplier_products_lead_time_valid
    check (
      lead_time_days is null
      or lead_time_days >= 0
    ),

  constraint vault_supplier_products_minimum_order_valid
    check (minimum_pack_order > 0),

  constraint vault_supplier_products_safety_stock_valid
    check (target_safety_stock_days >= 0),

  unique (
    supplier_id,
    brand,
    model,
    colour
  )
);

-- ------------------------------------------------------------
-- PACK CONTENTS
--
-- Defines exactly what sizes are contained in one supplier pack.
--
-- Example:
-- S   ×1
-- M   ×1
-- L   ×1
-- XL  ×1
-- XXL ×1
-- ------------------------------------------------------------

create table if not exists public.vault_pack_contents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  supplier_product_id uuid not null
    references public.vault_supplier_products(id)
    on delete cascade,

  size_label text not null,
  units_per_pack integer not null default 1,

  shopify_product_id text,
  shopify_variant_id text,
  shopify_sku text,

  constraint vault_pack_contents_units_valid
    check (units_per_pack > 0),

  unique (
    supplier_product_id,
    size_label
  )
);

-- ------------------------------------------------------------
-- INVENTORY SNAPSHOTS
--
-- Stores Shopify stock quantities for each individual variant.
-- ------------------------------------------------------------

create table if not exists public.vault_inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  recorded_at timestamptz not null default now(),

  supplier_product_id uuid not null
    references public.vault_supplier_products(id)
    on delete cascade,

  pack_content_id uuid not null
    references public.vault_pack_contents(id)
    on delete cascade,

  shopify_location_id text,

  available_quantity integer not null default 0,
  on_hand_quantity integer not null default 0,
  committed_quantity integer not null default 0,
  incoming_quantity integer not null default 0,

  constraint vault_inventory_available_valid
    check (available_quantity >= 0),

  constraint vault_inventory_on_hand_valid
    check (on_hand_quantity >= 0),

  constraint vault_inventory_committed_valid
    check (committed_quantity >= 0),

  constraint vault_inventory_incoming_valid
    check (incoming_quantity >= 0)
);

create index if not exists
  vault_inventory_snapshots_recorded_at_idx
  on public.vault_inventory_snapshots (
    recorded_at desc
  );

create index if not exists
  vault_inventory_snapshots_supplier_product_idx
  on public.vault_inventory_snapshots (
    supplier_product_id
  );

-- ------------------------------------------------------------
-- SALES VELOCITY
--
-- Calculated per individual size variant.
-- ------------------------------------------------------------

create table if not exists public.vault_sales_velocity (
  id uuid primary key default gen_random_uuid(),
  calculated_at timestamptz not null default now(),

  supplier_product_id uuid not null
    references public.vault_supplier_products(id)
    on delete cascade,

  pack_content_id uuid not null
    references public.vault_pack_contents(id)
    on delete cascade,

  units_sold_7_days integer not null default 0,
  units_sold_14_days integer not null default 0,
  units_sold_30_days integer not null default 0,

  average_units_per_day numeric(12, 4)
    not null default 0,

  product_views_7_days integer not null default 0,
  add_to_cart_7_days integer not null default 0,
  bundle_units_7_days integer not null default 0,

  sales_acceleration numeric(12, 4)
    not null default 0,

  constraint vault_velocity_sales_7_valid
    check (units_sold_7_days >= 0),

  constraint vault_velocity_sales_14_valid
    check (units_sold_14_days >= 0),

  constraint vault_velocity_sales_30_valid
    check (units_sold_30_days >= 0),

  constraint vault_velocity_average_valid
    check (average_units_per_day >= 0)
);

-- ------------------------------------------------------------
-- SUPPLIER ORDERS
-- ------------------------------------------------------------

create table if not exists public.vault_supplier_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  supplier_id uuid not null
    references public.vault_suppliers(id)
    on delete restrict,

  order_reference text,
  ordered_at timestamptz not null default now(),
  expected_arrival_at timestamptz,
  received_at timestamptz,

  order_status text not null default 'ordered',

  total_pack_cost numeric(12, 2) not null default 0,
  shipping_cost numeric(12, 2) not null default 0,

  notes text,

  constraint vault_supplier_order_status_valid
    check (
      order_status in (
        'draft',
        'ordered',
        'in_transit',
        'part_received',
        'received',
        'cancelled'
      )
    )
);

create table if not exists public.vault_supplier_order_lines (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  supplier_order_id uuid not null
    references public.vault_supplier_orders(id)
    on delete cascade,

  supplier_product_id uuid not null
    references public.vault_supplier_products(id)
    on delete restrict,

  packs_ordered integer not null,
  pack_cost numeric(12, 2) not null default 0,

  constraint vault_order_lines_packs_valid
    check (packs_ordered > 0),

  constraint vault_order_lines_cost_valid
    check (pack_cost >= 0)
);

-- ------------------------------------------------------------
-- REORDER RECOMMENDATIONS
--
-- Recommendations are always expressed as whole supplier packs.
-- ------------------------------------------------------------

create table if not exists public.vault_reorder_recommendations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  supplier_product_id uuid not null
    references public.vault_supplier_products(id)
    on delete cascade,

  recommendation_status text not null default 'active',
  urgency text not null default 'monitor',

  limiting_size text,

  available_units_total integer not null default 0,
  incoming_units_total integer not null default 0,

  estimated_days_cover numeric(12, 2),
  estimated_stockout_at timestamptz,

  effective_lead_time_days integer not null default 0,
  safety_stock_days integer not null default 0,

  recommended_packs integer not null default 0,
  recommended_total_units integer not null default 0,

  estimated_order_cost numeric(12, 2)
    not null default 0,

  confidence_score integer,

  recommendation_reason text,
  operator_summary text,

  constraint vault_recommendation_status_valid
    check (
      recommendation_status in (
        'active',
        'accepted',
        'ordered',
        'dismissed',
        'expired'
      )
    ),

  constraint vault_recommendation_urgency_valid
    check (
      urgency in (
        'healthy',
        'monitor',
        'reorder',
        'urgent',
        'overstock'
      )
    ),

  constraint vault_recommended_packs_valid
    check (recommended_packs >= 0),

  constraint vault_recommended_units_valid
    check (recommended_total_units >= 0),

  constraint vault_recommendation_confidence_valid
    check (
      confidence_score is null
      or confidence_score between 0 and 100
    )
);

create index if not exists
  vault_reorder_recommendations_status_idx
  on public.vault_reorder_recommendations (
    recommendation_status,
    urgency
  );

-- ------------------------------------------------------------
-- SECURITY
--
-- Supply Intelligence data is private operational data.
-- No anonymous storefront access is granted.
-- Future Vault Command access will use authenticated policies
-- or protected server-side APIs.
-- ------------------------------------------------------------

alter table public.vault_suppliers
  enable row level security;

alter table public.vault_supplier_products
  enable row level security;

alter table public.vault_pack_contents
  enable row level security;

alter table public.vault_inventory_snapshots
  enable row level security;

alter table public.vault_sales_velocity
  enable row level security;

alter table public.vault_supplier_orders
  enable row level security;

alter table public.vault_supplier_order_lines
  enable row level security;

alter table public.vault_reorder_recommendations
  enable row level security;

revoke all
  on table public.vault_suppliers
  from anon;

revoke all
  on table public.vault_supplier_products
  from anon;

revoke all
  on table public.vault_pack_contents
  from anon;

revoke all
  on table public.vault_inventory_snapshots
  from anon;

revoke all
  on table public.vault_sales_velocity
  from anon;

revoke all
  on table public.vault_supplier_orders
  from anon;

revoke all
  on table public.vault_supplier_order_lines
  from anon;

revoke all
  on table public.vault_reorder_recommendations
  from anon;