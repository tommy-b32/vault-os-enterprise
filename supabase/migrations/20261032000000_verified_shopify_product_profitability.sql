-- Product profitability is a read-only allocation of already verified Stage 1
-- contribution. It never admits an excluded order or recreates financial evidence.
-- Order-level shipping and payment fees are allocated by net line revenue, without
-- rounding; presentation is responsible for any final monetary rounding.

create view public.vault_shopify_verified_product_profitability_line_allocations
with (security_barrier = true, security_invoker = true) as
with eligible_lines as (
  select contribution.order_id, contribution.shopify_created_at,
    contribution.canonical_net_revenue,
    contribution.observed_purchased_label_cost_gbp,
    contribution.covered_payment_fees_gbp,
    contribution.estimated_operational_contribution_gbp,
    product.id as product_id, product.title as product_name,
    line.id as order_line_id, line.cogs_quantity as eligible_units,
    line.net_line_revenue as eligible_net_line_revenue,
    case
      when line.financial_treatment_status = 'trusted_no_direct_cogs_at_sale'
        and line.financial_treatment_history_id is not null
        and line.financial_treatment = 'no_direct_cogs_at_sale'
        and line.financial_treatment_snapshotted_at is not null
        and line.sale_time_direct_cogs_gbp = 0
        then line.sale_time_direct_cogs_gbp
      when line.cogs_status = 'trusted'
        and line.cogs_history_id is not null
        and line.cogs_snapshotted_at is not null
        and line.total_cogs_gbp is not null
        and line.total_cogs_gbp >= 0
        then line.total_cogs_gbp
    end as trusted_direct_sale_time_cogs_gbp
  from public.vault_shopify_verified_order_operational_contributions contribution
  join public.vault_shopify_order_lines line
    on line.order_id = contribution.order_id
   and line.cogs_quantity > 0
  join public.vault_variants variant
    on variant.source = 'shopify'
   and variant.source_variant_id = line.shopify_variant_id
  join public.vault_products product
    on product.id = variant.product_id
   and product.source = 'shopify'
   and (line.shopify_product_id is null or product.source_product_id = line.shopify_product_id)
), order_denominators as (
  select order_id,
    sum(eligible_net_line_revenue) as total_eligible_order_line_revenue,
    min(eligible_net_line_revenue) as minimum_eligible_line_revenue,
    max(canonical_net_revenue) as canonical_net_revenue
  from eligible_lines
  group by order_id
), allocation_ready_lines as (
  select line.*, denominator.total_eligible_order_line_revenue,
    line.eligible_net_line_revenue / denominator.total_eligible_order_line_revenue as allocation_share
  from eligible_lines line
  join order_denominators denominator using (order_id)
  where denominator.total_eligible_order_line_revenue > 0
    and denominator.minimum_eligible_line_revenue >= 0
    -- Without this equality, line contribution could not reconcile to the existing
    -- authoritative Stage 1 order contribution; do not invent a residual allocation.
    and denominator.total_eligible_order_line_revenue = denominator.canonical_net_revenue
    and line.trusted_direct_sale_time_cogs_gbp is not null
)
select order_id, shopify_created_at, product_id, product_name, order_line_id,
  eligible_units, eligible_net_line_revenue,
  trusted_direct_sale_time_cogs_gbp,
  observed_purchased_label_cost_gbp * allocation_share as allocated_shipping_cost_gbp,
  covered_payment_fees_gbp * allocation_share as allocated_payment_fees_gbp,
  eligible_net_line_revenue - trusted_direct_sale_time_cogs_gbp
    - (observed_purchased_label_cost_gbp * allocation_share)
    - (covered_payment_fees_gbp * allocation_share) as operational_contribution_gbp,
  allocation_share
from allocation_ready_lines;

comment on view public.vault_shopify_verified_product_profitability_line_allocations is
  'Read-only, full-precision line allocation of already eligible Stage 1 contribution. Orders with an invalid/non-reconciling line-revenue allocation basis are withheld rather than estimated.';

