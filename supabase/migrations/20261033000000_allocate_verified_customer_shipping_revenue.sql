-- Forward-only correction: canonical Shopify customer shipping is separately
-- allocated only where it exactly explains the Stage 1/merchandise revenue delta.
drop view public.vault_shopify_product_profitability_coverage;
drop view public.vault_shopify_verified_product_profitability;
drop view public.vault_shopify_verified_product_profitability_line_allocations;

create view public.vault_shopify_verified_product_profitability_line_allocations
with (security_barrier = true, security_invoker = true) as
with eligible_lines as (
  select c.order_id,c.shopify_created_at,c.canonical_net_revenue,c.observed_purchased_label_cost_gbp,c.covered_payment_fees_gbp,
    o.shipping as authoritative_customer_shipping_revenue_gbp,p.id product_id,p.title product_name,l.id order_line_id,l.cogs_quantity eligible_units,l.net_line_revenue eligible_merchandise_revenue,
    case when l.financial_treatment_status='trusted_no_direct_cogs_at_sale' and l.financial_treatment_history_id is not null and l.financial_treatment='no_direct_cogs_at_sale' and l.financial_treatment_snapshotted_at is not null and l.sale_time_direct_cogs_gbp=0 then l.sale_time_direct_cogs_gbp
      when l.cogs_status='trusted' and l.cogs_history_id is not null and l.cogs_snapshotted_at is not null and l.total_cogs_gbp is not null and l.total_cogs_gbp>=0 then l.total_cogs_gbp end trusted_direct_sale_time_cogs_gbp
  from public.vault_shopify_verified_order_operational_contributions c join public.vault_shopify_orders o on o.id=c.order_id
  join public.vault_shopify_order_lines l on l.order_id=c.order_id and l.cogs_quantity>0
  join public.vault_variants v on v.source='shopify' and v.source_variant_id=l.shopify_variant_id
  join public.vault_products p on p.id=v.product_id and p.source='shopify' and (l.shopify_product_id is null or p.source_product_id=l.shopify_product_id)
), denominators as (
  select order_id,sum(eligible_merchandise_revenue) merchandise_revenue_basis,max(canonical_net_revenue) canonical_net_revenue,max(authoritative_customer_shipping_revenue_gbp) customer_shipping_revenue
  from eligible_lines group by order_id
), ready as (
  select l.*,d.customer_shipping_revenue,d.merchandise_revenue_basis,l.eligible_merchandise_revenue/d.merchandise_revenue_basis allocation_share
  from eligible_lines l join denominators d using(order_id)
  where d.merchandise_revenue_basis>0 and d.customer_shipping_revenue>=0
    and d.canonical_net_revenue=d.merchandise_revenue_basis+d.customer_shipping_revenue
    and l.eligible_merchandise_revenue>=0 and l.trusted_direct_sale_time_cogs_gbp is not null
)
select order_id,shopify_created_at,product_id,product_name,order_line_id,eligible_units,
  eligible_merchandise_revenue,customer_shipping_revenue*allocation_share allocated_customer_shipping_revenue_gbp,
  eligible_merchandise_revenue+customer_shipping_revenue*allocation_share allocated_total_revenue_gbp,
  trusted_direct_sale_time_cogs_gbp,observed_purchased_label_cost_gbp*allocation_share allocated_shipping_cost_gbp,
  covered_payment_fees_gbp*allocation_share allocated_payment_fees_gbp,
  eligible_merchandise_revenue+customer_shipping_revenue*allocation_share-trusted_direct_sale_time_cogs_gbp-observed_purchased_label_cost_gbp*allocation_share-covered_payment_fees_gbp*allocation_share operational_contribution_gbp,allocation_share
from ready;

create view public.vault_shopify_verified_product_profitability with (security_barrier=true,security_invoker=true) as
select product_id,max(product_name) product_name,count(distinct order_id) eligible_orders,sum(eligible_units) eligible_units,sum(eligible_merchandise_revenue) eligible_merchandise_revenue,sum(allocated_customer_shipping_revenue_gbp) allocated_customer_shipping_revenue_gbp,sum(allocated_total_revenue_gbp) eligible_net_revenue,sum(trusted_direct_sale_time_cogs_gbp) trusted_direct_sale_time_cogs_gbp,sum(allocated_shipping_cost_gbp) allocated_shipping_cost_gbp,sum(allocated_payment_fees_gbp) allocated_payment_fees_gbp,sum(operational_contribution_gbp) operational_contribution_gbp,sum(operational_contribution_gbp)/nullif(sum(eligible_units),0) contribution_per_eligible_unit_gbp,(sum(operational_contribution_gbp)/nullif(sum(allocated_total_revenue_gbp),0))*100 contribution_margin_pct
from public.vault_shopify_verified_product_profitability_line_allocations group by product_id;

create view public.vault_shopify_product_profitability_coverage with (security_barrier=true,security_invoker=true) as
with lines as (select d.order_id,d.exclusion_reason_codes,p.id product_id,p.title product_name,l.cogs_quantity units,l.net_line_revenue revenue from public.vault_shopify_order_operational_contribution_diagnostics d join public.vault_shopify_order_lines l on l.order_id=d.order_id and l.cogs_quantity>0 join public.vault_variants v on v.source='shopify' and v.source_variant_id=l.shopify_variant_id join public.vault_products p on p.id=v.product_id and p.source='shopify' and (l.shopify_product_id is null or p.source_product_id=l.shopify_product_id)), ready as (select distinct order_id from public.vault_shopify_verified_product_profitability_line_allocations)
select l.product_id,max(l.product_name) product_name,count(distinct l.order_id) total_canonical_sold_orders,sum(l.units) total_canonical_sold_units,count(distinct l.order_id) filter(where cardinality(l.exclusion_reason_codes)=0) eligible_orders,sum(l.units) filter(where cardinality(l.exclusion_reason_codes)=0) eligible_units,count(distinct l.order_id) filter(where cardinality(l.exclusion_reason_codes)>0) excluded_orders,sum(l.units) filter(where cardinality(l.exclusion_reason_codes)>0) excluded_units,sum(l.revenue) filter(where cardinality(l.exclusion_reason_codes)=0) eligible_revenue,sum(l.revenue) filter(where cardinality(l.exclusion_reason_codes)>0) excluded_revenue,(count(distinct l.order_id) filter(where cardinality(l.exclusion_reason_codes)=0)::numeric/nullif(count(distinct l.order_id),0))*100 evidence_coverage_order_pct,(sum(l.units) filter(where cardinality(l.exclusion_reason_codes)=0)/nullif(sum(l.units),0))*100 evidence_coverage_unit_pct,(sum(l.revenue) filter(where cardinality(l.exclusion_reason_codes)=0)/nullif(sum(l.revenue),0))*100 evidence_coverage_revenue_pct,count(distinct l.order_id) filter(where cardinality(l.exclusion_reason_codes)=0 and ready.order_id is null) allocation_unavailable_eligible_orders
from lines l left join ready using(order_id) group by l.product_id;

revoke all on public.vault_shopify_verified_product_profitability_line_allocations,public.vault_shopify_verified_product_profitability,public.vault_shopify_product_profitability_coverage from public,anon,authenticated;
grant select on public.vault_shopify_verified_product_profitability_line_allocations,public.vault_shopify_verified_product_profitability,public.vault_shopify_product_profitability_coverage to service_role;
notify pgrst,'reload schema';
