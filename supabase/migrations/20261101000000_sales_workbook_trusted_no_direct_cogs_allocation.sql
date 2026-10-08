-- Extend the bounded, read-only Sales Workbook allocation reader to admit only
-- fully snapshotted no-direct-COGS treatment evidence. This does not create or
-- alter treatment evidence, and deliberately does not admit policy-derived COGS.
create or replace function public.get_verified_product_profitability_allocations_for_orders(
  p_order_ids uuid[]
)
returns table (
  order_id uuid,
  order_line_id uuid,
  allocated_shipping_cost_gbp numeric,
  allocated_payment_fees_gbp numeric
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if cardinality(p_order_ids) is null
    or cardinality(p_order_ids) = 0
    or cardinality(p_order_ids) > 100
    or exists (
      select 1
      from unnest(p_order_ids) as target(target_order_id)
      where target.target_order_id is null
    ) then
    raise exception 'A bounded non-empty order-id list is required';
  end if;

  return query
  with eligible_lines as (
    select
      contribution.order_id as source_order_id,
      contribution.canonical_net_revenue as canonical_net_revenue,
      contribution.observed_purchased_label_cost_gbp as observed_purchased_label_cost_gbp,
      contribution.covered_payment_fees_gbp as covered_payment_fees_gbp,
      shopify_order.shipping as authoritative_customer_shipping_revenue_gbp,
      shopify_line.id as source_order_line_id,
      line_revenue.resolved_net_line_revenue as eligible_merchandise_revenue,
      case
        when shopify_line.financial_treatment = 'no_direct_cogs_at_sale'
          and shopify_line.financial_treatment_status = 'trusted_no_direct_cogs_at_sale'
          and shopify_line.financial_treatment_history_id is not null
          and shopify_line.financial_treatment_snapshotted_at is not null
          and shopify_line.sale_time_direct_cogs_gbp = 0
          then shopify_line.sale_time_direct_cogs_gbp
        else stage1_cogs.resolved_cogs_gbp
      end as resolved_cogs_gbp
    from public.vault_shopify_verified_order_operational_contributions as contribution
    join public.vault_shopify_orders as shopify_order
      on shopify_order.id = contribution.order_id
    join public.vault_shopify_order_lines as shopify_line
      on shopify_line.order_id = contribution.order_id
     and shopify_line.cogs_quantity > 0
    left join public.vault_stage1_sold_line_cogs_resolutions as stage1_cogs
      on stage1_cogs.order_line_id = shopify_line.id
    join public.vault_shopify_resolved_line_discount_evidence as line_revenue
      on line_revenue.order_line_id = shopify_line.id
     and line_revenue.resolution_status in ('resolved_source_backed', 'canonical_fallback')
    join public.vault_variants as variant
      on variant.source = 'shopify'
     and variant.source_variant_id = shopify_line.shopify_variant_id
    join public.vault_products as product
      on product.id = variant.product_id
     and product.source = 'shopify'
     and (shopify_line.shopify_product_id is null or product.source_product_id = shopify_line.shopify_product_id)
    where contribution.order_id = any (p_order_ids)
      and (
        stage1_cogs.order_line_id is not null
        or (
          shopify_line.financial_treatment = 'no_direct_cogs_at_sale'
          and shopify_line.financial_treatment_status = 'trusted_no_direct_cogs_at_sale'
          and shopify_line.financial_treatment_history_id is not null
          and shopify_line.financial_treatment_snapshotted_at is not null
          and shopify_line.sale_time_direct_cogs_gbp = 0
        )
      )
  ), order_denominators as (
    select
      el.source_order_id as source_order_id,
      sum(el.eligible_merchandise_revenue) as merchandise_revenue_basis,
      max(el.canonical_net_revenue) as canonical_net_revenue,
      max(el.authoritative_customer_shipping_revenue_gbp) as customer_shipping_revenue
    from eligible_lines as el
    group by el.source_order_id
  ), ready_allocations as (
    select
      el.source_order_id,
      el.source_order_line_id,
      el.observed_purchased_label_cost_gbp,
      el.covered_payment_fees_gbp,
      el.eligible_merchandise_revenue / od.merchandise_revenue_basis as allocation_share
    from eligible_lines as el
    join order_denominators as od
      on od.source_order_id = el.source_order_id
    where od.merchandise_revenue_basis > 0
      and od.customer_shipping_revenue >= 0
      and od.canonical_net_revenue = od.merchandise_revenue_basis + od.customer_shipping_revenue
      and el.eligible_merchandise_revenue >= 0
      and el.resolved_cogs_gbp is not null
  )
  select
    ra.source_order_id as order_id,
    ra.source_order_line_id as order_line_id,
    ra.observed_purchased_label_cost_gbp * ra.allocation_share as allocated_shipping_cost_gbp,
    ra.covered_payment_fees_gbp * ra.allocation_share as allocated_payment_fees_gbp
  from ready_allocations as ra;
end;
$$;

comment on function public.get_verified_product_profitability_allocations_for_orders(uuid[]) is
  'Read-only bounded allocation for at most 100 explicit orders. It admits immutable Stage 1 COGS resolutions and fully snapshotted trusted no-direct-COGS treatment only.';

revoke all on function public.get_verified_product_profitability_allocations_for_orders(uuid[]) from public, anon, authenticated;
grant execute on function public.get_verified_product_profitability_allocations_for_orders(uuid[]) to service_role;

notify pgrst, 'reload schema';
