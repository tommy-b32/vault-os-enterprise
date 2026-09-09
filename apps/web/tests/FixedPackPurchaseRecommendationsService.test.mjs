import assert from "node:assert/strict";
import test from "node:test";
import { loadFixedPackPurchaseRecommendationsFrom } from "../lib/fixed-pack-purchase-recommendations.ts";

const id = "00000000-0000-0000-0000-000000000100";
const supplier = "00000000-0000-0000-0000-000000000010";
const style = `${id}::Default`;
const evidence = (size = "S") => ({ model_size_id: `${style}::${size}`, style_id: style, parent_product_id: id, model_design: "Default", normalized_size: size, available_stock: 0, committed_stock: 0, incoming_stock: 0, net_available_stock: 0, sales_7_day_units: 0, sales_14_day_units: 0, sales_30_day_units: 0, average_daily_sales: 0, inventory_freshness: "2026-09-14T00:00:00Z", order_history_freshness: "2026-09-14T00:00:00Z", sales_history_30_complete: true, style_sales_mapping_complete: true, style_unresolved_clean_sales_units: 0, global_sales_mapping_complete: false, global_unresolved_clean_sales_units: 1, global_unmatched_clean_sales_units: 1, trusted: true, missing_requirements: [] });
const deps = (overrides = {}) => ({ loadModelSizeEvidence: async () => ["S", "M", "L", "XL", "2XL"].map(evidence), loadPackComposition: async () => ["S", "M", "L", "XL", "2XL"].map((normalized_size) => ({ id: "pack", supplier_id: supplier, style_id: style, parent_product_id: id, normalized_size, units_per_pack: 1, declared_units_per_pack: 5, commercial_units_per_pack: null, composition_units_per_pack: 5, composition_complete: true, composition_valid: true, commercial_pack_consistent: null, active: true, updated_at: "", missing_requirements: [] })), loadStyleCatalogue: async () => [{ styleId: style, parentProductId: id, supplierId: supplier, targetStockDays: 7 }], loadStyleReplenishment: async () => [{ styleId: style, parentProductId: id, sales7DayUnits: 0, sales14DayUnits: 0, sales30DayUnits: 0, targetStockDays: 7, supplierLeadTimeDays: 3 }], ...overrides });
test("service preserves engine zero and synthesizes unavailable ownership/pack results", async () => {
  const zero = await loadFixedPackPurchaseRecommendationsFrom(deps());
  assert.equal(zero[0].kind, "recommendation");
  assert.equal(zero[0].recommendation.recommendedPackCount, 0);
  const missingOwner = await loadFixedPackPurchaseRecommendationsFrom(deps({ loadStyleCatalogue: async () => [] }));
  assert.deepEqual([missingOwner[0].kind, missingOwner[0].supplierId, missingOwner[0].recommendedPackCount], ["unavailable", null, null]);
  const missingPack = await loadFixedPackPurchaseRecommendationsFrom(deps({ loadPackComposition: async () => [] }));
  assert.equal(missingPack[0].packDefinitionId, null);
});
