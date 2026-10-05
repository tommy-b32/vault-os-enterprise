-- Reconciled refresh path for the derived governed Product Performance read
-- model. The allocation view remains the sole financial authority.

create or replace function public.refresh_vault_shopify_verified_product_profitability_read_model()
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
set timezone = 'UTC'
as $$
declare
  v_generation bigint;
  v_refreshed_at timestamptz;
  v_watermark jsonb;
  v_source record;
  v_candidate record;
  v_promoted record;
  v_error text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      'vault_shopify_verified_product_profitability_read_model_refresh',
      0
    )
  );

  select refresh_generation + 1
    into v_generation
  from public.vault_shopify_verified_product_profitability_read_model_state
  where singleton
  for update;

  if v_generation is null then
    raise exception
      'Product profitability read-model singleton state is missing';
  end if;

  update public.vault_shopify_verified_product_profitability_read_model_state
  set state = 'refreshing',
      refresh_started_at = clock_timestamp(),
      refresh_completed_at = null,
      last_error = null,
      updated_at = clock_timestamp()
  where singleton;

  begin
    v_refreshed_at := clock_timestamp();

    create temporary table _profitability_source_snapshot
    on commit drop
    as
    select
      allocation.order_line_id,
      allocation.order_id,
      allocation.product_id,
      allocation.product_name,
      allocation.shopify_created_at,
      allocation.eligible_units,
      allocation.allocated_total_revenue_gbp,
      allocation.resolved_cogs_gbp,
      allocation.allocated_shipping_cost_gbp,
      allocation.allocated_payment_fees_gbp,
      allocation.operational_contribution_gbp,
      allocation.evidence_method,
      allocation.cogs_classification,
      allocation.provenance_id
    from public.vault_shopify_verified_product_profitability_line_allocations allocation
    where allocation.shopify_created_at >=
      timestamptz '2026-05-04T00:00:00+01:00';

    if exists (
      select 1
      from _profitability_source_snapshot source
      where source.order_line_id is null
         or source.order_id is null
         or source.product_id is null
         or source.product_name is null
         or source.shopify_created_at is null
         or source.eligible_units is null
         or source.allocated_total_revenue_gbp is null
         or source.resolved_cogs_gbp is null
         or source.allocated_shipping_cost_gbp is null
         or source.allocated_payment_fees_gbp is null
         or source.operational_contribution_gbp is null
         or source.evidence_method is null
         or source.cogs_classification is null
         or source.provenance_id is null
    ) then
      raise exception
        'Authoritative profitability allocation contains a required NULL field';
    end if;

    select
      count(*)::bigint as row_count,
      sum(source.eligible_units) as eligible_units,
      sum(source.allocated_total_revenue_gbp)
        as allocated_total_revenue_gbp,
      sum(source.resolved_cogs_gbp)
        as resolved_cogs_gbp,
      sum(source.allocated_shipping_cost_gbp)
        as allocated_shipping_cost_gbp,
      sum(source.allocated_payment_fees_gbp)
        as allocated_payment_fees_gbp,
      sum(source.operational_contribution_gbp)
        as operational_contribution_gbp,
      max(source.shopify_created_at)
        as max_shopify_created_at,
      md5(
        string_agg(
          jsonb_build_array(
            source.order_line_id,
            source.order_id,
            source.product_id,
            source.product_name,
            to_char(
              source.shopify_created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ),
            source.eligible_units,
            source.allocated_total_revenue_gbp,
            source.resolved_cogs_gbp,
            source.allocated_shipping_cost_gbp,
            source.allocated_payment_fees_gbp,
            source.operational_contribution_gbp,
            source.evidence_method,
            source.cogs_classification,
            source.provenance_id
          )::text,
          E'\n'
          order by source.order_line_id
        )
      ) as allocation_fingerprint
    into v_source
    from _profitability_source_snapshot source;

    -- An empty authoritative snapshot is not a valid zero-business state for
    -- this governed projection. It indicates missing/unavailable upstream
    -- financial evidence and therefore fails closed.
    if v_source.row_count = 0 then
      raise exception
        'Authoritative profitability allocation returned no governed rows';
    end if;

    v_watermark := jsonb_build_object(
      'authoritative_source',
      'public.vault_shopify_verified_product_profitability_line_allocations',
      'analytics_start',
      '2026-05-04T00:00:00+01:00',
      'row_count',
      v_source.row_count,
      'max_shopify_created_at',
      v_source.max_shopify_created_at,
      'allocation_fingerprint_md5',
      v_source.allocation_fingerprint
    );

    create temporary table _profitability_candidate
    on commit drop
    as
    select
      source.order_line_id,
      source.order_id,
      source.product_id,
      source.product_name,
      source.shopify_created_at,
      source.eligible_units,
      source.allocated_total_revenue_gbp,
      source.resolved_cogs_gbp,
      source.allocated_shipping_cost_gbp,
      source.allocated_payment_fees_gbp,
      source.operational_contribution_gbp,
      source.evidence_method,
      source.cogs_classification,
      source.provenance_id,
      v_watermark as source_evidence_watermark,
      v_generation as refresh_generation,
      v_refreshed_at as refreshed_at
    from _profitability_source_snapshot source;

    select
      count(*)::bigint as row_count,
      sum(candidate.eligible_units) as eligible_units,
      sum(candidate.allocated_total_revenue_gbp)
        as allocated_total_revenue_gbp,
      sum(candidate.resolved_cogs_gbp)
        as resolved_cogs_gbp,
      sum(candidate.allocated_shipping_cost_gbp)
        as allocated_shipping_cost_gbp,
      sum(candidate.allocated_payment_fees_gbp)
        as allocated_payment_fees_gbp,
      sum(candidate.operational_contribution_gbp)
        as operational_contribution_gbp
    into v_candidate
    from _profitability_candidate candidate;

    if v_source.row_count
         is distinct from v_candidate.row_count
       or v_source.eligible_units
         is distinct from v_candidate.eligible_units
       or v_source.allocated_total_revenue_gbp
         is distinct from v_candidate.allocated_total_revenue_gbp
       or v_source.resolved_cogs_gbp
         is distinct from v_candidate.resolved_cogs_gbp
       or v_source.allocated_shipping_cost_gbp
         is distinct from v_candidate.allocated_shipping_cost_gbp
       or v_source.allocated_payment_fees_gbp
         is distinct from v_candidate.allocated_payment_fees_gbp
       or v_source.operational_contribution_gbp
         is distinct from v_candidate.operational_contribution_gbp
    then
      raise exception
        'Product profitability candidate reconciliation failed';
    end if;

    delete from
      public.vault_shopify_verified_product_profitability_read_model;

    insert into
      public.vault_shopify_verified_product_profitability_read_model (
        order_line_id,
        order_id,
        product_id,
        product_name,
        shopify_created_at,
        eligible_units,
        allocated_total_revenue_gbp,
        resolved_cogs_gbp,
        allocated_shipping_cost_gbp,
        allocated_payment_fees_gbp,
        operational_contribution_gbp,
        evidence_method,
        cogs_classification,
        provenance_id,
        source_evidence_watermark,
        refresh_generation,
        refreshed_at
      )
    select
      candidate.order_line_id,
      candidate.order_id,
      candidate.product_id,
      candidate.product_name,
      candidate.shopify_created_at,
      candidate.eligible_units,
      candidate.allocated_total_revenue_gbp,
      candidate.resolved_cogs_gbp,
      candidate.allocated_shipping_cost_gbp,
      candidate.allocated_payment_fees_gbp,
      candidate.operational_contribution_gbp,
      candidate.evidence_method,
      candidate.cogs_classification,
      candidate.provenance_id,
      candidate.source_evidence_watermark,
      candidate.refresh_generation,
      candidate.refreshed_at
    from _profitability_candidate candidate;

    -- Reconcile the persisted generation as well as the temporary candidate.
    -- The state cannot become valid unless the rows actually promoted to the
    -- read model remain exactly equal to the authoritative source snapshot.
    select
      count(*)::bigint as row_count,
      sum(promoted.eligible_units) as eligible_units,
      sum(promoted.allocated_total_revenue_gbp)
        as allocated_total_revenue_gbp,
      sum(promoted.resolved_cogs_gbp)
        as resolved_cogs_gbp,
      sum(promoted.allocated_shipping_cost_gbp)
        as allocated_shipping_cost_gbp,
      sum(promoted.allocated_payment_fees_gbp)
        as allocated_payment_fees_gbp,
      sum(promoted.operational_contribution_gbp)
        as operational_contribution_gbp
    into v_promoted
    from public.vault_shopify_verified_product_profitability_read_model promoted
    where promoted.refresh_generation = v_generation;

    if v_source.row_count
         is distinct from v_promoted.row_count
       or v_source.eligible_units
         is distinct from v_promoted.eligible_units
       or v_source.allocated_total_revenue_gbp
         is distinct from v_promoted.allocated_total_revenue_gbp
       or v_source.resolved_cogs_gbp
         is distinct from v_promoted.resolved_cogs_gbp
       or v_source.allocated_shipping_cost_gbp
         is distinct from v_promoted.allocated_shipping_cost_gbp
       or v_source.allocated_payment_fees_gbp
         is distinct from v_promoted.allocated_payment_fees_gbp
       or v_source.operational_contribution_gbp
         is distinct from v_promoted.operational_contribution_gbp
    then
      raise exception
        'Product profitability promoted-generation reconciliation failed';
    end if;

    update public.vault_shopify_verified_product_profitability_read_model_state
    set state = 'valid',
        source_evidence_watermark = v_watermark,
        refresh_generation = v_generation,
        refresh_completed_at = clock_timestamp(),
        last_error = null,
        updated_at = clock_timestamp()
    where singleton;

    return jsonb_build_object(
      'state',
      'valid',
      'refresh_generation',
      v_generation,
      'source_evidence_watermark',
      v_watermark,
      'rows',
      v_source.row_count
    );

  exception
    when query_canceled then
      get stacked diagnostics v_error = message_text;

      update public.vault_shopify_verified_product_profitability_read_model_state
      set state = 'failed',
          refresh_completed_at = clock_timestamp(),
          last_error = v_error,
          updated_at = clock_timestamp()
      where singleton;

      return jsonb_build_object(
        'state',
        'failed',
        'error',
        v_error
      );

    when others then
      get stacked diagnostics v_error = message_text;

      update public.vault_shopify_verified_product_profitability_read_model_state
      set state = 'failed',
          refresh_completed_at = clock_timestamp(),
          last_error = v_error,
          updated_at = clock_timestamp()
      where singleton;

      return jsonb_build_object(
        'state',
        'failed',
        'error',
        v_error
      );
  end;
end;
$$;

comment on function public.refresh_vault_shopify_verified_product_profitability_read_model() is
  'Builds and reconciles a new governed Product Performance read-model generation from public.vault_shopify_verified_product_profitability_line_allocations. Promotion is transactional; failure preserves existing rows and records failed state.';

revoke all
  on function public.refresh_vault_shopify_verified_product_profitability_read_model()
  from public, anon, authenticated;

grant execute
  on function public.refresh_vault_shopify_verified_product_profitability_read_model()
  to service_role;

notify pgrst, 'reload schema';