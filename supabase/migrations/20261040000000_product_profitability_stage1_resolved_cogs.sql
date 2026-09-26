-- Product profitability consumes the authoritative Stage 1 line resolver.
begin;
drop view public.vault_shopify_product_profitability_coverage_lines;
drop view public.vault_shopify_product_profitability_coverage;
drop view public.vault_shopify_verified_product_profitability;
drop view public.vault_shopify_verified_product_profitability_line_allocations;

create view public.vault_shopify_verified_product_profitability_line_allocations
with (security_barrier=true,security_invoker=true) as
with eligible_lines as (
  select c.order_id,c.shopify_created_at,c.canonical_net_revenue,c.observed_purchased_label_cost_gbp,c.covered_payment_fees_gbp,
    o.shipping authoritative_customer_shipping_revenue_gbp,p.id product_id,p.title product_name,l.id order_line_id,l.cogs_quantity eligible_units,l.net_line_revenue eligible_merchandise_revenue,
    r.resolved_cogs_gbp,resolved.evidence_method,resolved.cogs_classification,resolved.provenance_id
  from public.vault_shopify_verified_order_operational_contributions c join public.vault_shopify_orders o on o.id=c.order_id
  join public.vault_shopify_order_lines l on l.order_id=c.order_id and l.cogs_quantity>0
  join public.vault_stage1_sold_line_cogs_resolutions resolved on resolved.order_line_id=l.id
  join lateral (select resolved.resolved_cogs_gbp) r on true
  join public.vault_variants v on v.source='shopify' and v.source_variant_id=l.shopify_variant_id
  join public.vault_products p on p.id=v.product_id and p.source='shopify' and (l.shopify_product_id is null or p.source_product_id=l.shopify_product_id)
), denominators as (select order_id,sum(eligible_merchandise_revenue) merchandise_revenue_basis,max(canonical_net_revenue) canonical_net_revenue,max(authoritative_customer_shipping_revenue_gbp) customer_shipping_revenue from eligible_lines group by order_id), ready as (
  select l.*,d.customer_shipping_revenue,l.eligible_merchandise_revenue/d.merchandise_revenue_basis allocation_share from eligible_lines l join denominators d using(order_id)
  where d.merchandise_revenue_basis>0 and d.customer_shipping_revenue>=0 and d.canonical_net_revenue=d.merchandise_revenue_basis+d.customer_shipping_revenue and l.eligible_merchandise_revenue>=0 and l.resolved_cogs_gbp is not null
)
select order_id,shopify_created_at,product_id,product_name,order_line_id,eligible_units,eligible_merchandise_revenue,customer_shipping_revenue*allocation_share allocated_customer_shipping_revenue_gbp,eligible_merchandise_revenue+customer_shipping_revenue*allocation_share allocated_total_revenue_gbp,
  resolved_cogs_gbp,evidence_method,cogs_classification,provenance_id,observed_purchased_label_cost_gbp*allocation_share allocated_shipping_cost_gbp,covered_payment_fees_gbp*allocation_share allocated_payment_fees_gbp,
  eligible_merchandise_revenue+customer_shipping_revenue*allocation_share-resolved_cogs_gbp-observed_purchased_label_cost_gbp*allocation_share-covered_payment_fees_gbp*allocation_share operational_contribution_gbp,allocation_share from ready;

create view public.vault_shopify_verified_product_profitability with (security_barrier=true,security_invoker=true) as
select product_id,max(product_name) product_name,count(distinct order_id) eligible_orders,sum(eligible_units) eligible_units,sum(eligible_merchandise_revenue) eligible_merchandise_revenue,sum(allocated_customer_shipping_revenue_gbp) allocated_customer_shipping_revenue_gbp,sum(allocated_total_revenue_gbp) eligible_net_revenue,sum(resolved_cogs_gbp) resolved_cogs_gbp,sum(allocated_shipping_cost_gbp) allocated_shipping_cost_gbp,sum(allocated_payment_fees_gbp) allocated_payment_fees_gbp,sum(operational_contribution_gbp) operational_contribution_gbp,sum(operational_contribution_gbp)/nullif(sum(eligible_units),0) contribution_per_eligible_unit_gbp,(sum(operational_contribution_gbp)/nullif(sum(allocated_total_revenue_gbp),0))*100 contribution_margin_pct
from public.vault_shopify_verified_product_profitability_line_allocations group by product_id;

