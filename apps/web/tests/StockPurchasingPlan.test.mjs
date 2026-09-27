import assert from "node:assert/strict";
import test from "node:test";
import { buildStockPurchasingPlan, usablePlanningCapacity } from "../lib/stock-purchasing-plan.ts";

const candidate = (id, overrides = {}) => ({ recommendationId: id, supplierId: `supplier-${id}`, supplierName: "Supplier", styleId: `style-${id}`, parentProductId: "00000000-0000-4000-8000-000000000001", productName: "Product", modelDesign: "Black", trusted: true, recommendedPackCount: 2, recommendedTotalUnits: 10, landedCostPerPackGbp: 100, stockState: "REORDER NOW", packFit: "GOOD FIT", currentCoverDays: 4, demandPressure: 10, leadTimeDays: 14, totalShortageRemainingUnits: 4, totalProjectedExcessUnits: 0, reasonCodes: [], ...overrides });

test("usable capacity is the lower independent budget or wallet constraint", () => {
  assert.equal(usablePlanningCapacity(2000, 1650), 1650);
  assert.equal(usablePlanningCapacity(1000, 1650), 1000);
  assert.equal(usablePlanningCapacity(null, 1650), null);
});

test("allocation preserves whole governed recommendations, leaves unused budget, and can continue to a later cheaper item", () => {
  const plan = buildStockPurchasingPlan([candidate("urgent", { landedCostPerPackGbp: 600, recommendedPackCount: 2, stockState: "OUT OF STOCK" }), candidate("cheap", { landedCostPerPackGbp: 100, recommendedPackCount: 1, stockState: "REORDER ATTENTION" })], 700, 900);
  assert.equal(plan.items.find((item) => item.recommendationId === "urgent")?.planningState, "DEFERRED — BUDGET");
  assert.equal(plan.items.find((item) => item.recommendationId === "cheap")?.planningState, "ALLOCATED");
  assert.equal(plan.items.find((item) => item.recommendationId === "urgent")?.recommendedPackCount, 2);
  assert.equal(plan.unallocatedBudgetGbp, 600);
});

test("urgency, then pack fit, then stable identity produce deterministic allocation order", () => {
  const plan = buildStockPurchasingPlan([candidate("z", { stockState: "REORDER NOW", packFit: "REVIEW" }), candidate("a", { stockState: "OUT OF STOCK", packFit: "REVIEW" }), candidate("b", { stockState: "OUT OF STOCK", packFit: "GOOD FIT" })], 1000, 1000);
  assert.deepEqual(plan.items.map((item) => item.recommendationId), ["b", "a", "z"]);
});

test("incomplete cost, untrusted, and zero recommendations cannot allocate", () => {
  const plan = buildStockPurchasingPlan([candidate("cost", { landedCostPerPackGbp: null }), candidate("untrusted", { trusted: false }), candidate("zero", { recommendedPackCount: 0, recommendedTotalUnits: 0 })], 1000, 1000);
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].planningState, "BLOCKED — COST EVIDENCE");
});

