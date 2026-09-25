-- Timestamped coverage base for period reporting. It does not change all-time aggregates.
create view public.vault_shopify_product_profitability_coverage_lines
with (security_barrier = true, security_invoker = true) as
with mapped_lines as (
  select d.order_id,d.shopify_created_at,d.exclusion_reason_codes,p.id product_id,p.title product_name,
    l.id order_line_id,l.cogs_quantity units,l.net_line_revenue revenue
  from public.vault_shopify_order_operational_contribution_diagnostics d
  join public.vault_shopify_order_lines l on l.order_id=d.order_id and l.cogs_quantity>0
  join public.vault_variants v on v.source='shopify' and v.source_variant_id=l.shopify_variant_id
  join public.vault_products p on p.id=v.product_id and p.source='shopify'
    and (l.shopify_product_id is null or p.source_product_id=l.shopify_product_id)
), allocation_ready as (select distinct order_id from public.vault_shopify_verified_product_profitability_line_allocations)
select l.*, cardinality(l.exclusion_reason_codes)=0 as stage_1_eligible,
  (cardinality(l.exclusion_reason_codes)=0 and allocation_ready.order_id is null) as allocation_unavailable_eligible
from mapped_lines l left join allocation_ready using(order_id);
revoke all on public.vault_shopify_product_profitability_coverage_lines from public,anon,authenticated;
grant select on public.vault_shopify_product_profitability_coverage_lines to service_role;
notify pgrst,'reload schema';
