import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const engineUrl = new URL("../lib/brain/PurchaseIntelligenceEngine.ts", import.meta.url);
const pageUrl = new URL("../app/purchase-intelligence/page.tsx", import.meta.url);
const diagnosticsUrl = new URL("../lib/brain/PurchaseIntelligenceDiagnostics.ts", import.meta.url);

test("purchase intelligence uses only canonical decision contracts", async () => {
  const source = await readFile(engineUrl, "utf8");
  assert.match(source, /DemandIntelligenceEngine\.evaluate/);
  assert.match(source, /CapitalEngine\.reviewPosition/);
  assert.match(source, /SupplierMinimumContract\.create/);
  assert.doesNotMatch(source, /BuyingRecommendationEngine/);
  assert.doesNotMatch(source, /Math\.random|Date\.now|fetch\(/);
});

test("diagnostics expose every requested supplier trust dimension without changing recommendations", async () => {
  const [diagnostics, page, engine] = await Promise.all([
    readFile(diagnosticsUrl, "utf8"),
    readFile(pageUrl, "utf8"),
    readFile(engineUrl, "utf8"),
  ]);
  for (const field of [
    "evaluated", "needsReplenishment", "genuineNoReorder", "evidenceUnavailable",
    "excludedByStrategy", "purchasingEligible", "purchasingBlocked",
    "demandMissingRequirements", "purchasingBlockers", "finalRecommendationStatus",
  ]) assert.match(diagnostics, new RegExp(field));
  assert.match(diagnostics, /evaluation\.demands/);
  assert.match(page, /diagnostics\.map/);
  assert.match(page, /recommendations\.map/);
  assert.doesNotMatch(diagnostics + page + engine, /insert\(|update\(|delete\(/);
});

test("trust classification consumes canonical demand outcomes without disguising unavailable evidence", async () => {
  const source = await readFile(new URL("../lib/brain/PurchaseIntelligenceTrust.ts", import.meta.url), "utf8");
  assert.match(source, /DemandIntelligenceEngine\.evaluate/);
  assert.match(source, /"excluded_by_strategy"/);
  assert.match(source, /"evidence_unavailable"/);
  assert.match(source, /OPERATOR_WARNING_REASONS/);
  assert.match(source, /"reorder_approval_missing"/);
  assert.match(source, /"supplier_minimum_not_evaluated"/);
  assert.match(source, /"wallet_freshness_policy_missing"/);
});

test("blocked catalogue and trust states cannot become recommendations", async () => {
  const [engine, classifier] = await Promise.all([
    readFile(engineUrl, "utf8"),
    readFile(new URL("../lib/brain/TrustedBuyingCandidateClassifier.ts", import.meta.url), "utf8"),
  ]);
  assert.match(classifier, /product\.inventory_strategy !== "stocked"/);
  assert.match(classifier, /!product\.configuration_trusted/);
  assert.match(classifier, /demand\.status === "evidence_unavailable"/);
  assert.match(classifier, /product\.reorder_approval\?\.approval_state !== "approved"/);
  assert.match(classifier, /!supplier\.active/);
  assert.match(engine, /demand\.status !== "needs_replenishment"/);
});

test("supplier recommendations require minima, capital and trusted confidence", async () => {
  const source = await readFile(engineUrl, "utf8");
  assert.match(source, /supplier_minimum_value_not_satisfied/);
  assert.match(source, /supplier_minimum_packs_not_satisfied/);
  assert.match(source, /!capital\.affordable/);
  assert.match(source, /!capital\.reserveProtected/);
  assert.match(source, /state !== "ready_to_purchase"/);
  assert.match(source, /confidence: "trusted"/);
});

test("Purchase Intelligence is read-only and checks live inventory freshness", async () => {
  const source = await readFile(pageUrl, "utf8");
  assert.match(source, /InventorySyncRepository\.getFreshness/);
  assert.match(source, /freshness\.syncStatus === "current"/);
  assert.match(source, /No purchase orders are created and no purchases are approved/);
  assert.doesNotMatch(source, /insert\(|update\(|delete\(|PurchaseOrderDraftWorkspace/);
});
