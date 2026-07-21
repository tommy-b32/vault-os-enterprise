-- ============================================================
-- VAULT OS
-- Sprint 020.2
-- Product Commercial Intelligence
-- ============================================================

create or replace view
  public.vault_product_commercial_intelligence
as

with commercial_base as (
  select
    pm.product_id,
    pm.product_name,
    pm.product_type,
    pm.status as shopify_status,

    pm.supplier_id,
    pm.supplier_company,
    pm.inventory_strategy,
    pm.restock_enabled,
    pm.pack_profile,

    pc.currency,

    pc.pack_cost,
    pc.shipping_cost_per_pack,
    pc.import_cost_per_pack,

    /*
     * Use a manual units-per-pack override when one exists.
     * Otherwise infer it from the saved pack profile.
     */
    coalesce(
      pc.units_per_pack,
      case
        when pm.pack_profile = 'tee_5_piece'
          then 5

        when pm.pack_profile = 'polo_6_piece'
          then 6

        else null
      end
    )::integer as units_per_pack,

    pc.average_selling_price,
    pc.last_supplier_price_update,
    pc.notes as commercial_notes,

    pc.created_at as cost_created_at,
    pc.updated_at as cost_updated_at

  from public.vault_product_master pm

  left join public.vault_product_costs pc
    on pc.product_id = pm.product_id
),

calculated_costs as (
  select
    *,

    case
      when pack_cost is null
        then null

      else round(
        pack_cost
        + coalesce(shipping_cost_per_pack, 0)
        + coalesce(import_cost_per_pack, 0),
        2
      )
    end as landed_cost_per_pack

  from commercial_base
),

unit_economics as (
  select
    *,

    case
      when landed_cost_per_pack is null
        or units_per_pack is null
        or units_per_pack <= 0
        then null

      else round(
        landed_cost_per_pack
        / units_per_pack,
        2
      )
    end as landed_cost_per_unit

  from calculated_costs
)

select
  product_id,
  product_name,
  product_type,
  shopify_status,

  supplier_id,
  supplier_company,
  inventory_strategy,
  restock_enabled,
  pack_profile,

  currency,
  pack_cost,
  shipping_cost_per_pack,
  import_cost_per_pack,
  units_per_pack,

  landed_cost_per_pack,
  landed_cost_per_unit,

  average_selling_price,

  case
    when average_selling_price is null
      or landed_cost_per_unit is null
      then null

    else round(
      average_selling_price
      - landed_cost_per_unit,
      2
    )
  end as estimated_gross_profit_per_unit,

  case
    when average_selling_price is null
      or average_selling_price <= 0
      or landed_cost_per_unit is null
      then null

    else round(
      (
        average_selling_price
        - landed_cost_per_unit
      )
      / average_selling_price
      * 100,
      2
    )
  end as estimated_margin_percent,

  case
    when landed_cost_per_unit is null
      or landed_cost_per_unit <= 0
      or average_selling_price is null
      then null

    else round(
      (
        average_selling_price
        - landed_cost_per_unit
      )
      / landed_cost_per_unit
      * 100,
      2
    )
  end as estimated_return_on_pack_capital_percent,

  /*
   * Cost readiness is intentionally separate from Product
   * Readiness. Sales history will later strengthen confidence.
   */
  case
    when inventory_strategy <> 'stocked'
      then true

    when supplier_id is null
      then false

    when pack_cost is null
      or pack_cost <= 0
      then false

    when units_per_pack is null
      or units_per_pack <= 0
      then false

    when average_selling_price is null
      or average_selling_price <= 0
      then false

    else true
  end as commercial_cost_trusted,

  array_remove(
    array[
      case
        when inventory_strategy = 'stocked'
          and supplier_id is null
          then 'supplier'
      end,

      case
        when inventory_strategy = 'stocked'
          and (
            pack_cost is null
            or pack_cost <= 0
          )
          then 'pack_cost'
      end,

      case
        when inventory_strategy = 'stocked'
          and (
            units_per_pack is null
            or units_per_pack <= 0
          )
          then 'units_per_pack'
      end,

      case
        when inventory_strategy = 'stocked'
          and (
            average_selling_price is null
            or average_selling_price <= 0
          )
          then 'average_selling_price'
      end
    ],
    null
  ) as missing_commercial_requirements,

  last_supplier_price_update,
  commercial_notes,
  cost_created_at,
  cost_updated_at

from unit_economics;


create or replace view
  public.vault_product_commercial_summary
as

select
  count(*)::integer as total_products,

  count(*) filter (
    where inventory_strategy = 'stocked'
  )::integer as stocked_products,

  count(*) filter (
    where inventory_strategy = 'stocked'
      and commercial_cost_trusted = true
  )::integer as commercially_configured_products,

  count(*) filter (
    where inventory_strategy = 'stocked'
      and commercial_cost_trusted = false
  )::integer as products_missing_costs,

  case
    when count(*) filter (
      where inventory_strategy = 'stocked'
    ) = 0
      then 0

    else round(
      (
        count(*) filter (
          where inventory_strategy = 'stocked'
            and commercial_cost_trusted = true
        )::numeric
        /
        count(*) filter (
          where inventory_strategy = 'stocked'
        )::numeric
      ) * 100,
      1
    )
  end as commercial_completion_percentage

from public.vault_product_commercial_intelligence;


notify pgrst, 'reload schema';