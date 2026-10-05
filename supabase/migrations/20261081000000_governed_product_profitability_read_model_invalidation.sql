-- Source mutations invalidate the derived governed Product Performance read model.
-- The trigger takes the refresh function's transaction-scoped advisory lock before
-- marking state stale. This serializes source commits with refresh promotion:
-- a mutation that happens during a refresh marks stale after that refresh commits.
--
-- IMPORTANT:
-- This function must retain the same advisory-lock key used by
-- public.refresh_vault_shopify_verified_product_profitability_read_model().
-- Changing that lock key in either function must be coordinated so refresh
-- promotion and source invalidation remain serialized.

create function public.mark_vault_shopify_verified_product_profitability_read_model_stale()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      'vault_shopify_verified_product_profitability_read_model_refresh',
      0
    )
  );

  update public.vault_shopify_verified_product_profitability_read_model_state
  set state = 'stale',
      updated_at = clock_timestamp()
  where singleton;

  if not found then
    raise exception
      'Product profitability read-model singleton state is missing';
  end if;

  return null;
end;
$$;

comment on function
  public.mark_vault_shopify_verified_product_profitability_read_model_stale()
is
  'Internal statement-level invalidation trigger for governed Product Performance. It must use the same transaction-scoped advisory-lock key as public.refresh_vault_shopify_verified_product_profitability_read_model() so source mutations and refresh promotion remain serialized.';

revoke all on function
  public.mark_vault_shopify_verified_product_profitability_read_model_stale()
  from public, anon, authenticated, service_role;

create trigger vault_shopify_verified_product_profitability_read_model_invalidate
after insert or update or delete on public.vault_shopify_orders
for each statement
execute function public.mark_vault_shopify_verified_product_profitability_read_model_stale();

create trigger vault_shopify_verified_product_profitability_read_model_invalidate
after insert or update or delete on public.vault_shopify_order_lines
for each statement
execute function public.mark_vault_shopify_verified_product_profitability_read_model_stale();

create trigger vault_shopify_verified_product_profitability_read_model_invalidate
after insert or update or delete on public.vault_variants
for each statement
execute function public.mark_vault_shopify_verified_product_profitability_read_model_stale();

create trigger vault_shopify_verified_product_profitability_read_model_invalidate
after insert or update or delete on public.vault_products
for each statement
execute function public.mark_vault_shopify_verified_product_profitability_read_model_stale();

create trigger vault_shopify_verified_product_profitability_read_model_invalidate
after insert or update or delete on public.vault_shopify_shipping_costs
for each statement
execute function public.mark_vault_shopify_verified_product_profitability_read_model_stale();

create trigger vault_shopify_verified_product_profitability_read_model_invalidate
after insert or update or delete on public.vault_shopify_payment_fee_coverage
for each statement
execute function public.mark_vault_shopify_verified_product_profitability_read_model_stale();

create trigger vault_shopify_verified_product_profitability_read_model_invalidate
after insert or update or delete on public.vault_shopify_payment_fee_records
for each statement
execute function public.mark_vault_shopify_verified_product_profitability_read_model_stale();

create trigger vault_shopify_verified_product_profitability_read_model_invalidate
after insert or update or delete on public.vault_shopify_financial_capture_completeness_observations
for each statement
execute function public.mark_vault_shopify_verified_product_profitability_read_model_stale();

create trigger vault_shopify_verified_product_profitability_read_model_invalidate
after insert or update or delete on public.vault_shopify_discount_application_observations
for each statement
execute function public.mark_vault_shopify_verified_product_profitability_read_model_stale();

create trigger vault_shopify_verified_product_profitability_read_model_invalidate
after insert or update or delete on public.vault_shopify_line_discount_allocation_observations
for each statement
execute function public.mark_vault_shopify_verified_product_profitability_read_model_stale();

create trigger vault_shopify_verified_product_profitability_read_model_invalidate
after insert or update or delete on public.vault_shopify_line_zero_discount_allocation_observations
for each statement
execute function public.mark_vault_shopify_verified_product_profitability_read_model_stale();

create trigger vault_shopify_verified_product_profitability_read_model_invalidate
after insert or update or delete on public.vault_shopify_refund_observations
for each statement
execute function public.mark_vault_shopify_verified_product_profitability_read_model_stale();

create trigger vault_shopify_verified_product_profitability_read_model_invalidate
after insert or update or delete on public.vault_shopify_refund_line_observations
for each statement
execute function public.mark_vault_shopify_verified_product_profitability_read_model_stale();

create trigger vault_shopify_verified_product_profitability_read_model_invalidate
after insert or update or delete on public.vault_shopify_refund_transaction_observations
for each statement
execute function public.mark_vault_shopify_verified_product_profitability_read_model_stale();

create trigger vault_shopify_verified_product_profitability_read_model_invalidate
after insert or update or delete on public.vault_historical_cogs_policy_versions
for each statement
execute function public.mark_vault_shopify_verified_product_profitability_read_model_stale();

create trigger vault_shopify_verified_product_profitability_read_model_invalidate
after insert or update or delete on public.vault_historical_cogs_policies
for each statement
execute function public.mark_vault_shopify_verified_product_profitability_read_model_stale();

create trigger vault_shopify_verified_product_profitability_read_model_invalidate
after insert or update or delete on public.vault_historical_merchandise_class_memberships
for each statement
execute function public.mark_vault_shopify_verified_product_profitability_read_model_stale();

create trigger vault_shopify_verified_product_profitability_read_model_invalidate
after insert or update or delete on public.vault_historical_cogs_policy_batch_evidence
for each statement
execute function public.mark_vault_shopify_verified_product_profitability_read_model_stale();

create trigger vault_shopify_verified_product_profitability_read_model_invalidate
after insert or update or delete on public.vault_historical_supplier_batch_evidence
for each statement
execute function public.mark_vault_shopify_verified_product_profitability_read_model_stale();

create trigger vault_shopify_verified_product_profitability_read_model_invalidate
after insert or update or delete on public.vault_historical_service_treatment_evidence
for each statement
execute function public.mark_vault_shopify_verified_product_profitability_read_model_stale();

notify pgrst, 'reload schema';