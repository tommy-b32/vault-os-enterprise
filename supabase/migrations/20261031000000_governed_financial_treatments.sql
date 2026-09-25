-- Explicit financial treatment is independent from inventory strategy and product cost.
-- It is forward-only: treatments are effective from their recorded time and are never
-- used to rewrite prior sold-line evidence.
begin;

create table public.vault_product_financial_treatment_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.vault_products(id) on delete restrict,
  effective_from timestamptz not null,
  treatment text not null check (treatment in (
    'merchandise_cogs_required',
    'no_direct_cogs_at_sale',
    'governed_service_cost_required'
  )),
  provenance text not null check (length(trim(provenance)) > 0),
  created_at timestamptz not null default clock_timestamp(),
  unique (product_id, effective_from)
);

comment on table public.vault_product_financial_treatment_versions is
  'Immutable, explicit product financial-treatment versions. This is independent of inventory strategy and never represents a merchandise product cost.';

alter table public.vault_product_financial_treatment_versions enable row level security;
revoke all on public.vault_product_financial_treatment_versions from public, anon, authenticated, service_role;
grant select on public.vault_product_financial_treatment_versions to service_role;

create function public.reject_product_financial_treatment_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Product financial treatment versions are immutable';
end;
$$;

create trigger product_financial_treatment_versions_immutable
before update or delete on public.vault_product_financial_treatment_versions
for each row execute function public.reject_product_financial_treatment_mutation();

