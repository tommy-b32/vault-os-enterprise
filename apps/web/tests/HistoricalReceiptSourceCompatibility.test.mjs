import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../../supabase/migrations/20260921000000_historical_receipt_source_compatibility.sql", import.meta.url), "utf8");
const preflight = await readFile(new URL("../../../scripts/b22-fixed-pack-receiving-preflight.sql", import.meta.url), "utf8");

test("B22E promotes only the historical advisor default into the aggregate branch", () => {
  assert.match(migration, /'advisor'.*'purchase_intelligence_required'.*'purchase_intelligence_bring_forward'.*'fixed_pack_purchase_recommendation'.*'manual_fixed_pack_purchase'/s);
  assert.match(migration, /pg_get_functiondef/);
  assert.match(migration, /B22C receipt source classification was not found/);
  assert.match(migration, /grant execute[\s\S]*service_role/);
  assert.doesNotMatch(migration, /anything not fixed|else.*legacy/i);
});

test("B22D preflight accepts advisor and still flags unknown receiving sources", () => {
  assert.match(preflight, /'advisor','purchase_intelligence_required','purchase_intelligence_bring_forward'/);
  assert.match(preflight, /RECEIVABLE_LEGACY_SOURCE_UNSUPPORTED_BY_B22C/);
});
