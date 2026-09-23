import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildFinancialIntelligenceSnapshot, financialPeriodFromSearch, financialRangeForPeriod } from "./FinancialIntelligence.ts";

const at = "2026-09-23T12:00:00.000Z";
const verified = (id, amount = 100, refundTotal = 0, refundReconciliationStatus = "not_applicable") => ({
  orderId: id, shopifyOrderId: `gid://shopify/Order/${id}`, createdAt: at, sourceUpdatedAt: at, currency: "GBP", canonicalNetRevenue: amount,
  discountAllocationTotal: 10, refundTotal, refundLineMerchandiseTotal: refundTotal, refundLineTaxTotal: 0, refundReconciliationStatus,
  completenessEvidenceMode: "historical", completenessObservedAt: at, completenessSourceContentFingerprint: "fingerprint",
});
const canonical = (id, amount = 100, currency = "GBP") => ({ id, createdAt: at, currency, canonicalNetRevenue: amount });
const range = { from: "2026-09-22T23:00:00.000Z", to: "2026-09-23T23:00:00.000Z" };

test("Financial Intelligence uses Europe/London calendar boundaries", () => {
  assert.deepEqual(financialRangeForPeriod("today", new Date("2026-03-29T12:00:00Z")), { from: "2026-03-29T00:00:00.000Z", to: "2026-03-29T23:00:00.000Z" });
  assert.deepEqual(financialRangeForPeriod("today", new Date("2026-03-30T12:00:00Z")), { from: "2026-03-29T23:00:00.000Z", to: "2026-03-30T23:00:00.000Z" });
  assert.equal(financialPeriodFromSearch("invalid"), "30d");
});

test("Financial Intelligence rejects invalid chronological ranges", () => {
  assert.throws(() => buildFinancialIntelligenceSnapshot({ from: "not-a-date", to: range.to }, [], []), /Invalid Financial Intelligence date range/);
});

test("Financial Intelligence totals only verified canonical net revenue and keeps refunds separate", () => {
  const snapshot = buildFinancialIntelligenceSnapshot(range, [canonical("one", 100), canonical("two", 40)], [verified("one", 100, 25, "reconciled"), verified("two", 40)]);
  assert.equal(snapshot.verifiedNetRevenue, 140);
  assert.equal(snapshot.refundHeaderTotal, 25);
  assert.equal(snapshot.verifiedOrderCount, 2);
  assert.equal(snapshot.reconciliationPassed, true);
});

test("Financial Intelligence reports empty and incomplete coverage without fabricating revenue", () => {
  const empty = buildFinancialIntelligenceSnapshot(range, [], []);
  assert.equal(empty.verifiedNetRevenue, 0);
  assert.equal(empty.coverageComplete, true);
  const incomplete = buildFinancialIntelligenceSnapshot(range, [canonical("verified"), canonical("missing")], [verified("verified")]);
  assert.equal(incomplete.incompleteOrderCount, 1);
  assert.equal(incomplete.coverageComplete, false);
  assert.equal(incomplete.reconciliationPassed, false);
});

test("Financial Intelligence excludes unsupported currencies and flags unreconciled refund evidence", () => {
  const snapshot = buildFinancialIntelligenceSnapshot(range, [canonical("gbp"), canonical("usd", 40, "USD")], [verified("gbp", 100, 15, "unreconciled")]);
  assert.equal(snapshot.excludedOrderCount, 1);
  assert.equal(snapshot.incompleteOrderCount, 0);
  assert.equal(snapshot.unreconciledRefundOrderCount, 1);
  assert.deepEqual(snapshot.currencyCodes, ["GBP", "USD"]);
});

test("Financial Intelligence fails closed on duplicate or mismatched verified records", () => {
  assert.throws(() => buildFinancialIntelligenceSnapshot(range, [canonical("one")], [verified("one"), verified("one")]), /reconciliation failed/);
  assert.throws(() => buildFinancialIntelligenceSnapshot(range, [canonical("one", 100)], [verified("one", 99)]), /reconciliation failed/);
  assert.throws(() => buildFinancialIntelligenceSnapshot(range, [canonical("one")], [verified("unknown")]), /reconciliation failed/);
});

test("Financial Intelligence repositories are read-only and integrate the verified view", async () => {
  const [repository, page, loading, navigation] = await Promise.all([
    readFile(new URL("FinancialIntelligenceRepository.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/financial-intelligence/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/financial-intelligence/loading.tsx", import.meta.url), "utf8"),
    readFile(new URL("../navigation.ts", import.meta.url), "utf8"),
  ]);
  assert.match(repository, /ShopifyFinancialReadModelRepository\.getByCreatedAtRange/);
  assert.match(repository, /from\("vault_shopify_orders"\)/);
  assert.doesNotMatch(repository, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  assert.match(page, /requireAuthenticatedOperator/);
  assert.match(page, /No revenue is shown while verification is unavailable/);
  assert.doesNotMatch(page, /error instanceof Error/);
  assert.match(loading, /Loading verified financial facts/);
  assert.match(navigation, /href: "\/financial-intelligence"/);
});
