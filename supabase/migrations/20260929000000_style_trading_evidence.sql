-- Source-faithful trading maturity evidence.  This migration is additive and
-- deliberately does not infer launch timing from Vault ingestion timestamps.
begin;

alter table public.vault_products
  add column if not exists shopify_created_at timestamptz,
  add column if not exists shopify_online_store_published_at timestamptz,
  add column if not exists shopify_publication_observed_at timestamptz;

alter table public.vault_variants
  add column if not exists shopify_created_at timestamptz;

create index if not exists vault_products_shopify_published_idx
  on public.vault_products (shopify_online_store_published_at)
  where source = 'shopify';
create index if not exists vault_variants_product_shopify_created_idx
  on public.vault_variants (product_id, shopify_created_at)
  where source = 'shopify';

-- Append-only source observations; unique source state makes repeated syncs idempotent.
create table if not exists public.vault_shopify_product_publication_observations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.vault_products(id) on delete restrict,
  source text not null check (source = 'shopify'),
  published_at timestamptz,
  published_at_key timestamptz generated always as (coalesce(published_at, 'infinity'::timestamptz)) stored,
  publication_state text not null check (publication_state in ('published', 'unpublished')),
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (product_id, source, published_at_key, publication_state)
);

create index if not exists vault_shopify_product_publication_observations_product_observed_idx
  on public.vault_shopify_product_publication_observations (product_id, observed_at desc);

alter table public.vault_shopify_product_publication_observations enable row level security;
revoke all on public.vault_shopify_product_publication_observations from anon, authenticated;

-- A style is the commercial identity used by replenishment: parent product + model design.
-- Coverage is proven exclusively by successful persisted historical sync windows.
create or replace view public.vault_style_trading_evidence as
with policy as (
  select interval '7 days' as learning_max_live,
    interval '28 days' as sufficient_live,
    interval '28 days' as sufficient_coverage,
    interval '30 minutes' as canonical_order_evidence_max_age
), latest as (
  select max(completed_at) as evidence_as_of
  from public.vault_shopify_order_sync_runs
  where sync_days >= 7
), coverage as (
  select range_agg(tstzrange(created_from, created_before, '[)')) as covered
  from public.vault_shopify_order_sync_runs
  where sync_mode = 'historical_orders_by_created_at'
    and created_from is not null and created_before is not null
), styles as (
  select v.product_id as parent_product_id, v.model_design as style_name,
    min(v.shopify_created_at) as style_first_variant_created_at,
    bool_and(v.identity_resolution_status = 'resolved') as mapping_trusted
  from public.vault_variants v
  where v.source = 'shopify' and v.source_active = true and v.model_design is not null
  group by v.product_id, v.model_design
), anchors as (
  select s.parent_product_id::text || '::' || s.style_name as style_id,
    s.parent_product_id, s.style_name, s.mapping_trusted,
    p.shopify_created_at as source_product_created_at,
    p.shopify_online_store_published_at as source_product_published_at,
    s.style_first_variant_created_at,
    case when p.shopify_online_store_published_at is not null and s.style_first_variant_created_at is not null
      then greatest(p.shopify_online_store_published_at, s.style_first_variant_created_at) end as verified_live_at
  from styles s join public.vault_products p on p.id = s.parent_product_id and p.source = 'shopify'
), style_sales as (
  select a.parent_product_id as product_id, a.style_name as model_design,
    min(o.shopify_created_at) filter (where greatest(l.quantity - l.refunded_quantity, 0) > 0) as first_positive_sale_at,
    count(distinct (o.shopify_created_at at time zone 'Europe/London')::date) filter (where greatest(l.quantity - l.refunded_quantity, 0) > 0) as selling_days,
    coalesce(sum(greatest(l.quantity - l.refunded_quantity, 0)), 0)::numeric as units_since_live
  from public.vault_variants v
  join anchors a on a.parent_product_id = v.product_id and a.style_name = v.model_design
  join public.vault_shopify_order_lines l on l.shopify_variant_id = v.source_variant_id
  join public.vault_shopify_orders o on o.id = l.order_id
  where v.source = 'shopify' and v.source_active = true and v.model_design is not null
    and o.cancelled_at is null and coalesce((o.metadata ->> 'test')::boolean, false) = false
    and a.verified_live_at is not null and o.shopify_created_at >= a.verified_live_at
  group by a.parent_product_id, a.style_name
), evidence as (
  select a.*, latest.evidence_as_of, policy.learning_max_live, policy.sufficient_live,
    policy.sufficient_coverage, policy.canonical_order_evidence_max_age,
    (latest.evidence_as_of is not null and latest.evidence_as_of >= now() - policy.canonical_order_evidence_max_age) as order_evidence_fresh,
    sales.first_positive_sale_at, sales.selling_days, sales.units_since_live,
    case when a.verified_live_at is null or latest.evidence_as_of is null then null
      else greatest(a.verified_live_at, latest.evidence_as_of - policy.sufficient_coverage) end as required_coverage_start
  from anchors a cross join latest cross join policy left join style_sales sales
    on sales.product_id = a.parent_product_id and sales.model_design = a.style_name
)
select e.style_id, e.parent_product_id, e.style_name, e.source_product_created_at,
  e.source_product_published_at, e.style_first_variant_created_at, e.verified_live_at,
  e.first_positive_sale_at, e.selling_days, e.units_since_live, e.evidence_as_of,
  e.required_coverage_start as verified_coverage_start,
  case when e.verified_live_at is null or e.evidence_as_of is null then null
    else greatest(0, floor(extract(epoch from (e.evidence_as_of - e.verified_live_at)) / 86400))::integer end as verified_live_days,
  case when e.required_coverage_start is null or e.evidence_as_of is null then null
    else greatest(0, floor(extract(epoch from (e.evidence_as_of - e.required_coverage_start)) / 86400))::integer end as verified_coverage_days,
  coalesce((e.mapping_trusted and e.required_coverage_start is not null and coverage.covered @> tstzrange(e.required_coverage_start, e.evidence_as_of, '[)')), false) as coverage_complete,
  coalesce(e.order_evidence_fresh, false) as order_evidence_fresh,
  case
    when not e.mapping_trusted or e.verified_live_at is null or e.evidence_as_of is null
      or not coalesce(e.order_evidence_fresh, false)
      or not coalesce((coverage.covered @> tstzrange(e.required_coverage_start, e.evidence_as_of, '[)')), false) then 'UNKNOWN'
    when e.evidence_as_of - e.verified_live_at < e.learning_max_live then 'LEARNING'
    when e.evidence_as_of - e.verified_live_at < e.sufficient_live then 'DEVELOPING_EVIDENCE'
    else 'SUFFICIENT_EVIDENCE'
  end as maturity_state
from evidence e cross join coverage;

revoke all on public.vault_style_trading_evidence from anon, authenticated;
grant select on public.vault_style_trading_evidence to authenticated;
notify pgrst, 'reload schema';
commit;
