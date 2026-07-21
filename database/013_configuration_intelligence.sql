-- ============================================================
-- VAULT OS
-- Sprint 018: Configuration Intelligence
-- ============================================================

create or replace view public.vault_configuration_intelligence as

with product_configuration as (

  select
    pm.product_id,
    pm.product_name,
    pm.handle,
    pm.vendor,
    pm.product_type,
    pm.status as shopify_status,

    pm.supplier_id,
    pm.supplier_company,

    coalesce(
      pm.inventory_strategy,
      'stocked'
    ) as inventory_strategy,

    coalesce(
      pm.restock_enabled,
      true
    ) as restock_enabled,

    pm.pack_profile,
    pm.supplier_moq_packs,
    pm.target_stock_days,
    pm.decision_reason,
    pm.notes,
    pm.settings_updated_at,

    /*
     * Supplier requirement
     *
     * Required for stocked and dropship products.
     * Optional for do-not-restock, discontinued and service.
     */
    case
      when coalesce(pm.inventory_strategy, 'stocked')
        in ('do_not_restock', 'discontinued', 'service')
        then true
      else pm.supplier_id is not null
    end as supplier_complete,

    /*
     * Inventory strategy is always required.
     */
    case
      when coalesce(pm.inventory_strategy, '') in (
        'stocked',
        'do_not_restock',
        'discontinued',
        'dropship',
        'service'
      )
        then true
      else false
    end as strategy_complete,

    /*
     * Pack profile is required only for stocked products.
     */
    case
      when coalesce(pm.inventory_strategy, 'stocked') <> 'stocked'
        then true
      else pm.pack_profile is not null
    end as pack_profile_complete,

    /*
     * MOQ is required only for stocked products that can be restocked.
     */
    case
      when coalesce(pm.inventory_strategy, 'stocked') <> 'stocked'
        then true
      when coalesce(pm.restock_enabled, true) = false
        then true
      else (
        pm.supplier_moq_packs is not null
        and pm.supplier_moq_packs >= 0
      )
    end as moq_complete,

    /*
     * Target stock days are required only for stocked products
     * that can be restocked.
     */
    case
      when coalesce(pm.inventory_strategy, 'stocked') <> 'stocked'
        then true
      when coalesce(pm.restock_enabled, true) = false
        then true
      else (
        pm.target_stock_days is not null
        and pm.target_stock_days > 0
      )
    end as target_days_complete

  from public.vault_product_master pm
),

scored_configuration as (

  select
    *,

    (
      case when supplier_complete then 20 else 0 end
      +
      case when strategy_complete then 20 else 0 end
      +
      case when pack_profile_complete then 20 else 0 end
      +
      case when moq_complete then 20 else 0 end
      +
      case when target_days_complete then 20 else 0 end
    )::integer as configuration_score,

    array_remove(
      array[
        case
          when not supplier_complete
            then 'supplier'
        end,

        case
          when not strategy_complete
            then 'inventory_strategy'
        end,

        case
          when not pack_profile_complete
            then 'pack_profile'
        end,

        case
          when not moq_complete
            then 'supplier_moq'
        end,

        case
          when not target_days_complete
            then 'target_stock_days'
        end
      ],
      null
    ) as missing_requirements

  from product_configuration
)

select
  product_id,
  product_name,
  handle,
  vendor,
  product_type,
  shopify_status,

  supplier_id,
  supplier_company,

  inventory_strategy,
  restock_enabled,
  pack_profile,
  supplier_moq_packs,
  target_stock_days,
  decision_reason,
  notes,
  settings_updated_at,

  supplier_complete,
  strategy_complete,
  pack_profile_complete,
  moq_complete,
  target_days_complete,

  configuration_score,
  missing_requirements,

  cardinality(missing_requirements)
    as missing_requirement_count,

  case
    when inventory_strategy = 'dropship'
      and configuration_score = 100
      then 'dropship_ready'

    when inventory_strategy = 'do_not_restock'
      then 'do_not_restock'

    when inventory_strategy = 'discontinued'
      then 'discontinued'

    when inventory_strategy = 'service'
      then 'service'

    when configuration_score = 100
      then 'ready'

    when configuration_score = 80
      then 'almost_ready'

    else 'needs_configuration'
  end as configuration_state,

  /*
   * Vault Brain may trust the configuration itself.
   */
  configuration_score = 100
    as configuration_trusted,

  /*
   * Reorder recommendations are permitted only for fully
   * configured, stocked and restock-enabled products.
   */
  (
    configuration_score = 100
    and inventory_strategy = 'stocked'
    and restock_enabled = true
  ) as trusted_for_reorder,

  case
    when configuration_score = 100
      then 'high'

    when configuration_score = 80
      then 'limited'

    else 'untrusted'
  end as brain_confidence

from scored_configuration;


create or replace view public.vault_configuration_summary as

select
  count(*)::integer as total_products,

  count(*) filter (
    where configuration_score = 100
  )::integer as fully_configured_products,

  count(*) filter (
    where configuration_score < 100
  )::integer as products_needing_configuration,

  count(*) filter (
    where configuration_state = 'almost_ready'
  )::integer as almost_ready_products,

  count(*) filter (
    where configuration_state = 'dropship_ready'
  )::integer as dropship_products,

  count(*) filter (
    where configuration_state = 'do_not_restock'
  )::integer as do_not_restock_products,

  count(*) filter (
    where configuration_state = 'discontinued'
  )::integer as discontinued_products,

  count(*) filter (
    where configuration_state = 'service'
  )::integer as service_products,

  count(*) filter (
    where trusted_for_reorder = true
  )::integer as reorder_ready_products,

  coalesce(
    round(avg(configuration_score), 1),
    0
  ) as average_configuration_score,

  case
    when count(*) = 0
      then 0
    else round(
      (
        count(*) filter (
          where configuration_score = 100
        )::numeric
        /
        count(*)::numeric
      ) * 100,
      1
    )
  end as catalogue_completion_percentage

from public.vault_configuration_intelligence;


notify pgrst, 'reload schema';