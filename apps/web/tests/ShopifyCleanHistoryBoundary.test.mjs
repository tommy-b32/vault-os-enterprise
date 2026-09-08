import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const sql = await readFile(new URL("../../../supabase/migrations/20260910000000_purchase_intelligence_option_identity.sql", import.meta.url), "utf8");
const view = sql.slice(sql.indexOf('create or replace view public.vault_style_replenishment_intelligence as'));
const boundary = "('2026-05-04 00:00:00'::timestamp AT TIME ZONE 'Europe/London')";
test("clean history boundary governs canonical and sales evidence", () => {
  assert.equal((view.match(new RegExp(boundary.replace(/[()]/g, '\\$&'), 'g')) ?? []).length, 2);
  assert.match(view, /canonical_history as \([\s\S]*?where shopify_created_at >=[\s\S]*?and cancelled_at is null[\s\S]*?metadata ->> 'test'/);
  assert.match(view, /style_sales as \([\s\S]*?orders\.shopify_created_at >=[\s\S]*?orders\.shopify_created_at < sync\.completed_at/);
  assert.match(view, /history\.earliest_order_at <= sync\.completed_at - interval '30 days'/);
});
test("London boundary excludes May 3 imports and retains valid May 4 evidence", () => {
  const start = Date.parse('2026-05-03T23:00:00Z');
  assert.equal(Date.parse('2026-05-03T22:59:59Z') >= start, false);
  assert.equal(Date.parse('2026-05-03T23:00:00Z') >= start, true);
  assert.equal(Date.parse('2026-05-04T00:00:00Z') >= start, true);
  assert.match(view, /v\.model_design[\s\S]*?identity_resolution_status = 'resolved'/);
  assert.doesNotMatch(view, /v\.option_1/);
});
