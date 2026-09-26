-- Immutable, owner-attested historical service evidence. This deliberately does not
-- alter prospective product financial-treatment versions or Stage 1 eligibility.
begin;

create table public.vault_historical_service_treatment_evidence (
  id uuid primary key default gen_random_uuid(),
  canonical_product_id uuid not null references public.vault_products(id) on delete restrict,
  shopify_product_id text not null check (shopify_product_id ~ '^gid://shopify/Product/[1-9][0-9]*$'),
  shopify_variant_id text not null check (shopify_variant_id ~ '^gid://shopify/ProductVariant/[1-9][0-9]*$'),
  product_title text not null check (length(trim(product_title)) > 0),
  service_nature text not null check (service_nature = 'return_shipping_protection'),
  effective_from date not null,
  effective_through date not null check (effective_through >= effective_from),
  treatment text not null check (treatment = 'historical_no_direct_cogs_at_sale'),
  direct_sale_time_cogs_gbp numeric(14,2) not null check (direct_sale_time_cogs_gbp = 0),
  evidence_method text not null check (evidence_method = 'HISTORICAL_OWNER_ATTESTED_NO_DIRECT_COGS_AT_SALE'),
  provenance text not null check (length(trim(provenance)) > 0),
  conditional_cost_treatment text not null check (length(trim(conditional_cost_treatment)) > 0),
  captured_at timestamptz not null default clock_timestamp(),
  unique (canonical_product_id, effective_from, effective_through)
);

create function public.reject_historical_service_treatment_evidence_mutation() returns trigger
language plpgsql set search_path = '' as $$ begin
  raise exception 'Governed historical service-treatment evidence is immutable';
end; $$;

create trigger historical_service_treatment_evidence_immutable
before update or delete on public.vault_historical_service_treatment_evidence
for each row execute function public.reject_historical_service_treatment_evidence_mutation();

alter table public.vault_historical_service_treatment_evidence enable row level security;
revoke all on public.vault_historical_service_treatment_evidence from public, anon, authenticated, service_role;
grant select on public.vault_historical_service_treatment_evidence to service_role;
revoke all on function public.reject_historical_service_treatment_evidence_mutation() from public, anon, authenticated, service_role;

do $$ declare vaultcare_product uuid := '0df03817-3bd0-4a74-a3e4-488fc17fd59e'; begin
  if not exists (
    select 1 from public.vault_products
    where id = vaultcare_product and source = 'shopify'
      and source_product_id = 'gid://shopify/Product/16145627939194'
      and title = 'VaultCare - Return Protection'
  ) then raise exception 'Historical VaultCare foundation requires the exact canonical Shopify product'; end if;
  if not exists (
    select 1 from public.vault_variants
    where product_id = vaultcare_product and source = 'shopify'
      and source_variant_id = 'gid://shopify/ProductVariant/57053091955066'
  ) then raise exception 'Historical VaultCare foundation requires the exact canonical Shopify variant'; end if;
  insert into public.vault_historical_service_treatment_evidence(
    canonical_product_id,shopify_product_id,shopify_variant_id,product_title,service_nature,
    effective_from,effective_through,treatment,direct_sale_time_cogs_gbp,evidence_method,provenance,conditional_cost_treatment
  ) values (
    vaultcare_product,'gid://shopify/Product/16145627939194','gid://shopify/ProductVariant/57053091955066',
    'VaultCare - Return Protection','return_shipping_protection','2026-07-11','2026-09-05',
    'historical_no_direct_cogs_at_sale',0,'HISTORICAL_OWNER_ATTESTED_NO_DIRECT_COGS_AT_SALE',
    'Owner attestation: 2026-07-11 through 2026-09-05 VaultCare was optional return/shipping protection with no supplier, insurer, fulfilment-provider, or other per-sale checkout cost; direct sale-time COGS is explicitly GBP 0.00.',
    'Any cost arises only after a qualifying return when a return postage label is actually provided; such conditional later costs are separate evidence and are never absorbed into this GBP 0.00 direct sale-time treatment.'
  );
end $$;

create view public.vault_historical_vaultcare_service_treatment_line_attributions
with (security_barrier = true, security_invoker = true) as
select evidence.id as historical_service_treatment_evidence_id,
  orders.id as order_id, orders.shopify_order_id, orders.shopify_created_at as sale_timestamp,
  line.id as order_line_id, evidence.canonical_product_id, evidence.shopify_product_id, evidence.shopify_variant_id,
  evidence.product_title, evidence.service_nature, evidence.treatment, evidence.evidence_method,
  evidence.direct_sale_time_cogs_gbp, line.cogs_quantity as quantity,
  line.cogs_quantity * evidence.direct_sale_time_cogs_gbp as total_direct_sale_time_cogs_gbp,
  line.net_line_revenue as canonical_net_line_revenue_gbp, evidence.provenance, evidence.conditional_cost_treatment,
  'HISTORICAL SERVICE EVIDENCE — NOT VERIFIED STAGE 1 COGS'::text as classification
from public.vault_historical_service_treatment_evidence evidence
join public.vault_products product on product.id = evidence.canonical_product_id
  and product.source = 'shopify' and product.source_product_id = evidence.shopify_product_id
  and product.title = evidence.product_title
join public.vault_variants variant on variant.product_id = product.id and variant.source = 'shopify'
  and variant.source_variant_id = evidence.shopify_variant_id
join public.vault_shopify_order_lines line on line.shopify_variant_id = variant.source_variant_id
  and (line.shopify_product_id is null or line.shopify_product_id = evidence.shopify_product_id)
  and line.cogs_quantity > 0
join public.vault_shopify_orders orders on orders.id = line.order_id and orders.source = 'shopify'
  and orders.cancelled_at is null and orders.metadata->>'test' = 'false'
where (orders.shopify_created_at at time zone 'Europe/London')::date
  between evidence.effective_from and evidence.effective_through;

revoke all on public.vault_historical_vaultcare_service_treatment_line_attributions from public, anon, authenticated;
grant select on public.vault_historical_vaultcare_service_treatment_line_attributions to service_role;
comment on view public.vault_historical_vaultcare_service_treatment_line_attributions is
  'Historical owner-attested GBP 0.00 direct sale-time VaultCare service evidence only. It does not populate direct product-cost history, alter prospective treatments, admit Stage 1, or represent conditional later return-label costs.';
notify pgrst, 'reload schema';
commit;
