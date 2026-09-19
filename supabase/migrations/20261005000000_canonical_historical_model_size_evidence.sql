-- Phase 1B3: one canonical commercial-line meaning shared by current and historical size evidence.
create or replace view public.vault_canonical_resolved_commercial_order_lines as
with variant_counts as (
  select source_variant_id, count(*)::integer variant_count
  from public.vault_variants
  where source = 'shopify' and source_variant_id is not null
  group by source_variant_id
), safe_shopify_ownership as (
  select source_variant_id, min(product_id::text)::uuid parent_product_id
  from public.vault_variants
  where source = 'shopify' and source_variant_id is not null
  group by source_variant_id
  having count(distinct product_id) = 1
), canonical_variants as (
  select v.source_variant_id, v.product_id as parent_product_id,
    trim(v.model_design) as model_design, trim(v.normalized_size) as normalized_size
  from public.vault_variants v
  join variant_counts c on c.source_variant_id = v.source_variant_id
  where v.source = 'shopify' and c.variant_count = 1
    and v.identity_resolution_status = 'resolved'
    and nullif(trim(v.model_design), '') is not null
    and nullif(trim(v.normalized_size), '') is not null
)
select l.id as order_line_id, l.shopify_variant_id, o.shopify_created_at,
  greatest(l.quantity - l.refunded_quantity, 0)::numeric as net_units,
  coalesce(v.parent_product_id, ownership.parent_product_id) as parent_product_id,
  v.model_design, v.normalized_size,
  case when v.source_variant_id is not null then 'resolved'
    when ownership.source_variant_id is not null then 'known_parent_unresolved'
    when c.source_variant_id is not null then 'global_unresolved'
    else 'unmatched' end as mapping_status
from public.vault_shopify_order_lines l
join public.vault_shopify_orders o on o.id = l.order_id
left join variant_counts c on c.source_variant_id = l.shopify_variant_id
left join safe_shopify_ownership ownership on ownership.source_variant_id = l.shopify_variant_id
left join canonical_variants v on v.source_variant_id = l.shopify_variant_id
where o.cancelled_at is null
  and coalesce((o.metadata ->> 'test')::boolean, false) = false;