create view public.vault_shopify_product_profitability_coverage with (security_barrier=true,security_invoker=true) as
with lines as (select d.order_id,d.exclusion_reason_codes,p.id product_id,p.title product_name,l.cogs_quantity units,l.net_line_revenue revenue from public.vault_shopify_order_operational_contribution_diagnostics d join public.vault_shopify_order_lines l on l.order_id=d.order_id and l.cogs_quantity>0 join public.vault_variants v on v.source='shopify' and v.source_variant_id=l.shopify_variant_id join public.vault_products p on p.id=v.product_id and p.source='shopify' and (l.shopify_product_id is null or p.source_product_id=l.shopify_product_id)),ready as (select distinct order_id from public.vault_shopify_verified_product_profitability_line_allocations)
select l.product_id,max(l.product_name) product_name,count(distinct l.order_id) total_canonical_sold_orders,sum(l.units) total_canonical_sold_units,count(distinct l.order_id) filter(where cardinality(l.exclusion_reason_codes)=0) eligible_orders,sum(l.units) filter(where cardinality(l.exclusion_reason_codes)=0) eligible_units,count(distinct l.order_id) filter(where cardinality(l.exclusion_reason_codes)>0) excluded_orders,sum(l.units) filter(where cardinality(l.exclusion_reason_codes)>0) excluded_units,sum(l.revenue) filter(where cardinality(l.exclusion_reason_codes)=0) eligible_revenue,sum(l.revenue) filter(where cardinality(l.exclusion_reason_codes)>0) excluded_revenue,count(distinct l.order_id) filter(where cardinality(l.exclusion_reason_codes)=0 and ready.order_id is null) allocation_unavailable_eligible_orders from lines l left join ready using(order_id) group by l.product_id;
create view public.vault_shopify_product_profitability_coverage_lines with (security_barrier=true,security_invoker=true) as
with mapped_lines as (select d.order_id,d.shopify_created_at,d.exclusion_reason_codes,p.id product_id,p.title product_name,l.id order_line_id,l.cogs_quantity units,l.net_line_revenue revenue from public.vault_shopify_order_operational_contribution_diagnostics d join public.vault_shopify_order_lines l on l.order_id=d.order_id and l.cogs_quantity>0 join public.vault_variants v on v.source='shopify' and v.source_variant_id=l.shopify_variant_id join public.vault_products p on p.id=v.product_id and p.source='shopify' and (l.shopify_product_id is null or p.source_product_id=l.shopify_product_id)),allocation_ready as (select distinct order_id from public.vault_shopify_verified_product_profitability_line_allocations)
select l.*,cardinality(l.exclusion_reason_codes)=0 stage_1_eligible,(cardinality(l.exclusion_reason_codes)=0 and allocation_ready.order_id is null) allocation_unavailable_eligible from mapped_lines l left join allocation_ready using(order_id);
revoke all on public.vault_shopify_verified_product_profitability_line_allocations,public.vault_shopify_verified_product_profitability,public.vault_shopify_product_profitability_coverage from public,anon,authenticated;
grant select on public.vault_shopify_verified_product_profitability_line_allocations,public.vault_shopify_verified_product_profitability,public.vault_shopify_product_profitability_coverage to service_role;
revoke all on public.vault_shopify_product_profitability_coverage_lines from public,anon,authenticated;
grant select on public.vault_shopify_product_profitability_coverage_lines to service_role;
notify pgrst,'reload schema'; commit;
