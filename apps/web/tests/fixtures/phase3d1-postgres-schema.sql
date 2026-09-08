-- Disposable integration-test schema for Phase 3D-1 only. This is not a Supabase migration.
create schema if not exists public;

create table public.vault_shopify_order_sync_runs (
  id uuid primary key,
  sync_days integer not null,
  completed_at timestamptz not null
);

create table public.vault_shopify_orders (
  id uuid primary key,
  shopify_created_at timestamptz not null,
  cancelled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table public.vault_shopify_order_lines (
  id uuid primary key,
  order_id uuid not null references public.vault_shopify_orders(id),
  shopify_variant_id text,
  quantity integer not null,
  refunded_quantity integer not null default 0
);

create table public.vault_products (
  id uuid primary key,
  source text not null,
  status text
);

create table public.vault_variants (
  id uuid primary key,
  product_id uuid not null references public.vault_products(id),
  source text not null,
  source_variant_id text,
  model_design text,
  normalized_size text,
  source_active boolean not null,
  identity_resolution_status text not null
);

create table public.vault_inventory_levels (
  id uuid primary key,
  variant_id uuid not null references public.vault_variants(id),
  available_quantity integer not null,
  committed_quantity integer not null,
  incoming_quantity integer not null,
  synced_at timestamptz not null
);