create or replace view public.vault_model_size_replenishment_intelligence as
with latest_sync as (select completed_at from public.vault_shopify_order_sync_runs where sync_days >= 7 order by completed_at desc limit 1),
canonical_history as (select min(shopify_created_at) earliest_order_at from public.vault_shopify_orders where shopify_created_at >= ('2026-05-04 00:00:00'::timestamp at time zone 'Europe/London') and cancelled_at is null and coalesce((metadata ->> 'test')::boolean,false)=false),
variant_counts as (select source_variant_id,count(*)::integer variant_count from public.vault_variants where source='shopify' and source_variant_id is not null group by source_variant_id),
canonical_variants as (select v.id variant_id,v.source_variant_id,v.product_id parent_product_id,trim(v.model_design) model_design,trim(v.normalized_size) normalized_size,v.source_active from public.vault_variants v join variant_counts c on c.source_variant_id=v.source_variant_id where v.source='shopify' and c.variant_count=1 and v.identity_resolution_status='resolved' and nullif(trim(v.model_design),'') is not null and nullif(trim(v.normalized_size),'') is not null),
current_inventory as (select v.parent_product_id,v.model_design,v.normalized_size,coalesce(sum(i.available_quantity),0)::integer available_stock,coalesce(sum(i.committed_quantity),0)::integer committed_stock,coalesce(sum(i.incoming_quantity),0)::integer incoming_stock,max(i.synced_at) inventory_freshness from canonical_variants v join public.vault_products p on p.id=v.parent_product_id left join public.vault_inventory_levels i on i.variant_id=v.variant_id where v.source_active=true and p.source='shopify' and upper(coalesce(p.status,''))='ACTIVE' group by v.parent_product_id,v.model_design,v.normalized_size),
classified_lines as (select * from public.vault_canonical_resolved_commercial_order_lines where shopify_created_at >= ('2026-05-04 00:00:00'::timestamp at time zone 'Europe/London') and shopify_created_at < (select completed_at from latest_sync)),
sales_by_size as (select parent_product_id,model_design,normalized_size,sum(net_units) filter(where shopify_created_at>=s.completed_at-interval '7 days')::numeric sales_7_day_units,sum(net_units) filter(where shopify_created_at>=s.completed_at-interval '14 days')::numeric sales_14_day_units,sum(net_units) filter(where shopify_created_at>=s.completed_at-interval '30 days')::numeric sales_30_day_units,max(shopify_created_at) filter(where net_units>0) last_sale_date from classified_lines cross join latest_sync s where mapping_status='resolved' group by parent_product_id,model_design,normalized_size),
parent_quality as (select parent_product_id,coalesce(sum(net_units),0)::numeric style_unresolved_clean_sales_units from classified_lines where mapping_status='known_parent_unresolved' group by parent_product_id),
global_quality as (select coalesce(sum(net_units) filter(where mapping_status in ('known_parent_unresolved','global_unresolved')),0)::numeric global_unresolved_clean_sales_units,coalesce(sum(net_units) filter(where mapping_status='unmatched'),0)::numeric global_unmatched_clean_sales_units from classified_lines),
evidence_keys as (select parent_product_id,model_design,normalized_size from current_inventory union select parent_product_id,model_design,normalized_size from sales_by_size)
select k.parent_product_id::text||'::'||k.model_design||'::'||k.normalized_size model_size_id,k.parent_product_id::text||'::'||k.model_design style_id,k.parent_product_id,k.model_design,k.normalized_size,coalesce(i.available_stock,0)::integer available_stock,coalesce(i.committed_stock,0)::integer committed_stock,coalesce(i.incoming_stock,0)::integer incoming_stock,(coalesce(i.available_stock,0)-coalesce(i.committed_stock,0)+coalesce(i.incoming_stock,0))::integer net_available_stock,case when s.completed_at is null then null else coalesce(sales.sales_7_day_units,0) end sales_7_day_units,case when s.completed_at is null then null else coalesce(sales.sales_14_day_units,0) end sales_14_day_units,case when s.completed_at is null then null else coalesce(sales.sales_30_day_units,0) end sales_30_day_units,case when s.completed_at is null then null else coalesce(sales.sales_7_day_units,0)/7.0 end average_daily_sales,sales.last_sale_date,case when sales.last_sale_date is null or s.completed_at is null then null else greatest(0,floor(extract(epoch from(s.completed_at-sales.last_sale_date))/86400))::integer end days_since_last_sale,i.inventory_freshness,s.completed_at order_history_freshness,(s.completed_at is not null and h.earliest_order_at is not null and h.earliest_order_at<=s.completed_at-interval '30 days') sales_history_30_complete,coalesce(q.style_unresolved_clean_sales_units,0)=0 style_sales_mapping_complete,coalesce(q.style_unresolved_clean_sales_units,0)::numeric style_unresolved_clean_sales_units,(g.global_unresolved_clean_sales_units=0 and g.global_unmatched_clean_sales_units=0) global_sales_mapping_complete,g.global_unresolved_clean_sales_units,g.global_unmatched_clean_sales_units,(s.completed_at is not null and s.completed_at>=now()-interval '30 minutes' and i.inventory_freshness is not null and i.inventory_freshness>=now()-interval '30 minutes' and h.earliest_order_at is not null and h.earliest_order_at<=s.completed_at-interval '30 days' and coalesce(q.style_unresolved_clean_sales_units,0)=0) trusted,array_remove(array[case when s.completed_at is null then 'sales_history_unavailable' end,case when s.completed_at<now()-interval '30 minutes' then 'sales_history_stale' end,case when i.inventory_freshness is null then 'inventory_freshness_unavailable' end,case when i.inventory_freshness<now()-interval '30 minutes' then 'inventory_stale' end,case when h.earliest_order_at is null or h.earliest_order_at>s.completed_at-interval '30 days' then 'sales_history_30_incomplete' end,case when coalesce(q.style_unresolved_clean_sales_units,0)>0 then 'style_sales_mapping_incomplete' end],null) missing_requirements
from evidence_keys k left join current_inventory i using(parent_product_id,model_design,normalized_size) left join sales_by_size sales using(parent_product_id,model_design,normalized_size) left join parent_quality q using(parent_product_id) left join latest_sync s on true left join canonical_history h on true cross join global_quality g;

