import test from "node:test";
import assert from "node:assert/strict";
import { resolveOrderShippingEvidence, parseExternalPostagePence } from "../lib/order-shipping-evidence.mjs";

const external = { source: "manual_external", status: "approved", currency: "GBP", amountPence: 375 };
const shopify = { sourceState: "covered", currency: "GBP", amountPence: 295, labelCount: 1 };

test("order 1341: external GBP 3.75 is covered once", () => {
  assert.deepEqual(resolveOrderShippingEvidence({ shopify: { sourceState: "missing" }, external }),
    { state: "covered", amountPence: 375, source: "manual_external" });
});
test("Shopify verified postage is covered", () => {
  assert.deepEqual(resolveOrderShippingEvidence({ shopify }), { state: "covered", amountPence: 295, source: "shopify" });
});
test("both verified sources conflict rather than double-count", () => {
  assert.deepEqual(resolveOrderShippingEvidence({ shopify, external }),
    { state: "conflict", amountPence: null, source: null });
});
test("no verified postage remains pending", () => {
  assert.equal(resolveOrderShippingEvidence({ shopify: { sourceState: "awaiting_shopify_cost" } }).state, "pending");
});
test("unapproved or malformed external costs remain pending", () => {
  assert.equal(resolveOrderShippingEvidence({ external: { ...external, status: "draft" } }).state, "pending");
  assert.equal(resolveOrderShippingEvidence({ external: { ...external, amountPence: -1 } }).state, "pending");
});
test("manual input parser accepts exact pennies, rejects guesses and negatives", () => {
  assert.equal(parseExternalPostagePence("3.75"), 375);
  assert.equal(parseExternalPostagePence("3.7"), 370);
  for (const value of ["-3.75", "3.755", "£3.75", "3,75", "", "Infinity"]) {
    assert.throws(() => parseExternalPostagePence(value));
  }
});
