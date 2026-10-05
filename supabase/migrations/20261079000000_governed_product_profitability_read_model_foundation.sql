-- Governed Product Performance read-model foundation only. No source data is
-- populated here: a future reconciled refresh path is responsible for that.
-- The sole financial authority remains
-- public.vault_shopify_verified_product_profitability_line_allocations.
-- This table is a derived governed read model, never a competing source of
-- financial truth. All-time Product Performance begins at
-- 2026-05-04T00:00:00+01:00; a stale/failed state must fail closed.

create table public.vault_shopify_verified_product_profitability_read_model (
  order_line_id uuid primary key,
  order_id uuid not null,
  product_id uuid not null,
  product_name text not null,
  shopify_created_at timestamptz not null,
  eligible_units integer not null,
  allocated_total_revenue_gbp numeric not null,
  resolved_cogs_gbp numeric not null,
  allocated_shipping_cost_gbp numeric not null,
  allocated_payment_fees_gbp numeric not null,
  operational_contribution_gbp numeric not null,
  evidence_method text not null,
  cogs_classification text not null,
  provenance_id text not null,
  source_evidence_watermark jsonb not null,
  refresh_generation bigint not null check (refresh_generation > 0),
  refreshed_at timestamptz not null
);

comment on table public.vault_shopify_verified_product_profitability_read_model is
  'Derived, governed Product Performance read model. Its authoritative source remains public.vault_shopify_verified_product_profitability_line_allocations; it is not a competing financial truth. All-time reporting starts at 2026-05-04T00:00:00+01:00. Do not use unless the singleton state is valid and freshness is trusted; stale state must fail closed.';

comment on column public.vault_shopify_verified_product_profitability_read_model.source_evidence_watermark is
  'Refresh-time source-evidence watermark/fingerprint payload used to prove governed provenance and freshness.';

comment on column public.vault_shopify_verified_product_profitability_read_model.refresh_generation is
  'All rows promoted in one refresh generation must share the same refresh_generation, source_evidence_watermark, and refreshed_at values.';

create index vault_shopify_verified_product_profitability_read_model_created_at_idx
  on public.vault_shopify_verified_product_profitability_read_model (shopify_created_at);

create index vault_shopify_verified_product_profitability_read_model_product_created_at_idx
  on public.vault_shopify_verified_product_profitability_read_model (product_id, shopify_created_at);

create index vault_shopify_verified_product_profitability_read_model_order_id_idx
  on public.vault_shopify_verified_product_profitability_read_model (order_id);

create table public.vault_shopify_verified_product_profitability_read_model_state (
  singleton boolean primary key default true check (singleton),
  state text not null check (state in ('valid', 'refreshing', 'stale', 'failed')),
  source_evidence_watermark jsonb,
  refresh_generation bigint not null default 0 check (refresh_generation >= 0),
  refresh_started_at timestamptz,
  refresh_completed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

comment on table public.vault_shopify_verified_product_profitability_read_model_state is
  'Singleton freshness state for the governed Product Performance read model. Stale, refreshing, or failed state is not eligible for Product Performance display and must fail closed.';

-- Establish the sole state row as stale until a future reconciled refresh path
-- populates the read model and atomically records a valid watermark.
insert into public.vault_shopify_verified_product_profitability_read_model_state (
  singleton,
  state
)
values (
  true,
  'stale'
);

alter table public.vault_shopify_verified_product_profitability_read_model
  enable row level security;

alter table public.vault_shopify_verified_product_profitability_read_model_state
  enable row level security;

revoke all
  on public.vault_shopify_verified_product_profitability_read_model
  from public, anon, authenticated, service_role;

revoke all
  on public.vault_shopify_verified_product_profitability_read_model_state
  from public, anon, authenticated, service_role;

grant select, insert, update, delete
  on public.vault_shopify_verified_product_profitability_read_model
  to service_role;

grant select, insert, update, delete
  on public.vault_shopify_verified_product_profitability_read_model_state
  to service_role;

notify pgrst, 'reload schema';