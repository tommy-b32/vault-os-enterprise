import assert from "node:assert/strict";
import test from "node:test";
import { loadFixedPackPurchaseRecommendationsFrom } from "../lib/fixed-pack-purchase-recommendations.ts";

const id = "00000000-0000-0000-0000-000000000100";
const supplier = "00000000-0000-0000-0000-000000000010";
const style = `${id}::Default`;
const evidence = (size = "S") => ({ model_size_id: `${style}::${size}`, style_id: style, parent_product_id: id, model_design: "Default", normalized_size: size, available_stock: 0, committed_stock: 0, incoming_stock: 0, net_available_stock: 0, sales_7_day_units: 0, sales_14_day_units: 0, sales_30_day_units: 0, average_daily_sales: 0, inventory_freshness: "2026-09-14T00:00:00Z", order_history_freshness: "2026-09-14T00:00:00Z", sales_history_30_complete: true, style_sales_mapping_complete: true, style_unresolved_clean_sales_units: 0, global_sales_mapping_complete: false, global_unresolved_clean_sales_units: 1, global_unmatched_clean_sales_units: 1, trusted: true, missing_requirements: [] });
const catalogue = (styleId = style, parentProductId = id, overrides = {}) => ({ styleId, parentProductId, supplierId: supplier, targetStockDays: 7, inventoryStrategy: "stocked", restockEnabled: true, ...overrides });
const deps = (overrides = {}) => ({ loadModelSizeEvidence: async () => ["S", "M", "L", "XL", "2XL"].map(evidence), loadPackComposition: async () => ["S", "M", "L", "XL", "2XL"].map((normalized_size) => ({ id: "pack", supplier_id: supplier, style_id: style, parent_product_id: id, normalized_size, units_per_pack: 1, declared_units_per_pack: 5, commercial_units_per_pack: null, composition_units_per_pack: 5, composition_complete: true, composition_valid: true, commercial_pack_consistent: null, active: true, updated_at: "", missing_requirements: [] })), loadStyleCatalogue: async () => [catalogue()], loadStyleReplenishment: async () => [{ styleId: style, parentProductId: id, sales7DayUnits: 0, sales14DayUnits: 0, sales30DayUnits: 0, targetStockDays: 7, supplierLeadTimeDays: 3 }], ...overrides });
test("service preserves engine zero and synthesizes unavailable ownership/pack results", async () => {
  const zero = await loadFixedPackPurchaseRecommendationsFrom(deps());
  assert.equal(zero[0].kind, "recommendation");
  assert.equal(zero[0].recommendation.recommendedPackCount, 0);
  const missingOwner = await loadFixedPackPurchaseRecommendationsFrom(deps({ loadStyleCatalogue: async () => [] }));
  assert.deepEqual([missingOwner[0].kind, missingOwner[0].supplierId, missingOwner[0].recommendedPackCount], ["unavailable", null, null]);
  const missingPack = await loadFixedPackPurchaseRecommendationsFrom(deps({ loadPackComposition: async () => [] }));
  assert.equal(missingPack[0].packDefinitionId, null);
});

test("service classifies canonical no-restock policy before pack resolution", async () => {
  const policy = await loadFixedPackPurchaseRecommendationsFrom(deps({ loadPackComposition: async () => [], loadStyleCatalogue: async () => [catalogue(style, id, { inventoryStrategy: "do_not_restock" })] }));
  assert.deepEqual([policy[0].kind, policy[0].status, policy[0].recommendedPackCount, policy[0].recommendedTotalUnits, policy[0].reasons], ["not_applicable", "not_applicable", null, null, ["RESTOCK_DISABLED"]]);
  const disabled = await loadFixedPackPurchaseRecommendationsFrom(deps({ loadStyleCatalogue: async () => [catalogue(style, id, { restockEnabled: false })] }));
  assert.equal(disabled[0].kind, "not_applicable");
  const missingPack = await loadFixedPackPurchaseRecommendationsFrom(deps({ loadPackComposition: async () => [] }));
  assert.deepEqual([missingPack[0].kind, missingPack[0].reasons], ["unavailable", ["PACK_COMPOSITION_MISSING"]]);
  const policyWithPack = await loadFixedPackPurchaseRecommendationsFrom(deps({ loadStyleCatalogue: async () => [catalogue(style, id, { inventoryStrategy: "do_not_restock" })] }));
  assert.equal(policyWithPack[0].kind, "not_applicable");
});

test("policy propagates by parent without affecting unrelated styles or engine states", async () => {
  const otherId = "00000000-0000-0000-0000-000000000200";
  const otherStyle = `${otherId}::Default`;
  const siblingStyle = `${id}::Sibling`;
  const policyEvidence = ["S", "M", "L", "XL", "2XL"].flatMap((size) => [evidence(size), { ...evidence(size), model_size_id: `${siblingStyle}::${size}`, style_id: siblingStyle, model_design: "Sibling" }, { ...evidence(size), model_size_id: `${otherStyle}::${size}`, style_id: otherStyle, parent_product_id: otherId }]);
  const results = await loadFixedPackPurchaseRecommendationsFrom(deps({ loadModelSizeEvidence: async () => policyEvidence, loadStyleCatalogue: async () => [catalogue(style, id, { inventoryStrategy: "do_not_restock" }), catalogue(siblingStyle, id, { inventoryStrategy: "do_not_restock" }), catalogue(otherStyle, otherId)], loadPackComposition: async () => ["S", "M", "L", "XL", "2XL"].map((normalized_size) => ({ id: "other-pack", supplier_id: supplier, style_id: otherStyle, parent_product_id: otherId, normalized_size, units_per_pack: 1, declared_units_per_pack: 5, commercial_units_per_pack: null, composition_units_per_pack: 5, composition_complete: true, composition_valid: true, commercial_pack_consistent: null, active: true, updated_at: "", missing_requirements: [] })), loadStyleReplenishment: async () => [{ styleId: style, parentProductId: id, sales7DayUnits: 0, sales14DayUnits: 0, sales30DayUnits: 0, targetStockDays: 7, supplierLeadTimeDays: 3 }, { styleId: siblingStyle, parentProductId: id, sales7DayUnits: 0, sales14DayUnits: 0, sales30DayUnits: 0, targetStockDays: 7, supplierLeadTimeDays: 3 }, { styleId: otherStyle, parentProductId: otherId, sales7DayUnits: 0, sales14DayUnits: 0, sales30DayUnits: 0, targetStockDays: 7, supplierLeadTimeDays: 3 }] }));
  assert.deepEqual(results.map((x) => x.kind).sort(), ["not_applicable", "not_applicable", "recommendation"]);
  const normal = results.find((x) => x.kind === "recommendation");
  assert.equal(normal.recommendation.recommendedPackCount, 0);
  const unresolved = await loadFixedPackPurchaseRecommendationsFrom(deps({ loadStyleCatalogue: async () => [] }));
  assert.equal(unresolved[0].kind, "unavailable");
});
