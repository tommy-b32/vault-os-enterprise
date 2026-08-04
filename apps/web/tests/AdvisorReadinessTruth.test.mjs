import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const advisorPageUrl = new URL("../app/advisor/page.tsx", import.meta.url);

test("operational signals never become decision readiness or confidence", async () => {
  const source = await readFile(advisorPageUrl, "utf8");

  assert.doesNotMatch(source, /requirements ready/);
  assert.doesNotMatch(source, /readyRequirements/);
  assert.match(source, /readiness systems operational/);
  assert.match(source, /Trusted Buying Candidates/);
  assert.match(source, /trustedCandidates = diagnostics\.productsQualifying/);
  assert.match(source, /analysis\.averageConfidence/);
  assert.doesNotMatch(source, /advisorConfidence\s*=\s*operationalSignals/);
});

test("partial product coverage is represented separately", async () => {
  const source = await readFile(advisorPageUrl, "utf8");

  assert.match(source, /if \(ready === total\) return "operational"/);
  assert.match(source, /if \(ready > 0\) return "partial"/);
  assert.match(source, /Partial coverage/);
});

test("zero trusted quantity remains Not ready and renders no recommendation", async () => {
  const source = await readFile(advisorPageUrl, "utf8");

  assert.match(source, /analysis\.ranked\.length > 0[\s\S]*: "Not ready"/);
  assert.match(source, /primaryDecision \?/);
  assert.match(source, /No trusted buying candidate yet/);
  assert.match(source, /trustedQuantityProduced/);
});

test("stale inventory and unknown supplier minimums are routed blockers", async () => {
  const source = await readFile(advisorPageUrl, "utf8");

  assert.match(source, /diagnostics\.staleInventory/);
  assert.match(source, /Refresh inventory intelligence/);
  assert.match(source, /href: "\/inventory"/);
  assert.match(source, /diagnostics\.supplierMinimumUnknown/);
  assert.match(source, /Set supplier minimum-order rules/);
  assert.match(source, /href: "\/commercial"/);
});

test("Advisor and Purchase Orders consume the same trusted result", async () => {
  const [advisorPage, purchaseOrders] = await Promise.all([
    readFile(advisorPageUrl, "utf8"),
    readFile(new URL("../app/purchase-orders/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(advisorPage, /const primaryDecision = analysis\.highestPriority/);
  assert.match(advisorPage, /primaryCommercialInput/);
  assert.match(purchaseOrders, /AdvisorEngine\.analyse/);
  assert.match(purchaseOrders, /advisor\.analysis\.ranked/);
  assert.doesNotMatch(purchaseOrders, /BuyingRecommendationEngine/);
});
