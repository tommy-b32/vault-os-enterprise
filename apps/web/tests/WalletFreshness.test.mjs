import assert from "node:assert/strict";
import test from "node:test";

import { WalletFreshness } from "../lib/brain/WalletFreshness.ts";

test("wallet freshness evaluates current evidence", () => {
  const result = WalletFreshness.evaluate({
    evidenceTimestamp: "2026-08-15T11:00:00.000Z",
    thresholdMinutes: 1440,
    evaluatedAt: "2026-08-15T12:00:00.000Z",
  });
  assert.equal(result.status, "current");
  assert.equal(result.provenance, "vault_purchasing_policy");
});

test("wallet freshness evaluates stale evidence", () => {
  const result = WalletFreshness.evaluate({
    evidenceTimestamp: "2026-08-13T11:00:00.000Z",
    thresholdMinutes: 1440,
    evaluatedAt: "2026-08-15T12:00:00.000Z",
  });
  assert.equal(result.status, "stale");
});

test("wallet freshness is unknown without timestamp or policy", () => {
  assert.equal(WalletFreshness.evaluate({
    evidenceTimestamp: null,
    thresholdMinutes: 1440,
    evaluatedAt: "2026-08-15T12:00:00.000Z",
  }).status, "unknown");
  assert.equal(WalletFreshness.evaluate({
    evidenceTimestamp: "2026-08-15T11:00:00.000Z",
    thresholdMinutes: null,
    evaluatedAt: "2026-08-15T12:00:00.000Z",
  }).status, "unknown");
});
