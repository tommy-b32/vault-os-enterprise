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