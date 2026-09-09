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

test("service transports populated canonical per-size details for a positive recommendation", async () => {
  const sourceRows = [
    { ...evidence("S"), available_stock: 11, committed_stock: 3, incoming_stock: 5, net_available_stock: 8, sales_7_day_units: 7, sales_14_day_units: 14, sales_30_day_units: 30, average_daily_sales: 1 },
    { ...evidence("M"), available_stock: 17, committed_stock: 4, incoming_stock: 6, net_available_stock: 1, sales_7_day_units: 14, sales_14_day_units: 28, sales_30_day_units: 60, average_daily_sales: 2 },
  ];
  const result = await loadFixedPackPurchaseRecommendationsFrom(deps({
    loadModelSizeEvidence: async () => sourceRows,
    loadPackComposition: async () => [
      { id: "positive-pack", supplier_id: supplier, style_id: style, parent_product_id: id, normalized_size: "S", units_per_pack: 1, declared_units_per_pack: 3, commercial_units_per_pack: null, composition_units_per_pack: 3, composition_complete: true, composition_valid: true, commercial_pack_consistent: null, active: true, updated_at: "", missing_requirements: [] },
      { id: "positive-pack", supplier_id: supplier, style_id: style, parent_product_id: id, normalized_size: "M", units_per_pack: 2, declared_units_per_pack: 3, commercial_units_per_pack: null, composition_units_per_pack: 3, composition_complete: true, composition_valid: true, commercial_pack_consistent: null, active: true, updated_at: "", missing_requirements: [] },
    ],
    loadStyleReplenishment: async () => [{ styleId: style, parentProductId: id, sales7DayUnits: 7, sales14DayUnits: 14, sales30DayUnits: 30, targetStockDays: 7, supplierLeadTimeDays: 3 }],
  }));
  assert.equal(result[0].kind, "recommendation");
  const recommendation = result[0].recommendation;
  assert.ok(recommendation.recommendedPackCount > 0);
  assert.ok(recommendation.recommendedTotalUnits > 0);
  assert.ok(recommendation.sizes.length >= 2);
  assert.deepEqual(recommendation.sizes.map((size) => size.normalizedSize), ["S", "M"]);
  const small = recommendation.sizes.find((size) => size.normalizedSize === "S");
  assert.deepEqual({ availableStock: small?.availableStock, committedStock: small?.committedStock, incomingStock: small?.incomingStock, netAvailableStock: small?.netAvailableStock, sales7DayUnits: small?.sales7DayUnits, sales14DayUnits: small?.sales14DayUnits, sales30DayUnits: small?.sales30DayUnits }, { availableStock: 11, committedStock: 3, incomingStock: 5, netAvailableStock: 8, sales7DayUnits: 7, sales14DayUnits: 14, sales30DayUnits: 30 });
  assert.deepEqual({ unitsPerPack: small?.unitsPerPack, purchasedUnits: small?.purchasedUnits, calculatedDailyDemand: small?.calculatedDailyDemand, targetStockUnits: small?.targetStockUnits, idealSizeNeed: small?.idealSizeNeed, projectedStock: small?.projectedStock, remainingShortage: small?.remainingShortage, projectedExcess: small?.projectedExcess }, { unitsPerPack: 1, purchasedUnits: 1, calculatedDailyDemand: 0.9999999999999999, targetStockUnits: 10, idealSizeNeed: 2, projectedStock: 9, remainingShortage: 1, projectedExcess: 0 });
  assert.equal(recommendation.sizes.reduce((total, size) => total + size.purchasedUnits, 0), recommendation.recommendedTotalUnits);
});

test("service fails closed when a positive pack candidate is missing canonical size evidence", async () => {
  const sourceRows = [
    { ...evidence("S"), available_stock: 11, committed_stock: 3, incoming_stock: 5, net_available_stock: 8, sales_7_day_units: 7, sales_14_day_units: 14, sales_30_day_units: 30, average_daily_sales: 1 },
  ];
  const result = await loadFixedPackPurchaseRecommendationsFrom(deps({
    loadModelSizeEvidence: async () => sourceRows,
    loadPackComposition: async () => [
      { id: "positive-pack", supplier_id: supplier, style_id: style, parent_product_id: id, normalized_size: "S", units_per_pack: 1, declared_units_per_pack: 3, commercial_units_per_pack: null, composition_units_per_pack: 3, composition_complete: true, composition_valid: true, commercial_pack_consistent: null, active: true, updated_at: "", missing_requirements: [] },
      { id: "positive-pack", supplier_id: supplier, style_id: style, parent_product_id: id, normalized_size: "M", units_per_pack: 2, declared_units_per_pack: 3, commercial_units_per_pack: null, composition_units_per_pack: 3, composition_complete: true, composition_valid: true, commercial_pack_consistent: null, active: true, updated_at: "", missing_requirements: [] },
    ],
    loadStyleReplenishment: async () => [{ styleId: style, parentProductId: id, sales7DayUnits: 7, sales14DayUnits: 14, sales30DayUnits: 30, targetStockDays: 7, supplierLeadTimeDays: 3 }],
  }));
  assert.equal(result[0].kind, "unavailable");
  assert.deepEqual(result[0].reasons, ["PACK_SIZE_EVIDENCE_MISSING"]);
  assert.equal("recommendation" in result[0], false);
});

