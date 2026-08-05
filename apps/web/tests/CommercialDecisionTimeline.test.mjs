import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  COMMERCIAL_TIMELINE_DESTINATIONS,
  CommercialDecisionTimeline,
} from "../lib/brain/CommercialDecisionTimeline.ts";
import { PredictionEngine } from "../lib/brain/PredictionEngine.ts";

const generatedAt = "2026-08-05T10:00:00.000Z";

function candidate({ eligible = false, reasons = ["inventory_stale"] } = {}) {
  return {
    styleId: "parent::Black",
    parentProductId: "parent",
    productName: "Product",
    supplierId: "supplier-1",
    supplierName: "Supplier",
    status: eligible ? "eligible" : "ineligible",
    eligible,
    rejectionReasons: reasons,
    suggestedQuantity: 3,
    capitalEvaluation: { walletLastUpdated: "2026-08-05T09:00:00.000Z" },
  };
}

function advisor(candidates, opportunity = null) {
  return {
    candidates,
    analysis: { highestPriority: opportunity },
  };
}

test("classifier blocker becomes an undated Blocked item", () => {
  const candidates = [candidate()];
  const result = CommercialDecisionTimeline.build({
    advisor: advisor(candidates), candidates, generatedAt,
  });
  const item = result.items.find((entry) => entry.id === "classifier-inventory_stale");
  assert.equal(item.status, "blocked");
  assert.equal(item.deadlineAt, null);
  assert.ok(result.groups.find((group) => group.label === "Blocked").items.includes(item));
});

test("trusted Advisor opportunity becomes the actionable decision", () => {
  const candidates = [candidate({ eligible: true, reasons: [] })];
  const opportunity = {
    id: "parent::Black",
    title: "Reorder Product",
    description: "Canonical recommendation",
    priority: "critical",
    estimatedProfit: 75,
    confidence: 91,
  };
  const result = CommercialDecisionTimeline.build({
    advisor: advisor(candidates, opportunity), candidates, generatedAt,
  });
  assert.equal(result.highestPriorityAction.title, "Reorder Product");
  assert.equal(result.highestPriorityAction.confidence, 91);
  assert.equal(result.highestPriorityAction.confidenceMeaning, "Advisor opportunity ranking confidence.");
});

test("no Advisor opportunity does not fabricate a decision", () => {
  const candidates = [candidate()];
  const result = CommercialDecisionTimeline.build({
    advisor: advisor(candidates), candidates, generatedAt,
  });
  assert.equal(result.highestPriorityAction, null);
  assert.equal(result.items.some((item) => item.category === "decision"), false);
});

test("stale inventory and unknown minimum do not invent future dates", () => {
  const candidates = [candidate({
    reasons: ["inventory_stale", "supplier_minimum_unknown"],
  })];
  const result = CommercialDecisionTimeline.build({
    advisor: advisor(candidates), candidates, generatedAt,
  });
  for (const item of result.items.filter((entry) => entry.status === "blocked")) {
    assert.equal(item.deadlineAt, null);
    assert.equal(item.predictedAt, null);
  }
});

function predictionInput(overrides = {}) {
  return {
    id: "prediction-1",
    category: "inventory",
    title: "Supported inventory horizon",
    summary: "Supported by canonical evidence.",
    source: "inventory",
    direction: "risk",
    tone: "warning",
    window: {
      label: "Next seven days",
      startsAt: "2026-08-06T00:00:00.000Z",
      endsAt: "2026-08-13T00:00:00.000Z",
      days: 7,
    },
    baseConfidence: 80,
    recommendation: { title: "Review", explanation: "Review evidence", actionHref: "/inventory" },
    evidence: [{
      id: "evidence-1",
      source: "inventory",
      label: "Inventory observation",
      explanation: "Canonical timestamped observation",
      confidence: 80,
    }],
    ...overrides,
  };
}

test("unsupported predictions are excluded and supported windows are included", () => {
  const supported = PredictionEngine.analyse([predictionInput()], generatedAt);
  const unsupported = PredictionEngine.analyse([
    predictionInput({ evidence: [], recommendation: { title: "Review", explanation: "No route" } }),
  ], generatedAt);
  const candidates = [candidate()];
  const included = CommercialDecisionTimeline.build({
    advisor: advisor(candidates), candidates, predictions: supported, generatedAt,
  });
  const excluded = CommercialDecisionTimeline.build({
    advisor: advisor(candidates), candidates, predictions: unsupported, generatedAt,
  });
  assert.ok(included.items.some((item) => item.source === "prediction"));
  assert.equal(excluded.items.some((item) => item.source === "prediction"), false);
});

test("unsupported confidence stays null and destinations are real routes", () => {
  const candidates = [candidate({ reasons: ["supplier_minimum_unknown"] })];
  const result = CommercialDecisionTimeline.build({
    advisor: advisor(candidates), candidates, generatedAt,
  });
  assert.ok(result.items.every((item) =>
    item.destination === null || COMMERCIAL_TIMELINE_DESTINATIONS.includes(item.destination)));
  assert.ok(result.items.filter((item) => item.source !== "advisor")
    .every((item) => item.confidence === null));
});

test("Business Feed is not copied and timeline has no engine cycle", async () => {
  const [timeline, advisorSource, classifierSource] = await Promise.all([
    readFile(new URL("../lib/brain/CommercialDecisionTimeline.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/brain/AdvisorEngine.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/brain/TrustedBuyingCandidateClassifier.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(timeline, /BusinessActivityRepository|shopify-order-created/);
  assert.doesNotMatch(advisorSource, /CommercialDecisionTimeline/);
  assert.doesNotMatch(classifierSource, /CommercialDecisionTimeline/);
  assert.doesNotMatch(timeline, /\.analyse\(|\.classify\(/);
});
