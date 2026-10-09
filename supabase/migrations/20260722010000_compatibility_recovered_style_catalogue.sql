-- ============================================================================
-- VAULT OS REPLAY COMPATIBILITY BOOTSTRAP
-- PROVENANCE CLASS: COMPATIBILITY_RECOVERED
--
-- COMPATIBILITY REPLAY SUPPORT ONLY.
-- Definition recovered from read-only production PostgreSQL metadata on
-- 2026-10-03.
-- No pre-2026-08-05 creator or schema artifact was found.
-- This object must not be cited as proof of August historical schema state.
--
-- The SQL below is copied exactly from
-- apps/web/tests/fixtures/vault-legacy-schema-baseline.sql.
-- ============================================================================
create view public.vault_style_catalogue_intelligence as
select (ci.product_id::text || '::'::text) || coalesce(nullif(trim(both from pi.colour_design), ''::text), 'Default'::text) as style_id,
  ci.product_id as parent_product_id,
  ci.product_name as parent_product_name,
  case
    when nullif(trim(both from pi.colour_design), ''::text) is null or trim(both from pi.colour_design) = 'Default'::text then ci.product_name
    else (ci.product_name || ' · '::text) || trim(both from pi.colour_design)
  end as product_name,
  coalesce(nullif(trim(both from pi.colour_design), ''::text), 'Default'::text) as style_name,
  ci.handle,
  ci.vendor,
  ci.product_type,
  ci.shopify_status,
  ci.supplier_id,
  ci.supplier_company,
  ci.inventory_strategy,
  ci.restock_enabled,
  coalesce(ci.pack_profile, pi.pack_profile) as pack_profile,
  ci.supplier_moq_packs,
  ci.target_stock_days,
  ci.decision_reason,
  ci.notes,
  ci.settings_updated_at,
  ci.supplier_complete,
  ci.strategy_complete,
  ci.pack_profile_complete,
  ci.moq_complete,
  ci.target_days_complete,
  ci.configuration_score,
  ci.missing_requirements,
  ci.missing_requirement_count,
  ci.configuration_state,
  ci.configuration_trusted,
  ci.trusted_for_reorder,
  ci.brain_confidence,
  pi.pack_size,
  pi.small_stock,
  pi.medium_stock,
  pi.large_stock,
  pi.xl_stock,
  pi.xxl_stock,
  pi.xxxl_stock,
  pi.total_available_stock as stock_on_hand,
  pi.total_committed_stock as committed_stock,
  pi.total_incoming_stock as incoming_stock,
  pi.complete_packs,
  pi.loose_units_after_complete_packs as loose_units,
  pi.missing_sizes,
  pi.full_size_run_available,
  pi.broken_size_run,
  pi.stock_status,
  pi.last_inventory_sync,
  vp.featured_image_url as image_url
from vault_configuration_intelligence ci
join vault_pack_inventory_intelligence pi on pi.product_id = ci.product_id
left join vault_products vp on vp.id = ci.product_id;
