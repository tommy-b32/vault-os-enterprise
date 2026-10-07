-- Bounded reader for Sales Workbook proposal generation. This preserves the
-- authoritative profitability-allocation formula while applying target order
-- IDs before per-order denominator aggregation. It is read-only evidence.

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
    or exists (select 1 from unnest(p_order_ids) as target(order_id) where target.order_id is null) then
    raise exception 'A bounded non-empty order-id list is required';
  end if;

  return query
  with eligible_lines as (
    select
      c.order_id,
      c.canonical_net_revenue,
      c.observed_purchased_label_cost_gbp,
      c.covered_payment_fees_gbp,
      o.shipping authoritative_customer_shipping_revenue_gbp,
      l.id order_line_id,
      line_revenue.resolved_net_line_revenue eligible_merchandise_revenue,
      resolved.resolved_cogs_gbp
    from public.vault_shopify_verified_order_operational_contributions c
    join public.vault_shopify_orders o on o.id = c.order_id
    join public.vault_shopify_order_lines l
      on l.order_id = c.order_id
     and l.cogs_quantity > 0
    join public.vault_stage1_sold_line_cogs_resolutions resolved
      on resolved.order_line_id = l.id
    join public.vault_shopify_resolved_line_discount_evidence line_revenue
      on line_revenue.order_line_id = l.id
     and line_revenue.resolution_status in ('resolved_source_backed', 'canonical_fallback')
    join public.vault_variants v
      on v.source = 'shopify'
     and v.source_variant_id = l.shopify_variant_id
    join public.vault_products p
      on p.id = v.product_id
     and p.source = 'shopify'
     and (l.shopify_product_id is null or p.source_product_id = l.shopify_product_id)
    where c.order_id = any (p_order_ids)
  ), denominators as (
    select
      order_id,
      sum(eligible_merchandise_revenue) merchandise_revenue_basis,
      max(canonical_net_revenue) canonical_net_revenue,
      max(authoritative_customer_shipping_revenue_gbp) customer_shipping_revenue
    from eligible_lines
    group by order_id
  ), ready as (
    select
      line.*,
      denominator.customer_shipping_revenue,
      line.eligible_merchandise_revenue / denominator.merchandise_revenue_basis allocation_share
    from eligible_lines line
    join denominators denominator using (order_id)
    where denominator.merchandise_revenue_basis > 0
      and denominator.customer_shipping_revenue >= 0
      and denominator.canonical_net_revenue = denominator.merchandise_revenue_basis + denominator.customer_shipping_revenue
      and line.eligible_merchandise_revenue >= 0
      and line.resolved_cogs_gbp is not null
  )
  select
    order_id,
    order_line_id,
    observed_purchased_label_cost_gbp * allocation_share,
    covered_payment_fees_gbp * allocation_share
  from ready;
end;
$$;

comment on function public.get_verified_product_profitability_allocations_for_orders(uuid[]) is
  'Read-only bounded projection of the authoritative verified profitability allocation formula for at most 100 explicit order IDs.';

revoke all on function public.get_verified_product_profitability_allocations_for_orders(uuid[]) from public, anon, authenticated;
grant execute on function public.get_verified_product_profitability_allocations_for_orders(uuid[]) to service_role;

notify pgrst, 'reload schema';
