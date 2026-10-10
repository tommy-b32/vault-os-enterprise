import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../..\/", import.meta.url);
const fixtureRoot = new URL("apps/web/tests/fixtures/replay-compat/", root);
const migrationRoot = new URL("supabase/migrations/", root);
const stageScript = new URL("scripts/baseline-replay/Stage-ReplayHistoricalFoundations.ps1", root);
const foundations = [
  "20260722000000_historical_catalogue_intelligence_foundation.sql",
  "20260722010000_compatibility_recovered_style_catalogue.sql",
];

test("historical catalogue foundations are replay-only fixtures staged in deterministic order", async () => {
  const script = await readFile(stageScript, "utf8");
  assert.ok(script.indexOf(foundations[0]) < script.indexOf(foundations[1]));
  assert.match(script, /apps\\web\\tests\\fixtures\\replay-compat/);
  assert.match(script, /supabase\\migrations/);
  for (const foundation of foundations) {
    const fixture = await readFile(new URL(foundation, fixtureRoot), "utf8");
    assert.match(fixture, /REPLAY COMPATIBILITY BOOTSTRAP/);
    await assert.rejects(stat(new URL(foundation, migrationRoot)));
  }
});
