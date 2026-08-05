import assert from "node:assert/strict";
import test from "node:test";

import { ExecutiveIntelligenceEngine } from "./ExecutiveIntelligenceEngine.ts";

function input(overrides = {}) {
  return {
    businessPulse: { state: "attention", label: "Attention" },
    domains: [
      { domain: "Trading", state: "healthy", detail: "Canonical source current" },
      { domain: "Inventory", state: "attention", detail: "Source stale" },
      { domain: "Finance", state: "healthy", detail: "Purchasing capacity available" },
      { domain: "Marketing", state: "not_connected", detail: "Meta not connected" },
    ],
    todayFocus: {
      state: "available",
      source: "blocker",
      title: "Refresh inventory intelligence",
      description: "Inventory freshness is blocking trusted buying evidence.",
      destination: "/inventory",
      blockerReasons: ["inventory_stale"],
    },
    orderedBlockers: [
      { title: "Refresh inventory intelligence", description: "Inventory freshness is blocking trusted buying evidence." },
      { title: "Set supplier minimums", description: null },
      { title: "Complete target stock days", description: null },
      { title: "Fourth blocker", description: null },
    ],
    supportingEvidence: [
      "124 styles analysed.",
      "£7,740 purchasing power available.",
      "No trusted buying candidate is currently available.",
      "101 estimated total visitors today.",
      "Fifth fact.",
    ],
    ...overrides,
  };
}

test("builds the ExecutiveBriefing contract deterministically", () => {
  const first = ExecutiveIntelligenceEngine.build(input());
  const second = ExecutiveIntelligenceEngine.build(input());
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first), [
    "headline", "summary", "positives", "blockers", "todayFocus", "unlocks", "supportingEvidence",
  ]);
  assert.equal((first.headline.match(/[.!?]/g) ?? []).length, 1);
  assert.ok((first.summary.match(/[.!?]/g) ?? []).length <= 2);
});

test("limits canonical positives, blockers, unlocks and evidence", () => {
  const result = ExecutiveIntelligenceEngine.build(input());
  assert.ok(result.positives.length <= 3);
  assert.equal(result.blockers.length, 3);
  assert.ok(result.unlocks.length <= 3);
  assert.equal(result.supportingEvidence.length, 4);
});

test("reuses Today’s Focus and structured blocker consequences", () => {
  const source = input();
  const result = ExecutiveIntelligenceEngine.build(source);
  assert.deepEqual(result.todayFocus, source.todayFocus);
  assert.deepEqual(result.unlocks, [
    "Trusted inventory evidence becomes available for purchasing decisions.",
  ]);
});

test("does not invent an action or unlock when Today’s Focus is unavailable", () => {
  const result = ExecutiveIntelligenceEngine.build(input({
    todayFocus: { state: "unavailable" },
  }));
  assert.deepEqual(result.todayFocus, { state: "unavailable" });
  assert.deepEqual(result.unlocks, []);
  assert.match(result.summary, /No structured operator action/);
});
