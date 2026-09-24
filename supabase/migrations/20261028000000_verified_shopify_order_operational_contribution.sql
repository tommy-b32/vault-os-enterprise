-- Read-only operational contribution facts.  This is not accounting profit: tax is
-- included but unseparated, duties/additional fees are unobserved, and purchased
-- label costs remain unreconciled operational observations.
-- Supports the order-key join used by this read model and its bounded reporting pages.
create index if not exists vault_shopify_payment_fee_records_order_id_idx
  on public.vault_shopify_payment_fee_records(order_id);

create view public.vault_shopify_order_operational_contribution_diagnostics
with (security_barrier = true, security_invoker = true) as
select o.id order_id, o.shopify_order_id, o.shopify_created_at, o.shopify_updated_at order_source_updated_at,
  f.financial_row_count, f.financial_currency, f.canonical_net_revenue,
  coalesce(c.net_sold_line_count, 0) net_sold_line_count,
  coalesce(c.trusted_net_sold_line_count, 0) trusted_net_sold_line_count, c.trusted_net_sold_line_cogs_gbp,
  coalesce(s.shipping_row_count, 0) shipping_row_count, s.source_state shipping_source_state,
  s.currency shipping_currency, s.accounting_status shipping_accounting_status, s.label_count shipping_label_count,
  s.label_cost_gbp observed_purchased_label_cost_gbp,
  coalesce(pc.coverage_row_count, 0) payment_coverage_row_count, pc.coverage_state payment_coverage_state,
  coalesce(pf.covered_fee_row_count, 0) covered_fee_row_count,
  coalesce(pf.valid_covered_fee_row_count, 0) valid_covered_fee_row_count,
  pf.covered_payment_fees_gbp,
  array_remove(array[
    case when o.cancelled_at is not null then 'cancelled_order' end,
    case when o.metadata->>'test' is distinct from 'false' then 'test_or_unconfirmed_order' end,
    case when o.currency <> 'GBP' then 'order_currency_mismatch' end,
    case when coalesce(f.financial_row_count, 0) = 0 then 'missing_or_invalid_verified_financial' end,
    case when coalesce(f.financial_row_count, 0) > 1 then 'duplicate_verified_financial' end,
    case when f.financial_row_count = 1 and (f.financial_currency <> 'GBP' or f.canonical_net_revenue is null or f.canonical_net_revenue < 0) then 'verified_financial_currency_or_amount_mismatch' end,
    case when coalesce(c.net_sold_line_count, 0) = 0 then 'no_net_sold_lines' end,
    case when coalesce(c.net_sold_line_count, 0) <> coalesce(c.trusted_net_sold_line_count, 0) then 'missing_or_untrusted_sold_line_cogs' end,
    case when coalesce(s.shipping_row_count, 0) = 0 then 'missing_shipping_label_cost' end,
    case when coalesce(s.shipping_row_count, 0) > 1 then 'duplicate_shipping_label_cost' end,
    case when s.shipping_row_count = 1 and s.shopify_order_id <> o.shopify_order_id then 'shipping_order_identity_mismatch' end,
    case when s.shipping_row_count = 1 and s.source_state <> 'covered' then 'shipping_label_not_covered' end,
    case when s.shipping_row_count = 1 and (s.currency <> 'GBP' or s.accounting_status <> 'unreconciled' or s.label_count is null or s.label_count <= 0 or s.label_cost_gbp is null or s.label_cost_gbp < 0) then 'shipping_currency_or_amount_mismatch' end,
    case when coalesce(pc.coverage_row_count, 0) = 0 then 'missing_payment_fee_coverage' end,
    case when coalesce(pc.coverage_row_count, 0) > 1 then 'duplicate_payment_fee_coverage' end,
    case when pc.coverage_row_count = 1 and pc.shopify_order_id <> o.shopify_order_id then 'payment_coverage_order_identity_mismatch' end,
    case when pc.coverage_row_count = 1 and pc.coverage_state = 'unsupported_gateway' then 'unsupported_payment_gateway' end,
    case when pc.coverage_row_count = 1 and pc.coverage_state is distinct from 'covered' and pc.coverage_state <> 'unsupported_gateway' then 'payment_fee_coverage_incomplete' end,
    case when pc.coverage_row_count = 1 and pc.coverage_state = 'covered' and coalesce(pf.covered_fee_row_count, 0) = 0 then 'missing_covered_payment_fee_records' end,
    case when pc.coverage_row_count = 1 and pc.coverage_state = 'covered' and coalesce(pf.covered_fee_row_count, 0) <> coalesce(pf.valid_covered_fee_row_count, 0) then 'payment_fee_record_mismatch' end
  ], null) exclusion_reason_codes
