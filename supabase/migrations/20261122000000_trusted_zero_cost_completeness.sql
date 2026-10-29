-- A fully snapshotted no-direct-COGS treatment is cost-complete at exactly GBP 0,
-- but it remains distinct from Stage 1 COGS. Keep Stage 1 authoritative whenever
-- it exists for a line, and preserve the diagnostic view's public contract.
begin;

create or replace view public.vault_shopify_order_operational_contribution_diagnostics
with (security_barrier = true, security_invoker = true) as
select
  b.order_id,
  b.shopify_order_id,
  b.shopify_created_at,
  b.order_source_updated_at,
  b.financial_row_count,
  b.financial_currency,
  b.canonical_net_revenue,
  b.net_sold_line_count,
  b.trusted_net_sold_line_count,
  b.trusted_net_sold_line_cogs_gbp,
  b.shipping_row_count,
  b.shipping_source_state,
  b.shipping_currency,
  b.shipping_accounting_status,
  b.shipping_label_count,
  b.observed_purchased_label_cost_gbp,
  b.payment_coverage_row_count,
  b.payment_coverage_state,
  b.covered_fee_row_count,
  b.valid_covered_fee_row_count,
  b.covered_payment_fees_gbp,
  coalesce(stage1.resolved_sold_line_cogs_gbp, 0)
    + coalesce(trusted_zero.resolved_sold_line_cogs_gbp, 0) as resolved_sold_line_cogs_gbp,
  coalesce(stage1.resolved_sold_line_count, 0)
    + coalesce(trusted_zero.resolved_sold_line_count, 0) as resolved_sold_line_count,
  case
    when coalesce(stage1.resolved_sold_line_count, 0)
       + coalesce(trusted_zero.resolved_sold_line_count, 0) = b.net_sold_line_count
      then array_remove(b.exclusion_reason_codes, 'missing_or_untrusted_sold_line_cogs')
    else b.exclusion_reason_codes
  end as exclusion_reason_codes
from public.vault_shopify_order_operational_contribution_diagnostics_base b
left join lateral (
  select
    count(*) as resolved_sold_line_count,
    sum(resolution.resolved_cogs_gbp) as resolved_sold_line_cogs_gbp
  from public.vault_stage1_sold_line_cogs_resolutions resolution
  where resolution.order_id = b.order_id
) stage1 on true
left join lateral (
  select
    count(*) as resolved_sold_line_count,
    sum(line.sale_time_direct_cogs_gbp) as resolved_sold_line_cogs_gbp
  from public.vault_shopify_order_lines line
  where line.order_id = b.order_id
    and line.cogs_quantity > 0
    and line.financial_treatment = 'no_direct_cogs_at_sale'
    and line.financial_treatment_status = 'trusted_no_direct_cogs_at_sale'
    and line.financial_treatment_history_id is not null
    and line.financial_treatment_snapshotted_at is not null
    and line.sale_time_direct_cogs_gbp = 0
    and not exists (
      select 1
      from public.vault_stage1_sold_line_cogs_resolutions resolution
      where resolution.order_line_id = line.id
    )
) trusted_zero on true;

revoke all on public.vault_shopify_order_operational_contribution_diagnostics
  from public, anon, authenticated;
grant select on public.vault_shopify_order_operational_contribution_diagnostics to service_role;

notify pgrst, 'reload schema';
commit;
