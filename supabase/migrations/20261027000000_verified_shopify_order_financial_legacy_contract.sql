-- Stage 1 read-model correction: accept both immutable C2 fingerprint contracts.
-- Evidence remains append-only; only the reporting view definition changes.
create or replace view public.vault_shopify_verified_order_financials
with (security_barrier = true) as
with valid_capture as (
  select c.source,c.shopify_order_id,c.order_source_updated_at,max(c.evidence_mode) evidence_mode,max(c.observed_at) observed_at,max(c.source_content_fingerprint) source_content_fingerprint,count(*) capture_rows,max(c.discount_application_count) discount_application_count,max(c.discount_allocation_count) discount_allocation_count,max(c.refund_count) refund_count,max(c.refund_line_count) refund_line_count,max(c.refund_transaction_count) refund_transaction_count
  from public.vault_shopify_financial_capture_completeness_observations c
  where c.source='shopify' and c.discount_applications_complete and c.line_items_complete and c.refunds_complete and c.refund_lines_complete and c.refund_transactions_complete and c.fingerprint_contract_version='shopify-source-content-v1' and nullif(c.payload_fingerprint,'') is not null and c.payload_fingerprint=c.source_content_fingerprint
  group by c.source,c.shopify_order_id,c.order_source_updated_at
), applications as (
  select source,shopify_order_id,order_source_updated_at,count(*) row_count,
    count(distinct fingerprint_contract_version)=1 and bool_and(nullif(payload_fingerprint,'') is not null and ((fingerprint_contract_version='shopify-source-content-v1' and payload_fingerprint=source_content_fingerprint) or (fingerprint_contract_version='legacy-full-row-v1' and source_content_fingerprint is null)) and (pricing_currency is null or pricing_currency='GBP')) valid
  from (select distinct on(source,shopify_order_id,application_index) * from public.vault_shopify_discount_application_observations order by source,shopify_order_id,application_index,order_source_updated_at desc,created_at desc) evidence group by source,shopify_order_id,order_source_updated_at
), allocations as (
  select source,shopify_order_id,order_source_updated_at,count(*) row_count,sum(allocated_shop_amount) total,
    count(distinct fingerprint_contract_version)=1 and bool_and(nullif(payload_fingerprint,'') is not null and ((fingerprint_contract_version='shopify-source-content-v1' and payload_fingerprint=source_content_fingerprint) or (fingerprint_contract_version='legacy-full-row-v1' and source_content_fingerprint is null)) and allocated_shop_currency='GBP' and (allocated_presentment_currency is null or allocated_presentment_currency='GBP')) valid
  from (select distinct on(source,shopify_order_id,shopify_line_item_id,application_index) * from public.vault_shopify_line_discount_allocation_observations order by source,shopify_order_id,shopify_line_item_id,application_index,order_source_updated_at desc,created_at desc) evidence group by source,shopify_order_id,order_source_updated_at
), refunds as (
  select source,shopify_order_id,count(*) row_count,sum(total_refunded_amount) total,
    count(distinct fingerprint_contract_version)=1 and bool_and(nullif(payload_fingerprint,'') is not null and ((fingerprint_contract_version='shopify-source-content-v1' and payload_fingerprint=source_content_fingerprint) or (fingerprint_contract_version='legacy-full-row-v1' and source_content_fingerprint is null)) and currency='GBP') valid
  from (select distinct on(source,shopify_refund_id) * from public.vault_shopify_refund_observations order by source,shopify_refund_id,refund_source_updated_at desc,created_at desc) evidence group by source,shopify_order_id
), refund_lines as (
  select source,shopify_order_id,count(*) row_count,sum(subtotal_amount) merchandise_total,sum(tax_amount) tax_total,
    count(distinct fingerprint_contract_version)=1 and bool_and(nullif(payload_fingerprint,'') is not null and ((fingerprint_contract_version='shopify-source-content-v1' and payload_fingerprint=source_content_fingerprint) or (fingerprint_contract_version='legacy-full-row-v1' and source_content_fingerprint is null)) and currency='GBP') valid
  from (select distinct on(source,shopify_refund_id,shopify_refund_line_item_id) * from public.vault_shopify_refund_line_observations order by source,shopify_refund_id,shopify_refund_line_item_id,refund_source_updated_at desc,created_at desc) evidence group by source,shopify_order_id
), refund_transactions as (
  select source,shopify_order_id,count(*) row_count,
    count(distinct fingerprint_contract_version)=1 and bool_and(nullif(payload_fingerprint,'') is not null and ((fingerprint_contract_version='shopify-source-content-v1' and payload_fingerprint=source_content_fingerprint) or (fingerprint_contract_version='legacy-full-row-v1' and source_content_fingerprint is null)) and currency='GBP') valid
  from (select distinct on(source,shopify_order_transaction_id) * from public.vault_shopify_refund_transaction_observations order by source,shopify_order_transaction_id,refund_source_updated_at desc,created_at desc) evidence group by source,shopify_order_id
), refund_reconciliation as (
  select shopify_order_id,case when count(*)=0 then 'not_applicable' when bool_and(reconciliation_state='reconciled') then 'reconciled' else 'unreconciled' end status from public.vault_shopify_financial_refund_reconciliation group by shopify_order_id
)
select o.id order_id,o.shopify_order_id,o.shopify_created_at,o.shopify_updated_at order_source_updated_at,o.currency,o.net_revenue canonical_net_revenue,coalesce(a.total,0) discount_allocation_total,coalesce(r.total,0) refund_total,coalesce(rl.merchandise_total,0) refund_line_merchandise_total,coalesce(rl.tax_total,0) refund_line_tax_total,coalesce(rr.status,'not_applicable') refund_reconciliation_status,c.evidence_mode completeness_evidence_mode,c.observed_at completeness_observed_at,c.source_content_fingerprint completeness_source_content_fingerprint,c.discount_application_count,c.discount_allocation_count,c.refund_count,c.refund_line_count,c.refund_transaction_count
from public.vault_shopify_orders o join valid_capture c on c.source=o.source and c.shopify_order_id=o.shopify_order_id and c.order_source_updated_at=o.shopify_updated_at and c.capture_rows=1
left join applications da on da.source=o.source and da.shopify_order_id=o.shopify_order_id and da.order_source_updated_at=o.shopify_updated_at
left join allocations a on a.source=o.source and a.shopify_order_id=o.shopify_order_id and a.order_source_updated_at=o.shopify_updated_at
left join refunds r on r.source=o.source and r.shopify_order_id=o.shopify_order_id
left join refund_lines rl on rl.source=o.source and rl.shopify_order_id=o.shopify_order_id
left join refund_transactions rt on rt.source=o.source and rt.shopify_order_id=o.shopify_order_id
left join refund_reconciliation rr on rr.shopify_order_id=o.shopify_order_id
where o.source='shopify' and o.currency='GBP' and coalesce(da.row_count,0)=c.discount_application_count and coalesce(a.row_count,0)=c.discount_allocation_count and coalesce(r.row_count,0)=c.refund_count and coalesce(rl.row_count,0)=c.refund_line_count and coalesce(rt.row_count,0)=c.refund_transaction_count and coalesce(da.valid,c.discount_application_count=0) and coalesce(a.valid,c.discount_allocation_count=0) and coalesce(r.valid,c.refund_count=0) and coalesce(rl.valid,c.refund_line_count=0) and coalesce(rt.valid,c.refund_transaction_count=0);

comment on view public.vault_shopify_verified_order_financials is
  'Evidence-gated Shopify order financial facts. canonical_net_revenue is already adjusted; discount and refund fields are supporting evidence and must not be subtracted again.';
revoke all on public.vault_shopify_verified_order_financials from public, anon, authenticated;
grant select on public.vault_shopify_verified_order_financials to service_role;
notify pgrst, 'reload schema';
