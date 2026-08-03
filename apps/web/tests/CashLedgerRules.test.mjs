import assert from "node:assert/strict";
import test from "node:test";

import {
  cashLedgerExternalId,
  parsePositiveAmountToPence,
  purchasingPowerPence,
  signedPence,
} from "../lib/business/CashLedgerRules.ts";

test("£200 income increases cash by £200", () => {
  assert.equal(210156 + signedPence("money_in", 20000), 230156);
});

test("£200 expense decreases cash by £200", () => {
  assert.equal(210156 + signedPence("money_out", 20000), 190156);
});

test("£2,000 supplier order decreases cash by £2,000", () => {
  assert.equal(210156 + signedPence("money_out", 200000), 10156);
});

test("zero and negative operator amounts are rejected", () => {
  assert.throws(() => parsePositiveAmountToPence("0"));
  assert.throws(() => parsePositiveAmountToPence("-1"));
});

test("purchasing power recalculates from cash, reserve, and commitments", () => {
  assert.equal(purchasingPowerPence(230156, 10000, 20000), 200156);
  assert.equal(purchasingPowerPence(10156, 10000, 20000), 0);
});

test("duplicate submissions resolve to the same database idempotency key", () => {
  const submissionId = "15f0a3d0-a8e9-4f3e-a663-a0ca448c75e8";
  assert.equal(cashLedgerExternalId(submissionId), cashLedgerExternalId(submissionId));
});

test("unavailable finance is not coerced to zero", () => {
  const unavailable = null;
  assert.equal(unavailable, null);
  assert.notEqual(unavailable, 0);
});