create function public.append_product_financial_treatment(
  target_product uuid,
  target_treatment text,
  target_effective_from timestamptz,
  target_provenance text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  treatment_id uuid;
begin
  if target_treatment not in ('merchandise_cogs_required', 'no_direct_cogs_at_sale', 'governed_service_cost_required') then
    raise exception 'Invalid financial treatment';
  end if;
  if target_effective_from < transaction_timestamp() then
    raise exception 'Financial treatments cannot be backdated';
  end if;
  if nullif(trim(target_provenance), '') is null then
    raise exception 'Financial treatment provenance is required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_product::text, 911));
  insert into public.vault_product_financial_treatment_versions(product_id, effective_from, treatment, provenance)
  values (target_product, target_effective_from, target_treatment, target_provenance)
  returning id into treatment_id;
  return treatment_id;
end;
$$;

revoke all on function public.reject_product_financial_treatment_mutation(),
  public.append_product_financial_treatment(uuid,text,timestamptz,text)
from public, anon, authenticated;
grant execute on function public.append_product_financial_treatment(uuid,text,timestamptz,text) to service_role;

alter table public.vault_shopify_order_lines
  add column financial_treatment_history_id uuid references public.vault_product_financial_treatment_versions(id) on delete restrict,
  add column financial_treatment text,
  add column financial_treatment_status text not null default 'not_applicable',
  add column financial_treatment_snapshotted_at timestamptz,
  add column sale_time_direct_cogs_gbp numeric(14,2),
  add constraint vault_shopify_order_lines_financial_treatment_check check (
    (financial_treatment_status = 'not_applicable'
      and financial_treatment_history_id is null and financial_treatment is null
      and financial_treatment_snapshotted_at is null and sale_time_direct_cogs_gbp is null)
    or (financial_treatment_status = 'trusted_no_direct_cogs_at_sale'
      and financial_treatment_history_id is not null and financial_treatment = 'no_direct_cogs_at_sale'
      and financial_treatment_snapshotted_at is not null and sale_time_direct_cogs_gbp = 0)
    or (financial_treatment_status = 'governed_merchandise_cogs_required'
      and financial_treatment_history_id is not null and financial_treatment = 'merchandise_cogs_required'
      and financial_treatment_snapshotted_at is not null and sale_time_direct_cogs_gbp is null)
    or (financial_treatment_status = 'governed_service_cost_required'
      and financial_treatment_history_id is not null and financial_treatment = 'governed_service_cost_required'
      and financial_treatment_snapshotted_at is not null and sale_time_direct_cogs_gbp is null)
  );

create function public.snapshot_shopify_order_line_financial_treatment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  canonical_product uuid;
  sold_at timestamptz;
  version public.vault_product_financial_treatment_versions%rowtype;
begin
  if tg_op = 'UPDATE' and old.financial_treatment_status <> 'not_applicable' then
    new.financial_treatment_history_id := old.financial_treatment_history_id;
    new.financial_treatment := old.financial_treatment;
    new.financial_treatment_status := old.financial_treatment_status;
    new.financial_treatment_snapshotted_at := old.financial_treatment_snapshotted_at;
    new.sale_time_direct_cogs_gbp := old.sale_time_direct_cogs_gbp;
    return new;
  end if;
  new.financial_treatment_history_id := null;
  new.financial_treatment := null;
  new.financial_treatment_status := 'not_applicable';
  new.financial_treatment_snapshotted_at := null;
  new.sale_time_direct_cogs_gbp := null;
  select variant.product_id into canonical_product
  from public.vault_variants variant
  join public.vault_products product on product.id = variant.product_id
  where variant.source = 'shopify' and product.source = 'shopify'
    and variant.source_variant_id = new.shopify_variant_id
    and (new.shopify_product_id is null or product.source_product_id = new.shopify_product_id);
  if canonical_product is null then return new; end if;
  select shopify_created_at into sold_at from public.vault_shopify_orders where id = new.order_id;
  select * into version from public.vault_product_financial_treatment_versions
  where product_id = canonical_product and effective_from <= sold_at
  order by effective_from desc limit 1;
  if version.id is null then return new; end if;
  new.financial_treatment_history_id := version.id;
  new.financial_treatment := version.treatment;
  new.financial_treatment_snapshotted_at := clock_timestamp();
  if version.treatment = 'no_direct_cogs_at_sale' then
    new.financial_treatment_status := 'trusted_no_direct_cogs_at_sale';
    new.sale_time_direct_cogs_gbp := 0;
  elsif version.treatment = 'merchandise_cogs_required' then
    new.financial_treatment_status := 'governed_merchandise_cogs_required';
  else
    new.financial_treatment_status := 'governed_service_cost_required';
  end if;
  return new;
end;
$$;

create trigger shopify_order_line_financial_treatment
before insert or update on public.vault_shopify_order_lines
for each row execute function public.snapshot_shopify_order_line_financial_treatment();

revoke all on function public.snapshot_shopify_order_line_financial_treatment()
from public, anon, authenticated, service_role;

-- VaultCare is intentionally prospective. The deployment timestamp is its effective
-- boundary; no earlier sold line is reinterpreted by this migration.
do $$ declare vaultcare_product uuid; begin
  select id into vaultcare_product from public.vault_products
  where source = 'shopify' and source_product_id = 'gid://shopify/Product/16145627939194';
  if vaultcare_product is null then
    raise exception 'VaultCare canonical product is required for approved prospective treatment';
  end if;
  perform public.append_product_financial_treatment(
    vaultcare_product,
    'no_direct_cogs_at_sale',
    clock_timestamp(),
    'approved_vaultcare_no_direct_cogs_at_sale_prospective'
  );
end $$;

create or replace view public.vault_shopify_order_operational_contribution_diagnostics
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
    count(*) filter (where l.cogs_quantity > 0 and (
      (l.cogs_status = 'trusted' and l.cogs_history_id is not null and l.cogs_snapshotted_at is not null
        and l.unit_cogs_gbp is not null and l.unit_cogs_gbp >= 0 and l.total_cogs_gbp is not null and l.total_cogs_gbp >= 0)
      or (l.financial_treatment_status = 'trusted_no_direct_cogs_at_sale'
        and l.financial_treatment_history_id is not null and l.financial_treatment = 'no_direct_cogs_at_sale'
        and l.financial_treatment_snapshotted_at is not null and l.sale_time_direct_cogs_gbp = 0)
    )) trusted_net_sold_line_count,
    sum(case when l.financial_treatment_status = 'trusted_no_direct_cogs_at_sale' then l.sale_time_direct_cogs_gbp
      when l.cogs_status = 'trusted' then l.total_cogs_gbp end) filter (where l.cogs_quantity > 0 and (
      (l.cogs_status = 'trusted' and l.cogs_history_id is not null and l.cogs_snapshotted_at is not null
        and l.unit_cogs_gbp is not null and l.unit_cogs_gbp >= 0 and l.total_cogs_gbp is not null and l.total_cogs_gbp >= 0)
      or (l.financial_treatment_status = 'trusted_no_direct_cogs_at_sale'
        and l.financial_treatment_history_id is not null and l.financial_treatment = 'no_direct_cogs_at_sale'
        and l.financial_treatment_snapshotted_at is not null and l.sale_time_direct_cogs_gbp = 0)
    )) trusted_net_sold_line_cogs_gbp
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

create or replace view public.vault_shopify_verified_order_operational_contributions
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

create view public.vault_shopify_financial_treatment_reconciliation_dry_run
with (security_barrier = true, security_invoker = true) as
select o.order_number, o.shopify_created_at as sale_timestamp, l.id as order_line_id,
  l.cogs_status as existing_cogs_status, l.financial_treatment_status,
  l.financial_treatment, l.financial_treatment_history_id,
  (l.financial_treatment_status = 'trusted_no_direct_cogs_at_sale') as approved_treatment_effective_at_sale,
  case when l.financial_treatment_status = 'trusted_no_direct_cogs_at_sale' then 'none'
    else 'explicit authorized historical treatment reconciliation required' end as controlled_reconciliation_required,
  array_remove(d.exclusion_reason_codes, 'missing_or_untrusted_sold_line_cogs') as other_stage_1_blockers,
  cardinality(array_remove(d.exclusion_reason_codes, 'missing_or_untrusted_sold_line_cogs')) = 0
    and l.financial_treatment_status = 'trusted_no_direct_cogs_at_sale' as would_be_eligible_without_other_change
from public.vault_shopify_order_lines l
join public.vault_shopify_orders o on o.id = l.order_id
join public.vault_variants v on v.source = 'shopify' and v.source_variant_id = l.shopify_variant_id
left join public.vault_shopify_order_operational_contribution_diagnostics d on d.order_id = o.id
where l.cogs_quantity > 0 and exists (
  select 1 from public.vault_product_financial_treatment_versions t
  where t.product_id = v.product_id and t.treatment = 'no_direct_cogs_at_sale'
);

revoke all on public.vault_shopify_financial_treatment_reconciliation_dry_run from public, anon, authenticated;
grant select on public.vault_shopify_financial_treatment_reconciliation_dry_run to service_role;

notify pgrst, 'reload schema';
commit;
