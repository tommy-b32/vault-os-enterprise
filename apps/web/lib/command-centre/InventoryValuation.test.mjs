import assert from "node:assert/strict";
import test from "node:test";
import { valueCurrentInventory } from "./InventoryValuation.ts";

const cost = (overrides = {}) => ({ landedCostPerPackGbp: 20, unitsPerPack: 4, missingRequirements: [], resolutionMode: "product_override", packCostSource: "product_override", unitsSource: "product_override", fxSource: "product_override", shippingCostSource: "product_override", importCostSource: "product_override", ...overrides });
const product = (stock, overrides = {}) => ({ styleId: "style", parentProductId: "product", stockOnHand: stock, commercialCost: cost(), ...overrides });

test("values complete current stock from governed GBP pack cost and composition", () => {
  const value = valueCurrentInventory([product(8), product(3, { commercialCost: cost({ landedCostPerPackGbp: 15, unitsPerPack: 3, missingRequirements: ["average_selling_price"] }) })]);
  assert.deepEqual(value, { totalUnits: 11, costedUnits: 11, uncostedUnits: 0, totalGbp: 55 });
});

test("zero stock is valued at zero and missing costs on zero stock do not block it", () => {
  assert.deepEqual(valueCurrentInventory([product(0, { commercialCost: null })]), { totalUnits: 0, costedUnits: 0, uncostedUnits: 0, totalGbp: 0 });
});

test("positive stock without governed GBP pack cost remains incomplete", () => {
  for (const invalidCost of [cost({ missingRequirements: ["pack_cost"] }), cost({ unitsPerPack: null, missingRequirements: ["units_per_pack"] })]) {
    const value = valueCurrentInventory([product(2, { commercialCost: invalidCost })]);
    assert.equal(value.uncostedUnits, 2);
  }
});

const uncosted = (name, commercialCost) => test(name, () => {
  const value = valueCurrentInventory([product(2, { commercialCost })]);
  assert.equal(value.totalUnits, 2); assert.equal(value.costedUnits, 0); assert.equal(value.uncostedUnits, 2);
});

test("valid GBP-origin governed cost is fully costed", () => {
  const value = valueCurrentInventory([product(4)]);
  assert.equal(value.costedUnits, 4); assert.equal(value.uncostedUnits, 0); assert.equal(value.totalGbp, 20);
});

test("USD-origin record with canonical landed GBP cost is fully costed", () => {
  const value = valueCurrentInventory([product(4, { commercialCost: { ...cost(), currency: "USD" } })]);
  assert.equal(value.costedUnits, 4); assert.equal(value.totalGbp, 20);
});

test("average selling price is non-blocking", () => {
  const value = valueCurrentInventory([product(4, { commercialCost: cost({ missingRequirements: ["average_selling_price"] }) })]);
  assert.equal(value.uncostedUnits, 0);
});

uncosted("missing pack cost is uncosted", cost({ missingRequirements: ["pack_cost"] }));
uncosted("missing units per pack is uncosted", cost({ missingRequirements: ["units_per_pack"] }));
uncosted("null landed cost is uncosted", cost({ landedCostPerPackGbp: null }));
uncosted("negative landed cost is uncosted", cost({ landedCostPerPackGbp: -1 }));
uncosted("non-finite landed cost is uncosted", cost({ landedCostPerPackGbp: Number.NaN }));
uncosted("zero units per pack is uncosted", cost({ unitsPerPack: 0 }));
uncosted("negative units per pack is uncosted", cost({ unitsPerPack: -1 }));
uncosted("fractional units per pack is uncosted", cost({ unitsPerPack: 1.5 }));
uncosted("unresolved commercial mode is uncosted", cost({ resolutionMode: "unavailable" }));
uncosted("unavailable pack source is uncosted", cost({ packCostSource: "unavailable" }));
uncosted("unavailable units source is uncosted", cost({ unitsSource: "unavailable" }));
uncosted("unavailable FX source is uncosted", cost({ fxSource: "unavailable" }));
uncosted("unavailable required shipping source is uncosted", cost({ shippingCostSource: "unavailable", missingRequirements: ["shipping_cost"] }));
uncosted("unavailable required import source is uncosted", cost({ importCostSource: "unavailable", missingRequirements: ["import_cost"] }));

test("negative stock is clamped to zero and strategy is deliberately irrelevant", () => {
  const value = valueCurrentInventory([product(-3, { commercialCost: null })]);
  assert.deepEqual(value, { totalUnits: 0, costedUnits: 0, uncostedUnits: 0, totalGbp: 0 });
});

test("partial coverage exposes uncosted units rather than an exact total", () => {
  const value = valueCurrentInventory([product(4), product(3, { styleId: "missing", commercialCost: null })]);
  assert.deepEqual(value, { totalUnits: 7, costedUnits: 4, uncostedUnits: 3, totalGbp: 20 });
});

test("multiple valid products sum their governed GBP values", () => {
  const value = valueCurrentInventory([product(4), product(6, { styleId: "second", commercialCost: cost({ landedCostPerPackGbp: 9, unitsPerPack: 3 }) })]);
  assert.equal(value.totalGbp, 38);
});
