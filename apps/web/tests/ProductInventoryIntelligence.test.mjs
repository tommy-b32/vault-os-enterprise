import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assessInventory } from "../lib/intelligence/ProductInventoryIntelligence.ts";

const baseMomentum = (overrides = {}) => ({ title: "Tee", currentUnits: 14, previousUnits: 8, currentRevenue: 140, previousRevenue: 80, unitChange: .75, direction: "up", confidence: "high", status: "accelerating", evidence: "", recommendedAction: "", variantIds: ["shopify-v1"], sold7: 8, ...overrides });
const variants = (overrides = []) => [{ sourceVariantId: "shopify-v1", productId: "p1", size: "M", availableForSale: true, available: 5, sold14: 8 }, { sourceVariantId: "shopify-v2", productId: "p1", size: "L", availableForSale: true, available: 5, sold14: 6 }, ...overrides];
const assess = (overrides = {}) => assessInventory({ momentum: baseMomentum(overrides.momentum), sold7: overrides.sold7 ?? 8, sold14: overrides.sold14 ?? 14, soldVariantIds: overrides.soldVariantIds ?? ["shopify-v1"], variants: overrides.variants ?? variants(), freshness: overrides.freshness ?? "current", queryFailed: overrides.queryFailed });

test("maps Shopify variant IDs to one canonical product and includes every active variant across locations", () => {
  const result = assess({ variants: variants([{ sourceVariantId: "shopify-v3", productId: "p1", size: "XL", availableForSale: true, available: 7, sold14: 0 }]) });
  assert.equal(result.state, "available");
  assert.equal(result.stock, 17);
  assert.equal(result.daysCover, 17);
});
test("never turns a missing inventory row into zero stock", () => assert.equal(assess({ variants: variants([{ sourceVariantId: "shopify-v3", productId: "p1", size: "XL", availableForSale: true, available: null, sold14: 0 }]) }).state, "inventory_unavailable"));
test("does not let an obsolete inactive variant with no inventory row poison active product completeness", () => {
  const result = assess({ variants: variants([{ sourceVariantId: "obsolete", productId: "p1", size: "S", availableForSale: false, available: null, sold14: 0 }]) });
  assert.equal(result.state, "available");
});
test("marks unresolved sold variants as mapping incomplete", () => assert.equal(assess({ soldVariantIds: ["missing"] }).state, "mapping_incomplete"));
test("variant, product mapping, and inventory query failures are unavailable rather than zero-stock recommendations", () => {
  for (const failure of ["variant", "product", "levels"]) {
    const result = assess({ queryFailed: true });
    assert.equal(result.state, "inventory_unavailable", failure);
    assert.equal(result.stock, null, failure);
    assert.equal(result.priority, "watch", failure);
  }
});
test("assigns NONE to healthy credible demand and HIGH/CRITICAL to credible low cover", () => {
  assert.equal(assess({ variants: variants([{ sourceVariantId: "shopify-v3", productId: "p1", size: "XL", availableForSale: true, available: 100, sold14: 0 }]) }).priority, "none");
  assert.equal(assess({ variants: [{ sourceVariantId: "shopify-v1", productId: "p1", size: "M", availableForSale: true, available: 10, sold14: 8 }] }).priority, "high");
  assert.equal(assess({ variants: [{ sourceVariantId: "shopify-v1", productId: "p1", size: "M", availableForSale: true, available: 3, sold14: 8 }] }).priority, "critical");
});
test("low stock with insufficient demand is not critical and zero velocity has no cover", () => {
  assert.notEqual(assess({ momentum: baseMomentum({ confidence: "low", status: "insufficient_data" }), sold14: 3, variants: [{ sourceVariantId: "shopify-v1", productId: "p1", size: "M", availableForSale: true, available: 1, sold14: 3 }] }).priority, "critical");
  const zero = assess({ sold14: 0, sold7: 0 }); assert.equal(zero.daysCover, null);
});
test("cooling demand reduces urgency, sold-out selling sizes are risky, and stale sync is surfaced", () => {
  assert.equal(assess({ momentum: baseMomentum({ status: "cooling", confidence: "high" }), variants: variants([{ sourceVariantId: "shopify-v3", productId: "p1", size: "XL", availableForSale: true, available: 100, sold14: 0 }]) }).priority, "none");
  assert.equal(assess({ variants: [{ sourceVariantId: "shopify-v1", productId: "p1", size: "M", availableForSale: true, available: 0, sold14: 8 }] }).priority, "critical");
  assert.equal(assess({ freshness: "stale" }).priority, "watch");
});
test("VaultCare, analytics boundary, and Meta lock remain protected", async () => {
  const [momentum, store, page] = await Promise.all([readFile(new URL("../lib/intelligence/ProductMomentumEngine.ts", import.meta.url), "utf8"), readFile(new URL("../lib/intelligence/StoreIntelligence.ts", import.meta.url), "utf8"), readFile(new URL("../app/intelligence/page.tsx", import.meta.url), "utf8")]);
  assert.match(momentum, /vault\\s\*care/); assert.match(store, /2026-05-04T00:00:00\+01:00/); assert.match(page, /Budget recommendations locked/);
});