create view public.vault_shopify_verified_product_profitability
with (security_barrier = true, security_invoker = true) as
select product_id, max(product_name) as product_name,
  count(distinct order_id) as eligible_orders,
  sum(eligible_units) as eligible_units,
  sum(eligible_net_line_revenue) as eligible_net_revenue,
  sum(trusted_direct_sale_time_cogs_gbp) as trusted_direct_sale_time_cogs_gbp,
  sum(allocated_shipping_cost_gbp) as allocated_shipping_cost_gbp,
  sum(allocated_payment_fees_gbp) as allocated_payment_fees_gbp,
  sum(operational_contribution_gbp) as operational_contribution_gbp,
  sum(operational_contribution_gbp) / nullif(sum(eligible_units), 0) as contribution_per_eligible_unit_gbp,
  (sum(operational_contribution_gbp) / nullif(sum(eligible_net_line_revenue), 0)) * 100 as contribution_margin_pct
from public.vault_shopify_verified_product_profitability_line_allocations
group by product_id;

comment on view public.vault_shopify_verified_product_profitability is
  'Product-level aggregation of allocation-qualified, verified Stage 1 sales only. Excluded sales are reported separately in the coverage view and are never assigned zero contribution.';

create view public.vault_shopify_product_profitability_coverage
with (security_barrier = true, security_invoker = true) as
with canonical_sold_lines as (
  select diagnostic.order_id, diagnostic.exclusion_reason_codes,
    product.id as product_id, product.title as product_name,
    line.cogs_quantity as canonical_sold_units,
    line.net_line_revenue as canonical_sold_net_revenue
  from public.vault_shopify_order_operational_contribution_diagnostics diagnostic
  join public.vault_shopify_order_lines line
    on line.order_id = diagnostic.order_id
   and line.cogs_quantity > 0
  join public.vault_variants variant
    on variant.source = 'shopify'
   and variant.source_variant_id = line.shopify_variant_id
  join public.vault_products product
    on product.id = variant.product_id
   and product.source = 'shopify'
   and (line.shopify_product_id is null or product.source_product_id = line.shopify_product_id)
), allocation_ready_orders as (
  select distinct order_id
  from public.vault_shopify_verified_product_profitability_line_allocations
)
select line.product_id, max(line.product_name) as product_name,
  count(distinct line.order_id) as total_canonical_sold_orders,
  sum(line.canonical_sold_units) as total_canonical_sold_units,
  count(distinct line.order_id) filter (where cardinality(line.exclusion_reason_codes) = 0) as eligible_orders,
  sum(line.canonical_sold_units) filter (where cardinality(line.exclusion_reason_codes) = 0) as eligible_units,
  count(distinct line.order_id) filter (where cardinality(line.exclusion_reason_codes) > 0) as excluded_orders,
  sum(line.canonical_sold_units) filter (where cardinality(line.exclusion_reason_codes) > 0) as excluded_units,
  sum(line.canonical_sold_net_revenue) filter (where cardinality(line.exclusion_reason_codes) = 0) as eligible_revenue,
  sum(line.canonical_sold_net_revenue) filter (where cardinality(line.exclusion_reason_codes) > 0) as excluded_revenue,
  (count(distinct line.order_id) filter (where cardinality(line.exclusion_reason_codes) = 0)::numeric
    / nullif(count(distinct line.order_id), 0)) * 100 as evidence_coverage_order_pct,
  (sum(line.canonical_sold_units) filter (where cardinality(line.exclusion_reason_codes) = 0)
    / nullif(sum(line.canonical_sold_units), 0)) * 100 as evidence_coverage_unit_pct,
  (sum(line.canonical_sold_net_revenue) filter (where cardinality(line.exclusion_reason_codes) = 0)
    / nullif(sum(line.canonical_sold_net_revenue), 0)) * 100 as evidence_coverage_revenue_pct,
  count(distinct line.order_id) filter (
    where cardinality(line.exclusion_reason_codes) = 0
      and allocation_ready_orders.order_id is null
  ) as allocation_unavailable_eligible_orders
from canonical_sold_lines line
left join allocation_ready_orders using (order_id)
group by line.product_id;

comment on view public.vault_shopify_product_profitability_coverage is
  'Canonical product-sales evidence coverage. Stage 1 eligibility remains distinct from allocation readiness; neither excluded nor allocation-unavailable sales receive a contribution amount.';

revoke all on public.vault_shopify_verified_product_profitability_line_allocations,
  public.vault_shopify_verified_product_profitability,
  public.vault_shopify_product_profitability_coverage
from public, anon, authenticated;
grant select on public.vault_shopify_verified_product_profitability_line_allocations,
  public.vault_shopify_verified_product_profitability,
  public.vault_shopify_product_profitability_coverage
to service_role;
notify pgrst, 'reload schema';
