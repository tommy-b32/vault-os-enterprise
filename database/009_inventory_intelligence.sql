-- ============================================
-- Vault OS
-- Sprint 014.1
-- Inventory Intelligence Foundation
-- ============================================

create or replace view vault_inventory_intelligence as

select

    p.id                 as product_id,
    p.title              as product_name,
    p.vendor,
    p.product_type,

    count(v.id)          as total_variants,

    coalesce(
        sum(i.available_quantity),
        0
    )                    as stock_on_hand,

    coalesce(
        sum(i.committed_quantity),
        0
    )                    as committed_stock,

    coalesce(
        sum(i.incoming_quantity),
        0
    )                    as incoming_stock,

    max(i.synced_at)     as last_inventory_sync

from vault_products p

left join vault_variants v

    on v.product_id = p.id

left join vault_inventory_levels i

    on i.variant_id = v.id

group by

    p.id,
    p.title,
    p.vendor,
    p.product_type;

    -- ============================================================
-- VAULT OS
-- Sprint 014.2: Pack-Aware Inventory Intelligence
--
-- Tee pack:
-- S, M, L, XL, XXL
--
-- Polo pack:
-- S, M, L, XL, XXL, XXXL
-- ============================================================

create or replace view public.vault_variant_inventory_normalized as

select
  p.id as product_id,
  p.title as product_name,
  p.handle,
  p.vendor,

  case
    when p.title ilike '%polo%'
      then 'polo_6_piece'
    else 'tee_5_piece'
  end as pack_profile,

  case
    when p.title ilike '%polo%'
      then 6
    else 5
  end as pack_size,

  coalesce(
    nullif(trim(v.option_1), ''),
    'Default'
  ) as colour_design,

  v.id as variant_id,
  v.title as variant_title,

  v.option_2 as size_raw,

  case
    when upper(trim(v.option_2)) in ('S', 'SMALL')
      then 'S'

    when upper(trim(v.option_2)) in ('M', 'MEDIUM')
      then 'M'

    when upper(trim(v.option_2)) in ('L', 'LARGE')
      then 'L'

    when upper(trim(v.option_2)) in ('XL', 'X-LARGE', 'EXTRA LARGE')
      then 'XL'

    when upper(trim(v.option_2)) in (
      '2XL',
      'XXL',
      '2X',
      'XX-LARGE',
      'EXTRA EXTRA LARGE'
    )
      then 'XXL'

    when upper(trim(v.option_2)) in (
      '3XL',
      'XXXL',
      '3X',
      'XXX-LARGE',
      'EXTRA EXTRA EXTRA LARGE'
    )
      then 'XXXL'

    else upper(trim(v.option_2))
  end as normalized_size,

  coalesce(
    sum(i.available_quantity),
    0
  )::integer as available_quantity,

  coalesce(
    sum(i.committed_quantity),
    0
  )::integer as committed_quantity,

  coalesce(
    sum(i.incoming_quantity),
    0
  )::integer as incoming_quantity,

  max(i.synced_at) as last_inventory_sync

from public.vault_products p

join public.vault_variants v
  on v.product_id = p.id

left join public.vault_inventory_levels i
  on i.variant_id = v.id

where p.source = 'shopify'
  and upper(coalesce(p.status, '')) = 'ACTIVE'

  -- Exclude dropship shoe products from owned-stock intelligence.
  and not (
    v.option_2 is null
    and upper(trim(v.option_1)) ~ '^[0-9]+(\.[0-9]+)?$'
  )

group by
  p.id,
  p.title,
  p.handle,
  p.vendor,
  v.id,
  v.title,
  v.option_1,
  v.option_2;


create or replace view public.vault_pack_inventory_intelligence as

with size_stock as (

  select
    product_id,
    product_name,
    handle,
    vendor,
    pack_profile,
    pack_size,
    colour_design,

    coalesce(
      sum(available_quantity)
        filter (where normalized_size = 'S'),
      0
    )::integer as small_stock,

    coalesce(
      sum(available_quantity)
        filter (where normalized_size = 'M'),
      0
    )::integer as medium_stock,

    coalesce(
      sum(available_quantity)
        filter (where normalized_size = 'L'),
      0
    )::integer as large_stock,

    coalesce(
      sum(available_quantity)
        filter (where normalized_size = 'XL'),
      0
    )::integer as xl_stock,

    coalesce(
      sum(available_quantity)
        filter (where normalized_size = 'XXL'),
      0
    )::integer as xxl_stock,

    coalesce(
      sum(available_quantity)
        filter (where normalized_size = 'XXXL'),
      0
    )::integer as xxxl_stock,

    coalesce(
      sum(available_quantity),
      0
    )::integer as total_available_stock,

    coalesce(
      sum(committed_quantity),
      0
    )::integer as total_committed_stock,

    coalesce(
      sum(incoming_quantity),
      0
    )::integer as total_incoming_stock,

    max(last_inventory_sync) as last_inventory_sync

  from public.vault_variant_inventory_normalized

  group by
    product_id,
    product_name,
    handle,
    vendor,
    pack_profile,
    pack_size,
    colour_design
),

pack_calculation as (

  select
    *,

    case
      when pack_profile = 'polo_6_piece'
        then least(
          small_stock,
          medium_stock,
          large_stock,
          xl_stock,
          xxl_stock,
          xxxl_stock
        )

      else least(
        small_stock,
        medium_stock,
        large_stock,
        xl_stock,
        xxl_stock
      )
    end::integer as complete_packs

  from size_stock
)

select
  product_id,
  product_name,
  handle,
  vendor,
  colour_design,

  pack_profile,
  pack_size,

  small_stock,
  medium_stock,
  large_stock,
  xl_stock,
  xxl_stock,
  xxxl_stock,

  total_available_stock,
  total_committed_stock,
  total_incoming_stock,

  complete_packs,

  (
    total_available_stock
    - (complete_packs * pack_size)
  )::integer as loose_units_after_complete_packs,

  case
    when pack_profile = 'polo_6_piece' then
      array_remove(
        array[
          case when small_stock = 0 then 'S' end,
          case when medium_stock = 0 then 'M' end,
          case when large_stock = 0 then 'L' end,
          case when xl_stock = 0 then 'XL' end,
          case when xxl_stock = 0 then 'XXL' end,
          case when xxxl_stock = 0 then 'XXXL' end
        ],
        null
      )

    else
      array_remove(
        array[
          case when small_stock = 0 then 'S' end,
          case when medium_stock = 0 then 'M' end,
          case when large_stock = 0 then 'L' end,
          case when xl_stock = 0 then 'XL' end,
          case when xxl_stock = 0 then 'XXL' end
        ],
        null
      )
  end as missing_sizes,

  complete_packs > 0
    as full_size_run_available,

  (
    total_available_stock > 0
    and complete_packs = 0
  ) as broken_size_run,

  case
    when total_available_stock = 0
      then 'out_of_stock'

    when complete_packs = 0
      then 'broken_size_run'

    when complete_packs = 1
      then 'critical'

    when complete_packs <= 3
      then 'low'

    when complete_packs <= 6
      then 'monitor'

    else 'healthy'
  end as stock_status,

  last_inventory_sync

from pack_calculation;