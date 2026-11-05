-- Keep the governed evidence contracts intact while forcing filters to execute
-- inside their security-barrier views before cross-view joins occur.
create or replace function public.get_verified_product_profitability_allocations_for_orders(p_order_ids uuid[])
returns table(order_id uuid,order_line_id uuid,allocated_shipping_cost_gbp numeric,allocated_payment_fees_gbp numeric)
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if cardinality(p_order_ids) is null or cardinality(p_order_ids)=0 or cardinality(p_order_ids)>100 or exists(select 1 from unnest(p_order_ids) target(target_order_id) where target.target_order_id is null) then raise exception 'A bounded non-empty order-id list is required'; end if;
 return query with target_lines as materialized (
  select l.id,l.order_id,l.shopify_variant_id,l.shopify_product_id,l.financial_treatment,l.financial_treatment_status,l.financial_treatment_history_id,l.financial_treatment_snapshotted_at,l.sale_time_direct_cogs_gbp
  from public.vault_shopify_order_lines l where l.order_id=any(p_order_ids) and l.cogs_quantity>0
 ), target_contributions as materialized (
  select c.order_id,c.canonical_net_revenue,c.observed_purchased_label_cost_gbp,c.covered_payment_fees_gbp from public.vault_shopify_verified_order_operational_contributions c where c.order_id=any(p_order_ids)
 ), target_line_revenue as materialized (
  select r.order_line_id,r.resolved_net_line_revenue from public.vault_shopify_resolved_line_discount_evidence r where r.order_line_id in(select id from target_lines) and r.resolution_status in('resolved_source_backed','canonical_fallback')
 ), eligible_lines as (
  select c.order_id,c.canonical_net_revenue,c.observed_purchased_label_cost_gbp,c.covered_payment_fees_gbp,o.shipping,l.id order_line_id,r.resolved_net_line_revenue,case when l.financial_treatment='no_direct_cogs_at_sale' and l.financial_treatment_status='trusted_no_direct_cogs_at_sale' and l.financial_treatment_history_id is not null and l.financial_treatment_snapshotted_at is not null and l.sale_time_direct_cogs_gbp=0 then l.sale_time_direct_cogs_gbp else s.resolved_cogs_gbp end resolved_cogs_gbp
  from target_lines l join target_contributions c on c.order_id=l.order_id join public.vault_shopify_orders o on o.id=l.order_id left join public.vault_stage1_sold_line_cogs_resolutions s on s.order_line_id=l.id join target_line_revenue r on r.order_line_id=l.id join public.vault_variants v on v.source='shopify' and v.source_variant_id=l.shopify_variant_id join public.vault_products p on p.id=v.product_id and p.source='shopify' and (l.shopify_product_id is null or p.source_product_id=l.shopify_product_id)
  where s.order_line_id is not null or (l.financial_treatment='no_direct_cogs_at_sale' and l.financial_treatment_status='trusted_no_direct_cogs_at_sale' and l.financial_treatment_history_id is not null and l.financial_treatment_snapshotted_at is not null and l.sale_time_direct_cogs_gbp=0)
 ), d as (select el.order_id,sum(el.resolved_net_line_revenue) revenue,max(el.canonical_net_revenue) net,max(el.shipping) shipping from eligible_lines el group by el.order_id)
 select e.order_id,e.order_line_id,e.observed_purchased_label_cost_gbp*(e.resolved_net_line_revenue/d.revenue),e.covered_payment_fees_gbp*(e.resolved_net_line_revenue/d.revenue) from eligible_lines e join d on d.order_id=e.order_id where d.revenue>0 and d.shipping>=0 and d.net=d.revenue+d.shipping and e.resolved_net_line_revenue>=0 and e.resolved_cogs_gbp is not null;
end $$;
comment on function public.get_verified_product_profitability_allocations_for_orders(uuid[]) is 'Read-only bounded allocation using target-filtered governed evidence projections.';
revoke all on function public.get_verified_product_profitability_allocations_for_orders(uuid[]) from public,anon,authenticated;
grant execute on function public.get_verified_product_profitability_allocations_for_orders(uuid[]) to service_role;
notify pgrst,'reload schema';