test("wallet capacity cannot be bypassed and supplier identities remain separate for existing draft handoff", async () => {
  const plan = buildStockPurchasingPlan([candidate("a"), candidate("b")], 1000, 100);
  assert.ok(plan.items.every((item) => item.planningState === "BLOCKED — WALLET"));
  assert.notEqual(plan.items[0].supplierId, plan.items[1].supplierId);
  const source = await (await import("node:fs/promises")).readFile(new URL("../app/purchase-intelligence/StockPurchasingPlanPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /addAllocatedStockPurchasingPlanRecommendationAction\(\{ styleId, parentProductId, idempotencyKey/);
  assert.doesNotMatch(source, /recommendedPackCount:/);
  assert.doesNotMatch(source, /recommendedTotalUnits:/);
});

test("Draft PO feedback surfaces pending, result links, and fail-closed errors without changing handoff arguments", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../app/purchase-intelligence/StockPurchasingPlanPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(pending\) return;/);
  assert.match(source, /disabled=\{pending\}/);
  assert.match(source, /pending \? "Adding…" : "Add to Draft PO"/);
  assert.match(source, /result\.success \? \{ status: "success", purchaseOrderId: result\.purchaseOrderId \}/);
  assert.match(source, /href=\{`\/purchase-orders\/\$\{feedback\.purchaseOrderId\}`\}/);
  assert.match(source, /role="alert"/);
  assert.match(source, /addAllocatedStockPurchasingPlanRecommendationAction\(\{ styleId, parentProductId, idempotencyKey/);
  assert.doesNotMatch(source, /recommendedPackCount:/);
  assert.doesNotMatch(source, /recommendedTotalUnits:/);
});

test("missing Stock Purchasing Budget is blocked as budget before wallet availability", () => {
  const budgetMissingWalletAvailable = buildStockPurchasingPlan([candidate("budget-only")], null, 1000).items[0];
  const bothMissing = buildStockPurchasingPlan([candidate("both")], null, null).items[0];
  assert.equal(budgetMissingWalletAvailable.planningState, "BLOCKED — BUDGET");
  assert.match(budgetMissingWalletAvailable.planningReason, /Stock Purchasing Budget/);
  assert.equal(bothMissing.planningState, "BLOCKED — BUDGET");
});

test("wallet blockers remain distinct once the Stock Purchasing Budget is available", () => {
  const walletUnavailable = buildStockPurchasingPlan([candidate("wallet-unavailable")], 1000, null).items[0];
  const walletInsufficient = buildStockPurchasingPlan([candidate("wallet-insufficient")], 1000, 100).items[0];
  const bothAvailable = buildStockPurchasingPlan([candidate("available")], 1000, 1000).items[0];
  assert.equal(walletUnavailable.planningState, "BLOCKED — WALLET");
  assert.match(walletUnavailable.planningReason, /purchasing-wallet/);
  assert.equal(walletInsufficient.planningState, "BLOCKED — WALLET");
  assert.equal(bothAvailable.planningState, "ALLOCATED");
});

test("budget model stays separate from the wallet and is private to service access", async () => {
  const migration = await (await import("node:fs/promises")).readFile(new URL("../../../supabase/migrations/20261047000000_stock_purchasing_budget.sql", import.meta.url), "utf8");
  assert.match(migration, /vault_stock_purchasing_budget/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all .* anon, authenticated/);
  assert.match(migration, /grant select, insert, update .* service_role/);
  assert.doesNotMatch(migration, /vault_purchasing_wallet/);
});

test("Stage 4 handoff re-runs current allocation and passes the same current recommendation set into the fixed-pack writer", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../lib/stock-purchasing-plan-handoff.ts", import.meta.url), "utf8");
  assert.match(source, /Promise\.all\(\[dependencies\.loadRecommendations\(\), dependencies\.loadCatalogue\(\), dependencies\.loadBudget\(\), dependencies\.loadWalletCapacity\(\)\]\)/);
  assert.match(source, /buildStockPurchasingPlan\(candidates\(recommendations, catalogue\), budgetGbp, walletCapacityGbp\)/);
  assert.match(source, /planningState === "ALLOCATED"/);
  assert.match(source, /addFixedPackRecommendationToDraftUsingRecommendationsFrom\(operatorId, input, recommendations/);
  assert.doesNotMatch(source, /recommendedPackCount:\s*input|recommendedTotalUnits:\s*input|packCost.*input/);
});

test("a current whole recommendation remains allowed only when it is allocated, while changed budget, wallet, and cost defer it", () => {
  const base = candidate("current", { landedCostPerPackGbp: 100, recommendedPackCount: 2 });
  assert.equal(buildStockPurchasingPlan([base], 200, 200).items[0].planningState, "ALLOCATED");
  assert.notEqual(buildStockPurchasingPlan([{ ...base, recommendedPackCount: 3 }], 200, 200).items[0].planningState, "ALLOCATED");
  assert.notEqual(buildStockPurchasingPlan([base], 100, 200).items[0].planningState, "ALLOCATED");
  assert.notEqual(buildStockPurchasingPlan([base], 200, 100).items[0].planningState, "ALLOCATED");
});
