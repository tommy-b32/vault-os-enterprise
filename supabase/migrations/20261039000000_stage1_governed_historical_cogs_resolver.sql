-- Admit only existing governed historical line attributions into Stage 1.
begin;

alter view public.vault_shopify_order_operational_contribution_diagnostics rename to vault_shopify_order_operational_contribution_diagnostics_base;

create view public.vault_stage1_sold_line_cogs_resolutions
with (security_barrier = true, security_invoker = true) as
with direct as (
  select l.id order_line_id, l.order_id, 'DIRECT_TRUSTED_SALE_TIME_COGS'::text evidence_method,
    'direct'::text cogs_classification, l.total_cogs_gbp resolved_cogs_gbp,
    l.cogs_history_id::text provenance_id
  from public.vault_shopify_order_lines l
  where l.cogs_quantity > 0 and l.cogs_status='trusted' and l.cogs_history_id is not null
    and l.cogs_snapshotted_at is not null and l.unit_cogs_gbp is not null and l.unit_cogs_gbp >= 0
    and l.total_cogs_gbp is not null and l.total_cogs_gbp >= 0
), policy as (
  select a.order_line_id,a.order_id,a.evidence_method,'policy_derived'::text cogs_classification,
    a.total_policy_derived_cogs_gbp resolved_cogs_gbp,a.policy_version_id::text || ':' || a.batch_evidence_id::text provenance_id
  from public.vault_historical_policy_derived_cogs_line_attributions a
  where a.evidence_method='POLICY_DERIVED_BATCH_AVERAGE'
), service as (
  select a.order_line_id,a.order_id,a.evidence_method,'historical_service'::text cogs_classification,
    a.total_direct_sale_time_cogs_gbp resolved_cogs_gbp,a.historical_service_treatment_evidence_id::text provenance_id
  from public.vault_historical_vaultcare_service_treatment_line_attributions a
  where a.evidence_method='HISTORICAL_OWNER_ATTESTED_NO_DIRECT_COGS_AT_SALE'
), candidates as (
  select * from direct union all
  select p.* from policy p where not exists (select 1 from direct d where d.order_line_id=p.order_line_id)
  union all
  select s.* from service s where not exists (select 1 from direct d where d.order_line_id=s.order_line_id)
    and not exists (select 1 from policy p where p.order_line_id=s.order_line_id)
), counted as (select c.*,count(*) over (partition by order_line_id) candidate_count from candidates c)
select order_line_id,order_id,evidence_method,cogs_classification,resolved_cogs_gbp,provenance_id
from counted where candidate_count=1;

create view public.vault_shopify_order_operational_contribution_diagnostics
with (security_barrier = true, security_invoker = true) as
select b.order_id,b.shopify_order_id,b.shopify_created_at,b.order_source_updated_at,b.financial_row_count,b.financial_currency,b.canonical_net_revenue,
  b.net_sold_line_count,b.trusted_net_sold_line_count,b.trusted_net_sold_line_cogs_gbp,b.shipping_row_count,b.shipping_source_state,b.shipping_currency,
  b.shipping_accounting_status,b.shipping_label_count,b.observed_purchased_label_cost_gbp,b.payment_coverage_row_count,b.payment_coverage_state,b.covered_fee_row_count,
  b.valid_covered_fee_row_count,b.covered_payment_fees_gbp,r.resolved_sold_line_cogs_gbp,r.resolved_sold_line_count,
  case when r.resolved_sold_line_count=b.net_sold_line_count then array_remove(b.exclusion_reason_codes,'missing_or_untrusted_sold_line_cogs')
       else b.exclusion_reason_codes end exclusion_reason_codes
from public.vault_shopify_order_operational_contribution_diagnostics_base b
left join lateral (select count(*) resolved_sold_line_count,sum(x.resolved_cogs_gbp) resolved_sold_line_cogs_gbp
  from public.vault_stage1_sold_line_cogs_resolutions x where x.order_id=b.order_id) r on true;

create or replace view public.vault_shopify_verified_order_operational_contributions
with (security_barrier = true, security_invoker = true) as
select order_id,shopify_order_id,shopify_created_at,order_source_updated_at,canonical_net_revenue,
  resolved_sold_line_cogs_gbp as trusted_net_sold_line_cogs_gbp,observed_purchased_label_cost_gbp,covered_payment_fees_gbp,
  canonical_net_revenue-resolved_sold_line_cogs_gbp-observed_purchased_label_cost_gbp-covered_payment_fees_gbp estimated_operational_contribution_gbp,
  'current_customer_order_total'::text revenue_basis,'included_unseparated'::text tax_treatment,'unobserved'::text duties_and_additional_fees_treatment,
  'observed_unreconciled'::text shipping_label_status,'estimated_operational_contribution'::text classification
from public.vault_shopify_order_operational_contribution_diagnostics
where cardinality(exclusion_reason_codes)=0;

revoke all on public.vault_stage1_sold_line_cogs_resolutions,public.vault_shopify_order_operational_contribution_diagnostics from public,anon,authenticated;
grant select on public.vault_stage1_sold_line_cogs_resolutions,public.vault_shopify_order_operational_contribution_diagnostics to service_role;
notify pgrst,'reload schema';
commit;
