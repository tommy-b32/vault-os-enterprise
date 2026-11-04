import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { displayExternalPostageAmount, externalPostageInputError } from "../lib/sales-workbook/external-postage-form.mjs";

test("external postage form validates a Shopify order number and exact GBP pennies", () => {
  assert.equal(externalPostageInputError({ orderNumber: "1341", amountGbp: "3.75" }), null);
  assert.match(externalPostageInputError({ orderNumber: "", amountGbp: "3.75" }), /order number/);
  assert.match(externalPostageInputError({ orderNumber: "1341", amountGbp: "£3.75" }), /GBP amount/);
  assert.match(externalPostageInputError({ orderNumber: "1341", amountGbp: "3.755" }), /GBP amount/);
});

test("external postage form presents the reviewed amount in GBP", () => {
  assert.equal(displayExternalPostageAmount("3.75"), "£3.75");
});

test("external postage form uses the governed API, confirms submission and refreshes after success", () => {
  const source = readFileSync(fileURLToPath(new URL("../components/operations/ExternalPostageEntry.tsx", import.meta.url)), "utf8");
  assert.match(source, /fetch\("\/api\/sales-workbook\/external-postage"/);
  assert.match(source, /Confirm & record/);
  assert.match(source, /response\.status === 403/);
  assert.match(source, /await onRecorded\?\.\(\)/);
  assert.match(source, /no duplicate evidence was created/);
});
