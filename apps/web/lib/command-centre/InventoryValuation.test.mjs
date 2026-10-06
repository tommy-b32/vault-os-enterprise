import assert from "node:assert/strict";
import test from "node:test";
import { valueCurrentInventory } from "./InventoryValuation.ts";

const product = (stock, overrides = {}) => ({ styleId: "style", parentProductId: "product", stockOnHand: stock, commercialCost: { trusted: true, currency: "GBP", landedCostPerPackGbp: 20, unitsPerPack: 4 }, ...overrides });

test("values complete current stock from governed GBP pack cost and composition", () => {
  const value = valueCurrentInventory([product(8), product(3, { commercialCost: { trusted: true, currency: "GBP", landedCostPerPackGbp: 15, unitsPerPack: 3 } })]);
  assert.deepEqual(value, { totalUnits: 11, costedUnits: 11, uncostedUnits: 0, totalGbp: 55 });
});

test("zero stock is valued at zero and missing costs on zero stock do not block it", () => {
  assert.deepEqual(valueCurrentInventory([product(0, { commercialCost: null })]), { totalUnits: 0, costedUnits: 0, uncostedUnits: 0, totalGbp: 0 });
});

test("positive stock without governed GBP pack cost remains incomplete", () => {
  for (const cost of [{ trusted: false, currency: "GBP", landedCostPerPackGbp: 20, unitsPerPack: 4 }, { trusted: true, currency: "USD", landedCostPerPackGbp: 20, unitsPerPack: 4 }, { trusted: true, currency: "GBP", landedCostPerPackGbp: 20, unitsPerPack: null }]) {
    const value = valueCurrentInventory([product(2, { commercialCost: cost })]);
    assert.equal(value.uncostedUnits, 2);
  }
});
