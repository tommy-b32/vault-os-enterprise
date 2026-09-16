import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Buying decision reasons are a projection of the completed authoritative evaluation", async () => {
  const summary = await read("lib/brain/BuyingDecisionReasonSummary.ts");
  const purchase = await read("lib/brain/PurchaseIntelligenceEngine.ts");

  assert.match(summary, /PurchaseIntelligenceEvaluation/);
  assert.match(summary, /TrustedBuyingCandidateRejectionReason/);
  assert.match(summary, /evaluation\.demands/);
  assert.match(summary, /evaluation\.candidates/);
  assert.match(summary, /evaluation\.qualifications/);
  assert.doesNotMatch(summary, /supabaseAdmin|\.from\(/);
  assert.match(purchase, /TrustedBuyingCandidateClassifier\.classify/);
});

test("every classifier reason is represented while demand semantics retain their distinction", async () => {
  const summary = await read("lib/brain/BuyingDecisionReasonSummary.ts");

  assert.match(summary, /Record<TrustedBuyingCandidateRejectionReason, ReasonMetadata>/);
  for (const code of ["canonical_product_missing", "invalid_or_missing_commercial_cost", "supplier_minimum_unknown", "wallet_stale", "protected_reserve_breach"]) assert.match(summary, new RegExp(code));
  assert.match(summary, /code: `demand_\$\{status\}`/);
  assert.match(summary, /status === "no_replenishment_required"/);
  assert.match(summary, /NO_ACTION_REQUIRED/);
  assert.match(summary, /status === "evidence_unavailable"/);
  assert.match(summary, /GATHERING_EVIDENCE/);
  assert.match(summary, /quantity_not_positive/);
});

test("presentation precedence preserves every reason and never changes eligibility", async () => {
  const summary = await read("lib/brain/BuyingDecisionReasonSummary.ts");

  assert.match(summary, /primaryReasons/);
  assert.match(summary, /Presentation precedence only/);
  assert.doesNotMatch(summary, /candidate\.eligible\s*=/);
  assert.match(summary, /trustedCandidateCount = evaluation\.candidates\.filter\(\(candidate\) => candidate\.eligible\)/);
  assert.match(summary, /qualification\.blockers/);
});

test("Timeline, Command Centre lineage, and Vault Brain consume the propagated summary", async () => {
  const timeline = await read("lib/brain/CommercialDecisionTimeline.ts");
  const loader = await read("lib/brain/getCommercialDecisionTimeline.ts");
  const brain = await read("lib/brain/getVaultBrainIntelligence.ts");
  const component = await read("components/brain/VaultBrainV2.tsx");

  assert.match(loader, /BuyingDecisionReasonSummary\.build\(evaluation, generatedAt\)/);
  assert.match(timeline, /reasonSummary/);
  assert.match(timeline, /reasonSummaryItems/);
  assert.match(brain, /timeline\?\.reasonSummary/);
  assert.match(component, /GOVERNED DECISION REASONS/);
  assert.match(component, /does not create a buying, reorder, or approval recommendation/);
});
