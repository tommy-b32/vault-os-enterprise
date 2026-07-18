create table if not exists public.vault_shopify_products (
    id uuid primary key default gen_random_uuid(),

    shopify_product_id text unique not null,

    title text,
    handle text,
    vendor text,
    product_type text,
    status text,

    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table if not exists public.vault_shopify_variants (
    id uuid primary key default gen_random_uuid(),

    shopify_variant_id text unique not null,
    shopify_product_id text not null,

    title text,
    sku text,
    barcode text,

    inventory_item_id text,

    price numeric,

    inventory_quantity integer,

    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table if not exists public.vault_inventory_locations (
    id uuid primary key default gen_random_uuid(),

    shopify_location_id text unique not null,

    name text,

    created_at timestamptz default now()
);