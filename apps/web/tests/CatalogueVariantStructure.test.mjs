import assert from "node:assert/strict";
import test from "node:test";
import { assessModels, resolveCatalogueVariantStructure } from "../lib/intelligence/CatalogueVariantStructure.ts";

const v = (id, one, two, extra = {}) => ({ id, productId: "p", sourceVariantId: `shop-${id}`, option1: one, option2: two, option3: null, sourceActive: true, availableForSale: true, available: 5, ...extra });
test("resolves standard and reversed catalogue structures without product-name rules", () => {
  const standard = resolveCatalogueVariantStructure("p", [v("a", "Newspaper", "M"), v("b", "Newspaper", "L")]);
  const reversed = resolveCatalogueVariantStructure("p", [v("a", "M", "Black"), v("b", "L", "Black")]);
  assert.equal(standard.state, "resolved"); assert.equal(standard.sizePosition, 2); assert.equal(reversed.state, "resolved"); assert.equal(reversed.sizePosition, 1);
});
test("does not guess ambiguous or no-size structures", () => {
  assert.equal(resolveCatalogueVariantStructure("p", [v("a", "M", "L"), v("b", "L", "M")]).state, "ambiguous");
  assert.equal(resolveCatalogueVariantStructure("p", [v("a", "Black", "Logo"), v("b", "White", "Text")]).state, "ambiguous");
});
test("model cover, priority, inactive variants, unavailable sizes and stale data are conservative", () => {
  const structure = resolveCatalogueVariantStructure("p", [v("m", "Logo", "M", { available: 0, availableForSale: false }), v("l", "Logo", "L", { available: 4 }), v("old", "Old", "S", { sourceActive: false, available: null })]);
  const sales = new Map([["shop-m", { sold7: 4, sold14: 8, previous14: 6 }], ["shop-l", { sold7: 3, sold14: 6, previous14: 6 }]]);
  const [model] = assessModels(structure, sales, "current"); assert.equal(model.stock, 4); assert.equal(model.daysCover, 4); assert.equal(model.priority, "critical"); assert.match(model.sizeRisks.join(), /M sold out/);
  assert.equal(assessModels(structure, sales, "stale")[0].priority, "watch");
});
test("tiny-base and zero velocity do not create false confidence or cover", () => {
  const structure = resolveCatalogueVariantStructure("p", [v("a", "Logo", "M", { available: 1 })]);
  const [tiny] = assessModels(structure, new Map([["shop-a", { sold7: 1, sold14: 3, previous14: 1 }]]), "current"); assert.equal(tiny.confidence, "low"); assert.notEqual(tiny.priority, "critical");
  const [zero] = assessModels(structure, new Map(), "current"); assert.equal(zero.daysCover, null);
});
test("detects stock concentration only when credible selling sizes are constrained", () => {
  const structure = resolveCatalogueVariantStructure("p", [v("s", "Logo", "S", { available: 1 }), v("m", "Logo", "M", { available: 0, availableForSale: false }), v("l", "Logo", "L", { available: 1 }), v("xxl", "Logo", "2XL", { available: 17 })]);
  const sales = new Map([["shop-m", { sold7: 3, sold14: 6, previous14: 4 }], ["shop-l", { sold7: 3, sold14: 5, previous14: 4 }]]);
  const [model] = assessModels(structure, sales, "current"); assert.equal(model.stockImbalance?.weakStockShare, 95); assert.deepEqual(model.stockImbalance?.constrainedSizes, ["M", "L"]);
});
test("does not infer imbalance from isolated demand, balanced stock, or zero demand", () => {
  const model = (rows, sales) => assessModels(resolveCatalogueVariantStructure("p", rows), new Map(sales), "current")[0];
  assert.equal(model([v("m", "Logo", "M", { available: 0, availableForSale: false }), v("xxl", "Logo", "2XL", { available: 20 })], [["shop-m", { sold7: 1, sold14: 1, previous14: 0 }]]).stockImbalance, null);
  assert.equal(model([v("m", "Logo", "M", { available: 5 }), v("l", "Logo", "L", { available: 5 })], [["shop-m", { sold7: 3, sold14: 6, previous14: 4 }], ["shop-l", { sold7: 3, sold14: 6, previous14: 4 }]]).stockImbalance, null);
  assert.equal(model([v("m", "Logo", "M", { available: 0, availableForSale: false }), v("xxl", "Logo", "2XL", { available: 20 })], []).stockImbalance, null);
});