create or replace view public.vault_historical_model_size_evidence as
with variant_counts as (select source_variant_id,count(*)::integer variant_count from public.vault_variants where source='shopify' and source_variant_id is not null group by source_variant_id),
canonical_sizes as (select v.product_id parent_product_id,trim(v.model_design) model_design,trim(v.normalized_size) normalized_size from public.vault_variants v join variant_counts c on c.source_variant_id=v.source_variant_id where v.source='shopify' and c.variant_count=1 and v.identity_resolution_status='resolved' and nullif(trim(v.model_design),'') is not null and nullif(trim(v.normalized_size),'') is not null group by v.product_id,trim(v.model_design),trim(v.normalized_size)),
style_quality as (select e.style_id,coalesce(sum(l.net_units) filter(where l.mapping_status='known_parent_unresolved' and l.shopify_created_at>=e.verified_live_at and l.shopify_created_at<e.evidence_as_of),0)::numeric unresolved_units from public.vault_style_trading_evidence e left join public.vault_canonical_resolved_commercial_order_lines l on l.parent_product_id=e.parent_product_id and l.shopify_created_at>=e.verified_live_at and l.shopify_created_at<e.evidence_as_of group by e.style_id),
style_evidence as (select e.*,q.unresolved_units,(e.verified_live_at is not null and e.evidence_as_of is not null and e.order_evidence_fresh and e.coverage_complete and q.unresolved_units=0) historical_evidence_available,case when e.verified_live_at is null then 'historical_verified_live_unavailable' when e.evidence_as_of is null then 'historical_evidence_as_of_unavailable' when not e.order_evidence_fresh then 'sales_history_stale' when not e.coverage_complete then 'sales_history_coverage_incomplete' when q.unresolved_units>0 then 'style_sales_mapping_incomplete' else null end historical_evidence_unavailable_reason from public.vault_style_trading_evidence e join style_quality q using(style_id)),
sales as (select e.style_id,l.normalized_size,coalesce(sum(l.net_units),0)::numeric historical_attributable_observed_units from style_evidence e join public.vault_canonical_resolved_commercial_order_lines l on l.parent_product_id=e.parent_product_id and l.model_design=e.style_name and l.mapping_status='resolved' and l.shopify_created_at>=e.verified_live_at and l.shopify_created_at<e.evidence_as_of group by e.style_id,l.normalized_size),
totals as (select style_id,coalesce(sum(historical_attributable_observed_units),0)::numeric total_historical_size_attributable_observed_units from sales group by style_id)
select e.style_id,e.parent_product_id,e.style_name as model_design,s.normalized_size,e.historical_evidence_available,e.historical_evidence_unavailable_reason,e.verified_live_at as historical_evidence_start,e.evidence_as_of as historical_evidence_end,case when e.historical_evidence_available then coalesce(sale.historical_attributable_observed_units,0) else null end historical_attributable_observed_units,case when e.historical_evidence_available then coalesce(t.total_historical_size_attributable_observed_units,0) else null end total_historical_size_attributable_observed_units,case when e.historical_evidence_available and coalesce(t.total_historical_size_attributable_observed_units,0)>0 then coalesce(sale.historical_attributable_observed_units,0)/t.total_historical_size_attributable_observed_units else null end historical_observed_demand_share,'not_evaluated'::text as historical_availability_censoring
from style_evidence e left join canonical_sizes s on s.parent_product_id=e.parent_product_id and s.model_design=e.style_name left join sales sale on sale.style_id=e.style_id and sale.normalized_size=s.normalized_size left join totals t on t.style_id=e.style_id;

notify pgrst, 'reload schema';
