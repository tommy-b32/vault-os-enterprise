import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const lifecyclePath = new URL("../components/purchase-orders/PurchaseOrderLifecycleStrip.tsx", import.meta.url);
const source = await readFile(lifecyclePath, "utf8");
const detailSource = await readFile(new URL("../app/purchase-orders/[id]/page.tsx", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../app/purchase-orders/page.tsx", import.meta.url), "utf8");
const recommendationsSource = await readFile(new URL("../app/purchase-intelligence/PurchaseRecommendationsPanel.tsx", import.meta.url), "utf8");
const intelligenceSource = await readFile(new URL("../app/purchase-intelligence/page.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const lifecycleModule = { exports: {} };
vm.runInNewContext(compiled, { module: lifecycleModule, exports: lifecycleModule.exports, require: () => ({ jsx: () => null, jsxs: () => null }) });
const derive = lifecycleModule.exports.derivePurchaseOrderLifecycle;
const stage = (status, evidence, name) => derive(status, evidence).find((entry) => entry.name === name);
const unpaid = { payment: "unpaid", shipped: false, fullyReceived: false, inventoryPosting: "unposted" };

test("lifecycle semantics are evidence-aware across all approved PO states", () => {
  assert.equal(stage("draft", unpaid, "Approval").state, "current");
  assert.equal(stage("approved", unpaid, "Payment").state, "upcoming");
  assert.equal(stage("approved", unpaid, "Payment").detail, "Awaiting order placement");
  assert.equal(stage("ordered", unpaid, "Payment").state, "current");
  assert.equal(stage("part_paid", { ...unpaid, payment: "part_paid" }, "Payment").state, "current");
  assert.equal(stage("paid", { ...unpaid, payment: "paid" }, "Payment").state, "complete");
  assert.equal(stage("paid", { ...unpaid, payment: "paid" }, "Shipping").state, "current");
  assert.equal(stage("shipped", { ...unpaid, shipped: true }, "Payment").state, "current");
  assert.equal(stage("shipped", { ...unpaid, payment: "part_paid", shipped: true }, "Payment").state, "current");
  assert.equal(stage("received", { ...unpaid, shipped: true, fullyReceived: true }, "Payment").state, "current");
  assert.equal(stage("received", { ...unpaid, shipped: true, fullyReceived: true }, "Inventory Posted").detail, "Not posted");
  assert.equal(stage("received", { ...unpaid, shipped: true, fullyReceived: true, inventoryPosting: "partially_posted" }, "Inventory Posted").detail, "Partially posted");
  assert.equal(stage("received", { ...unpaid, shipped: true, fullyReceived: true, inventoryPosting: "posted" }, "Inventory Posted").state, "complete");
  assert.ok(derive("closed", unpaid).every((entry) => entry.state === "complete"));
  assert.equal(derive("cancelled", unpaid).length, 0);
});

// A blocked posting outcome may conservatively reflect non-sellable-only allocation evidence.
// This fails closed (never complete); detailed receipt and posting evidence remains below.
test("blocked inventory posting remains current and incomplete", () => {
  const inventory = stage("received", { payment: "paid", shipped: true, fullyReceived: true, inventoryPosting: "blocked" }, "Inventory Posted");
  assert.equal(inventory.state, "current");
  assert.equal(inventory.detail, "Blocked");
  assert.notEqual(inventory.state, "complete");
});

test("shipped and paid PO has payment and shipping complete with receiving current", () => {
  const evidence = { payment: "paid", shipped: true, fullyReceived: false, inventoryPosting: "unposted" };
  assert.equal(stage("shipped", evidence, "Payment").state, "complete");
  assert.equal(stage("shipped", evidence, "Shipping").state, "complete");
  assert.equal(stage("shipped", evidence, "Receiving").state, "current");
});

test("received and paid PO with unposted inventory keeps inventory posting current", () => {
  const evidence = { payment: "paid", shipped: true, fullyReceived: true, inventoryPosting: "unposted" };
  assert.equal(stage("received", evidence, "Payment").state, "complete");
  assert.equal(stage("received", evidence, "Shipping").state, "complete");
  assert.equal(stage("received", evidence, "Receiving").state, "complete");
  assert.equal(stage("received", evidence, "Inventory Posted").state, "current");
  assert.equal(stage("received", evidence, "Inventory Posted").detail, "Not posted");
});

test("received and paid PO with fully posted inventory is ready to close", () => {
  const evidence = { payment: "paid", shipped: true, fullyReceived: true, inventoryPosting: "posted" };
  assert.equal(stage("received", evidence, "Payment").state, "complete");
  assert.equal(stage("received", evidence, "Shipping").state, "complete");
  assert.equal(stage("received", evidence, "Receiving").state, "complete");
  assert.equal(stage("received", evidence, "Inventory Posted").state, "complete");
  assert.equal(stage("received", evidence, "Closed").state, "current");
});

test("received and paid PO with non-applicable inventory is ready to close", () => {
  const evidence = { payment: "paid", shipped: true, fullyReceived: true, inventoryPosting: "not_applicable" };
  assert.equal(stage("received", evidence, "Inventory Posted").state, "complete");
  assert.equal(stage("received", evidence, "Inventory Posted").detail, "Not applicable");
  assert.equal(stage("received", evidence, "Closed").state, "current");
});

test("detail page supplies reconciled payment and allocation posting evidence", () => {
  assert.match(detailSource, /governed_reconciled_payment_state/);
  assert.match(detailSource, /supplier_balance_minor_units/);
  assert.match(detailSource, /supplier_paid_minor_units/);
  assert.match(detailSource, /sellableQuantity/);
  assert.match(detailSource, /shopify_succeeded/);
  assert.match(detailSource, /partially_posted/);
});

test("PO index groups active, preparation, and history without removing links", () => {
  for (const label of ["Draft / Preparation", "Active", "History"]) assert.match(indexSource, new RegExp(`label: "${label}"`));
  assert.match(indexSource, /statuses: \["draft", "approved"\]/);
  assert.match(indexSource, /statuses: \["ordered", "part_paid", "paid", "shipped", "received"\]/);
  assert.match(indexSource, /statuses: \["closed", "cancelled"\]/);
  assert.match(indexSource, /href=\{`\/purchase-orders\/\$\{draft\.id\}`\}/);
});

test("diagnostics are secondary but accessible, and recommendation deep links/actions remain", () => {
  assert.match(intelligenceSource, /<details className="purchase-intelligence-diagnostics">/);
  assert.match(intelligenceSource, /Supplier basket diagnostics and blockers/);
  assert.match(intelligenceSource, /Supplier trust diagnostics/);
  assert.match(recommendationsSource, /Add to Draft PO/);
  assert.match(recommendationsSource, /href=\{`\/purchase-orders\/\$\{matchedPurchaseOrderId\}`\}/);
});
