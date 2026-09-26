-- Read-only, source-backed Shopify line discount resolution; no mutable-line rewrite.
begin;
create view public.vault_shopify_resolved_line_discount_evidence
with (security_barrier=true,security_invoker=true) as
with latest as (
  select distinct on(source,shopify_order_id,shopify_line_item_id,application_index) *
  from public.vault_shopify_line_discount_allocation_observations
  order by source,shopify_order_id,shopify_line_item_id,application_index,order_source_updated_at desc,created_at desc
), line_allocations as (
  select source,shopify_order_id,order_source_updated_at,shopify_line_item_id,count(*) allocation_rows,
    sum(allocated_shop_amount) source_discount_allocation,
    bool_and(fingerprint_contract_version='shopify-source-content-v1' and nullif(payload_fingerprint,'') is not null and payload_fingerprint=source_content_fingerprint and allocated_shop_currency='GBP' and (allocated_presentment_currency is null or allocated_presentment_currency='GBP')) valid,
    max(source_content_fingerprint) source_content_fingerprint
  from latest group by source,shopify_order_id,order_source_updated_at,shopify_line_item_id
)
select l.order_id,o.shopify_order_id,l.id order_line_id,l.shopify_line_item_id,o.currency,
  l.quantity*l.unit_price gross_line_revenue,l.discount_allocation canonical_discount_allocation,
  a.source_discount_allocation,
  case when f.order_id is not null and a.valid and a.allocation_rows>0 then a.source_discount_allocation when coalesce(f.discount_allocation_count,0)=0 then l.discount_allocation end resolved_discount_allocation,
  case when f.order_id is not null and a.valid and a.allocation_rows>0 then l.quantity*l.unit_price-a.source_discount_allocation when coalesce(f.discount_allocation_count,0)=0 then l.quantity*l.unit_price-l.discount_allocation end resolved_net_line_revenue,
  case when f.order_id is not null and a.valid and a.allocation_rows>0 then 'resolved_source_backed' when coalesce(f.discount_allocation_count,0)=0 then 'canonical_fallback' else 'unresolved' end resolution_status,
  case when f.order_id is not null and a.valid and a.allocation_rows>0 then 'SHOPIFY_IMMUTABLE_LINE_DISCOUNT_ALLOCATION' when coalesce(f.discount_allocation_count,0)=0 then 'CANONICAL_LINE_DISCOUNT_ALLOCATION' else 'UNRESOLVED' end evidence_method,
  a.source_content_fingerprint provenance_fingerprint
from public.vault_shopify_order_lines l join public.vault_shopify_orders o on o.id=l.order_id
left join public.vault_shopify_verified_order_financials f on f.order_id=o.id
left join line_allocations a on a.source=o.source and a.shopify_order_id=o.shopify_order_id and a.order_source_updated_at=o.shopify_updated_at and a.shopify_line_item_id=l.shopify_line_item_id;
revoke all on public.vault_shopify_resolved_line_discount_evidence from public,anon,authenticated;
grant select on public.vault_shopify_resolved_line_discount_evidence to service_role;
notify pgrst,'reload schema'; commit;