from public.vault_shopify_orders o
left join lateral (
  select count(f.order_id) financial_row_count, max(f.currency) financial_currency,
    max(f.canonical_net_revenue) canonical_net_revenue
  from public.vault_shopify_verified_order_financials f where f.order_id = o.id
) f on true
left join lateral (
  select count(*) filter (where l.cogs_quantity > 0) net_sold_line_count,
    count(*) filter (where l.cogs_quantity > 0 and l.cogs_status = 'trusted'
      and l.cogs_history_id is not null and l.cogs_snapshotted_at is not null
      and l.unit_cogs_gbp is not null and l.unit_cogs_gbp >= 0 and l.total_cogs_gbp is not null and l.total_cogs_gbp >= 0) trusted_net_sold_line_count,
    sum(l.total_cogs_gbp) filter (where l.cogs_quantity > 0 and l.cogs_status = 'trusted'
      and l.cogs_history_id is not null and l.cogs_snapshotted_at is not null
      and l.unit_cogs_gbp is not null and l.unit_cogs_gbp >= 0 and l.total_cogs_gbp is not null and l.total_cogs_gbp >= 0) trusted_net_sold_line_cogs_gbp
  from public.vault_shopify_order_lines l where l.order_id = o.id
) c on true
left join lateral (
  select count(*) shipping_row_count, max(s.shopify_order_id) shopify_order_id,
    max(s.source_state) source_state, max(s.currency) currency, max(s.accounting_status) accounting_status,
    max(s.label_count) label_count, max(s.label_cost_gbp) label_cost_gbp
  from public.vault_shopify_shipping_costs s where s.order_id = o.id
) s on true
left join lateral (
  select count(*) coverage_row_count, max(pc.shopify_order_id) shopify_order_id, max(pc.coverage_state) coverage_state
  from public.vault_shopify_payment_fee_coverage pc where pc.order_id = o.id
) pc on true
left join lateral (
  select count(*) filter (where r.counts_toward_profit) covered_fee_row_count,
    count(*) filter (where r.counts_toward_profit and r.gateway = 'shopify_payments'
      and r.source_classification = 'shopify_payments' and r.reconciliation_state = 'covered'
      and r.transaction_kind in ('SALE', 'CAPTURE') and r.transaction_status = 'SUCCESS'
      and r.fee_currency = 'GBP' and r.tax_currency = 'GBP' and r.fee_amount >= 0 and r.tax_amount >= 0) valid_covered_fee_row_count,
    sum(r.fee_amount + r.tax_amount) filter (where r.counts_toward_profit and r.gateway = 'shopify_payments'
      and r.source_classification = 'shopify_payments' and r.reconciliation_state = 'covered'
      and r.transaction_kind in ('SALE', 'CAPTURE') and r.transaction_status = 'SUCCESS'
      and r.fee_currency = 'GBP' and r.tax_currency = 'GBP' and r.fee_amount >= 0 and r.tax_amount >= 0) covered_payment_fees_gbp
  from public.vault_shopify_payment_fee_records r where r.order_id = o.id
) pf on true
where o.source = 'shopify';

create view public.vault_shopify_verified_order_operational_contributions
with (security_barrier = true, security_invoker = true) as
select order_id, shopify_order_id, shopify_created_at, order_source_updated_at,
  canonical_net_revenue, trusted_net_sold_line_cogs_gbp, observed_purchased_label_cost_gbp,
  covered_payment_fees_gbp,
  canonical_net_revenue - trusted_net_sold_line_cogs_gbp - observed_purchased_label_cost_gbp - covered_payment_fees_gbp
    as estimated_operational_contribution_gbp,
  'current_customer_order_total'::text revenue_basis,
  'included_unseparated'::text tax_treatment,
  'unobserved'::text duties_and_additional_fees_treatment,
  'observed_unreconciled'::text shipping_label_status,
  'estimated_operational_contribution'::text classification
from public.vault_shopify_order_operational_contribution_diagnostics
where cardinality(exclusion_reason_codes) = 0;

comment on view public.vault_shopify_verified_order_operational_contributions is
  'Evidence-gated estimated operational contribution: verified canonical adjusted order total less immutable net sold-line COGS, observed unreconciled purchased-label cost, and covered Shopify Payments fees including fee tax. Not accounting profit, tax-exclusive margin, or merchant net proceeds.';
comment on view public.vault_shopify_order_operational_contribution_diagnostics is
  'Read-only per-order admission diagnostics. Missing or invalid evidence is excluded, never converted to zero.';
revoke all on public.vault_shopify_verified_order_operational_contributions from public, anon, authenticated;
revoke all on public.vault_shopify_order_operational_contribution_diagnostics from public, anon, authenticated;
grant select on public.vault_shopify_verified_order_operational_contributions to service_role;
grant select on public.vault_shopify_order_operational_contribution_diagnostics to service_role;
notify pgrst, 'reload schema';