test("service fails closed when a positive pack candidate has duplicate canonical size evidence", async () => {
  const small = { ...evidence("S"), available_stock: 11, committed_stock: 3, incoming_stock: 5, net_available_stock: 8, sales_7_day_units: 7, sales_14_day_units: 14, sales_30_day_units: 30, average_daily_sales: 1 };
  const sourceRows = [
    small,
    { ...small, model_size_id: `${style}::S-duplicate` },
    { ...evidence("M"), available_stock: 17, committed_stock: 4, incoming_stock: 6, net_available_stock: 1, sales_7_day_units: 14, sales_14_day_units: 28, sales_30_day_units: 60, average_daily_sales: 2 },
  ];
  const result = await loadFixedPackPurchaseRecommendationsFrom(deps({
    loadModelSizeEvidence: async () => sourceRows,
    loadPackComposition: async () => [
      { id: "positive-pack", supplier_id: supplier, style_id: style, parent_product_id: id, normalized_size: "S", units_per_pack: 1, declared_units_per_pack: 3, commercial_units_per_pack: null, composition_units_per_pack: 3, composition_complete: true, composition_valid: true, commercial_pack_consistent: null, active: true, updated_at: "", missing_requirements: [] },
      { id: "positive-pack", supplier_id: supplier, style_id: style, parent_product_id: id, normalized_size: "M", units_per_pack: 2, declared_units_per_pack: 3, commercial_units_per_pack: null, composition_units_per_pack: 3, composition_complete: true, composition_valid: true, commercial_pack_consistent: null, active: true, updated_at: "", missing_requirements: [] },
    ],
    loadStyleReplenishment: async () => [{ styleId: style, parentProductId: id, sales7DayUnits: 7, sales14DayUnits: 14, sales30DayUnits: 30, targetStockDays: 7, supplierLeadTimeDays: 3 }],
  }));
  assert.equal(result[0].kind, "unavailable");
  assert.deepEqual(result[0].reasons, ["PACK_SIZE_EVIDENCE_MISSING"]);
  assert.equal("recommendation" in result[0], false);
});

test("service rejects a wrong-style row for a required positive pack size", async () => {
  const otherStyle = `${style}::Other`;
  const result = await loadFixedPackPurchaseRecommendationsFrom(deps({
    loadModelSizeEvidence: async () => [
      { ...evidence("S"), available_stock: 11, committed_stock: 3, incoming_stock: 5, net_available_stock: 8, sales_7_day_units: 7, sales_14_day_units: 14, sales_30_day_units: 30, average_daily_sales: 1 },
      { ...evidence("M"), model_size_id: `${otherStyle}::M`, style_id: otherStyle, available_stock: 17, committed_stock: 4, incoming_stock: 6, net_available_stock: 1, sales_7_day_units: 14, sales_14_day_units: 28, sales_30_day_units: 60, average_daily_sales: 2 },
    ],
    loadPackComposition: async () => [
      { id: "positive-pack", supplier_id: supplier, style_id: style, parent_product_id: id, normalized_size: "S", units_per_pack: 1, declared_units_per_pack: 3, commercial_units_per_pack: null, composition_units_per_pack: 3, composition_complete: true, composition_valid: true, commercial_pack_consistent: null, active: true, updated_at: "", missing_requirements: [] },
      { id: "positive-pack", supplier_id: supplier, style_id: style, parent_product_id: id, normalized_size: "M", units_per_pack: 2, declared_units_per_pack: 3, commercial_units_per_pack: null, composition_units_per_pack: 3, composition_complete: true, composition_valid: true, commercial_pack_consistent: null, active: true, updated_at: "", missing_requirements: [] },
    ],
    loadStyleReplenishment: async () => [{ styleId: style, parentProductId: id, sales7DayUnits: 7, sales14DayUnits: 14, sales30DayUnits: 30, targetStockDays: 7, supplierLeadTimeDays: 3 }],
  }));
  const target = result.find((item) => item.styleId === style);
  assert.equal(target?.kind, "unavailable");
  assert.deepEqual(target?.reasons, ["PACK_SIZE_EVIDENCE_MISSING"]);
  assert.equal(target && "recommendation" in target, false);
});

