-- ============================================================
-- VAULT OS
-- Sprint 014.2: Variant and Size Audit
-- ============================================================

select
  p.title as product_name,
  p.handle,
  v.title as variant_title,
  v.option_1,
  v.option_2,
  v.option_3,
  v.sku,
  coalesce(sum(i.available_quantity), 0) as available_quantity
from public.vault_products p
join public.vault_variants v
  on v.product_id = p.id
left join public.vault_inventory_levels i
  on i.variant_id = v.id
where p.source = 'shopify'
group by
  p.title,
  p.handle,
  v.id,
  v.title,
  v.option_1,
  v.option_2,
  v.option_3,
  v.sku
order by
  p.title,
  v.title;