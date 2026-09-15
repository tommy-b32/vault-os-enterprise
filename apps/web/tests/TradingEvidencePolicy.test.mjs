import assert from "node:assert/strict";
import test from "node:test";
import { classifyTradingEvidence, hasStrongEarlyDemand, TRADING_EVIDENCE_POLICY } from "../lib/brain/TradingEvidencePolicy.ts";

const evidence = (overrides = {}) => ({ verifiedLiveDays: 2, verifiedCoverageDays: 2, coverageComplete: true, orderEvidenceFresh: true, firstPositiveSaleAt: null, sellingDays: 0, unitsSinceLive: 0, ...overrides });

test("trading maturity uses explicit verified-live and coverage boundaries", () => {
  assert.equal(classifyTradingEvidence(evidence()).state, "LEARNING");
  assert.equal(classifyTradingEvidence(evidence({ verifiedLiveDays: 6, verifiedCoverageDays: 6 })).state, "LEARNING");
  assert.equal(classifyTradingEvidence(evidence({ verifiedLiveDays: 7, verifiedCoverageDays: 7 })).state, "DEVELOPING_EVIDENCE");
  assert.equal(classifyTradingEvidence(evidence({ verifiedLiveDays: 27, verifiedCoverageDays: 27 })).state, "DEVELOPING_EVIDENCE");
  assert.equal(classifyTradingEvidence(evidence({ verifiedLiveDays: 28, verifiedCoverageDays: 28 })).state, "SUFFICIENT_EVIDENCE");
  assert.equal(classifyTradingEvidence(evidence({ verifiedLiveDays: 28, verifiedCoverageDays: 27 })).state, "DEVELOPING_EVIDENCE");
  assert.equal(classifyTradingEvidence(evidence({ verifiedLiveDays: 28, verifiedCoverageDays: 28, coverageComplete: false })).state, "UNKNOWN");
  assert.equal(classifyTradingEvidence(evidence({ verifiedLiveDays: 60, verifiedCoverageDays: 28, orderEvidenceFresh: false })).state, "UNKNOWN");
  assert.equal(classifyTradingEvidence(evidence({ verifiedLiveDays: 2, verifiedCoverageDays: 2, orderEvidenceFresh: false })).state, "UNKNOWN");
  assert.equal(TRADING_EVIDENCE_POLICY.sufficientVerifiedLiveDays, 28);
});

test("early volume informs presentation but never advances maturity", () => {
  const fast = { ...evidence({ unitsSinceLive: 20, sellingDays: 3 }), ...classifyTradingEvidence(evidence({ unitsSinceLive: 20, sellingDays: 3 })) };
  assert.equal(fast.state, "LEARNING");
  assert.equal(hasStrongEarlyDemand(fast), true);
});

test("fresh canonical order evidence is mandatory for every maturity stage", () => {
  assert.equal(classifyTradingEvidence(evidence({ verifiedLiveDays: 60, verifiedCoverageDays: 28, sellingDays: 0, unitsSinceLive: 0 })).state, "SUFFICIENT_EVIDENCE");
  assert.equal(classifyTradingEvidence(evidence({ verifiedLiveDays: 60, verifiedCoverageDays: 28, orderEvidenceFresh: false })).state, "UNKNOWN");
  assert.equal(classifyTradingEvidence(evidence({ verifiedLiveDays: null, verifiedCoverageDays: null, orderEvidenceFresh: false })).state, "UNKNOWN");
  assert.equal(classifyTradingEvidence(evidence({ verifiedLiveDays: 15, verifiedCoverageDays: 15, orderEvidenceFresh: false })).state, "UNKNOWN");
  assert.equal(classifyTradingEvidence(evidence({ verifiedLiveDays: 2, verifiedCoverageDays: 2, orderEvidenceFresh: false })).state, "UNKNOWN");
});
