-- ============================================================
-- VAULT OS
-- Canonical Shopify order ingestion
-- ============================================================

create table if not exists public.vault_shopify_orders (
  id uuid primary key default gen_random_uuid(),

  source text not null default 'shopify'
    check (source = 'shopify'),
  shopify_order_id text not null,
  order_number text not null,
  order_name text not null,

  shopify_created_at timestamptz not null,
  shopify_updated_at timestamptz not null,
  cancelled_at timestamptz,

  currency char(3) not null,
  financial_status text,
  fulfilment_status text,

  subtotal numeric(14, 2) not null,
  discounts numeric(14, 2) not null,
  shipping numeric(14, 2) not null,
  tax numeric(14, 2) not null,
  refunds numeric(14, 2) not null,
  gross_total numeric(14, 2) not null,
  net_revenue numeric(14, 2) not null,

  shopify_customer_id text,
  customer_name text,
  customer_email text,

  metadata jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (source, shopify_order_id)
);

create table if not exists public.vault_shopify_order_lines (
  id uuid primary key default gen_random_uuid(),

  order_id uuid not null
    references public.vault_shopify_orders(id)
    on delete cascade,

  source text not null default 'shopify'
    check (source = 'shopify'),
  shopify_line_item_id text not null,
  shopify_product_id text,
  shopify_variant_id text,

  title text not null,
  variant_title text,
  sku text,

  quantity integer not null check (quantity >= 0),
  unit_price numeric(14, 2) not null,
  discount_allocation numeric(14, 2) not null,
  refunded_quantity integer not null default 0
    check (refunded_quantity >= 0),
  net_line_revenue numeric(14, 2) not null,

  metadata jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (source, shopify_line_item_id)
);

create table if not exists public.vault_shopify_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  shopify_webhook_id text not null unique,
  topic text not null,
  shop_domain text not null,
  status text not null
    check (status in ('processing', 'complete', 'error')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists
  vault_shopify_orders_created_at_idx
on public.vault_shopify_orders(shopify_created_at desc);

create index if not exists
  vault_shopify_orders_updated_at_idx
on public.vault_shopify_orders(shopify_updated_at desc);

create index if not exists
  vault_shopify_orders_financial_status_idx
on public.vault_shopify_orders(financial_status);

create index if not exists
  vault_shopify_orders_fulfilment_status_idx
on public.vault_shopify_orders(fulfilment_status);

create index if not exists
  vault_shopify_orders_cancelled_at_idx
on public.vault_shopify_orders(cancelled_at)
where cancelled_at is not null;

create index if not exists
  vault_shopify_order_lines_order_id_idx
on public.vault_shopify_order_lines(order_id);

create index if not exists
  vault_shopify_order_lines_product_id_idx
on public.vault_shopify_order_lines(shopify_product_id)
where shopify_product_id is not null;

create index if not exists
  vault_shopify_order_lines_variant_id_idx
on public.vault_shopify_order_lines(shopify_variant_id)
where shopify_variant_id is not null;

create index if not exists
  vault_shopify_webhook_deliveries_received_at_idx
on public.vault_shopify_webhook_deliveries(received_at desc);

revoke all on table public.vault_shopify_orders from anon, authenticated;
revoke all on table public.vault_shopify_order_lines from anon, authenticated;
revoke all on table public.vault_shopify_webhook_deliveries from anon, authenticated;

notify pgrst, 'reload schema';