test("service rejects a wrong-model row for a required positive pack size", async () => {
  const result = await loadFixedPackPurchaseRecommendationsFrom(deps({
    loadModelSizeEvidence: async () => [
      { ...evidence("S"), available_stock: 11, committed_stock: 3, incoming_stock: 5, net_available_stock: 8, sales_7_day_units: 7, sales_14_day_units: 14, sales_30_day_units: 30, average_daily_sales: 1 },
      { ...evidence("M"), model_size_id: `${style}::Other::M`, model_design: "Other", available_stock: 17, committed_stock: 4, incoming_stock: 6, net_available_stock: 1, sales_7_day_units: 14, sales_14_day_units: 28, sales_30_day_units: 60, average_daily_sales: 2 },
    ],
    loadPackComposition: async () => [
      { id: "positive-pack", supplier_id: supplier, style_id: style, parent_product_id: id, normalized_size: "S", units_per_pack: 1, declared_units_per_pack: 3, commercial_units_per_pack: null, composition_units_per_pack: 3, composition_complete: true, composition_valid: true, commercial_pack_consistent: null, active: true, updated_at: "", missing_requirements: [] },
      { id: "positive-pack", supplier_id: supplier, style_id: style, parent_product_id: id, normalized_size: "M", units_per_pack: 2, declared_units_per_pack: 3, commercial_units_per_pack: null, composition_units_per_pack: 3, composition_complete: true, composition_valid: true, commercial_pack_consistent: null, active: true, updated_at: "", missing_requirements: [] },
    ],
    loadStyleReplenishment: async () => [{ styleId: style, parentProductId: id, sales7DayUnits: 7, sales14DayUnits: 14, sales30DayUnits: 30, targetStockDays: 7, supplierLeadTimeDays: 3 }],
  }));
  assert.equal(result[0].kind, "unavailable");
  assert.deepEqual(result[0].reasons, ["SEMANTIC_IDENTITY_UNRESOLVED"]);
  assert.equal("recommendation" in result[0], false);
});

test("service exposes canonical per-size evidence for a zero-pack recommendation", async () => {
  const result = await loadFixedPackPurchaseRecommendationsFrom(deps({
    loadModelSizeEvidence: async () => [
      { ...evidence("S"), available_stock: 11, committed_stock: 3, incoming_stock: 5, net_available_stock: 8, sales_7_day_units: 0, sales_14_day_units: 0, sales_30_day_units: 0 },
      { ...evidence("M"), available_stock: 17, committed_stock: 4, incoming_stock: 6, net_available_stock: 1, sales_7_day_units: 0, sales_14_day_units: 0, sales_30_day_units: 0 },
    ],
    loadPackComposition: async () => [
      { id: "zero-pack", supplier_id: supplier, style_id: style, parent_product_id: id, normalized_size: "S", units_per_pack: 1, declared_units_per_pack: 3, commercial_units_per_pack: null, composition_units_per_pack: 3, composition_complete: true, composition_valid: true, commercial_pack_consistent: null, active: true, updated_at: "", missing_requirements: [] },
      { id: "zero-pack", supplier_id: supplier, style_id: style, parent_product_id: id, normalized_size: "M", units_per_pack: 2, declared_units_per_pack: 3, commercial_units_per_pack: null, composition_units_per_pack: 3, composition_complete: true, composition_valid: true, commercial_pack_consistent: null, active: true, updated_at: "", missing_requirements: [] },
    ],
  }));
  assert.equal(result[0].kind, "recommendation");
  const recommendation = result[0].recommendation;
  assert.equal(recommendation.recommendedPackCount, 0);
  assert.equal(recommendation.recommendedTotalUnits, 0);
  assert.deepEqual(recommendation.sizes.map((size) => size.normalizedSize), ["S", "M"]);
  assert.deepEqual({ availableStock: recommendation.sizes[0].availableStock, committedStock: recommendation.sizes[0].committedStock, incomingStock: recommendation.sizes[0].incomingStock, netAvailableStock: recommendation.sizes[0].netAvailableStock, sales7DayUnits: recommendation.sizes[0].sales7DayUnits, sales14DayUnits: recommendation.sizes[0].sales14DayUnits, sales30DayUnits: recommendation.sizes[0].sales30DayUnits }, { availableStock: 11, committedStock: 3, incomingStock: 5, netAvailableStock: 8, sales7DayUnits: 0, sales14DayUnits: 0, sales30DayUnits: 0 });
  assert.ok(recommendation.sizes.every((size) => size.purchasedUnits === 0));
  assert.equal(recommendation.sizes.reduce((total, size) => total + size.purchasedUnits, 0), 0);
});

test("unavailable and not_applicable results do not fabricate recommendation sizes", async () => {
  const unavailable = await loadFixedPackPurchaseRecommendationsFrom(deps({ loadStyleCatalogue: async () => [] }));
  assert.equal(unavailable[0].kind, "unavailable");
  assert.deepEqual(unavailable[0].reasons, ["SUPPLIER_MISSING"]);
  assert.equal("sizes" in unavailable[0], false);
  const notApplicable = await loadFixedPackPurchaseRecommendationsFrom(deps({ loadStyleCatalogue: async () => [catalogue(style, id, { restockEnabled: false })] }));
  assert.equal(notApplicable[0].kind, "not_applicable");
  assert.deepEqual(notApplicable[0].reasons, ["RESTOCK_DISABLED"]);
  assert.equal("sizes" in notApplicable[0], false);
});
