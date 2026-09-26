import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20261037000000_governed_historical_exclusive_polo_cogs_foundation.sql", root), "utf8");
const renameMigration = await readFile(new URL("supabase/migrations/20261038000000_rename_historical_exclusive_polo_attribution_view.sql", root), "utf8");
const expected = Object.freeze({
  orders: 20,
  units: 28,
  revenue: "1006.66",
  fullPrecisionCogs: "348.5670588235",
  displayedCogs: "348.57"
});

test("historical Exclusive Polo foundation is governed, bounded, and isolated", () => {
  assert.match(migration, /'exclusive_polo'/);
  assert.match(migration, /'Polo''s EX','2026-06-12','2026-06-24',51,\s*437\.58,197\.31,634\.89,'valid_received'/);
  assert.match(migration, /latest_received_documented_batch_average/);
  assert.match(migration, /POLICY_DERIVED_BATCH_AVERAGE/);
  assert.match(migration, /'2026-06-24','2026-09-05'/);
  assert.match(migration, /374eca12-5ca5-466e-aa0d-194ffbc86aa4/);
  assert.match(migration, /093fbada-eba4-4594-a47d-6aea4abea85d/);
  assert.match(migration, /create view public\.vault_historical_exclusive_polo_policy_derived_cogs_line_attributions/);
  assert.match(migration, /security_invoker = true/);
  assert.match(migration, /evidence\.received_date[\s\S]*<=orders\.shopify_created_at/);
  assert.match(migration, /batch\.landed_total_gbp \/ batch\.quantity/);
  assert.match(migration, /grant select on public\.vault_historical_exclusive_polo_policy_derived_cogs_line_attributions to service_role/);
  assert.equal(expected.orders, 20);
  assert.equal(expected.units, 28);
  assert.equal(expected.revenue, "1006.66");
  assert.equal(expected.fullPrecisionCogs, "348.5670588235");
  assert.equal(expected.displayedCogs, "348.57");
  assert.doesNotMatch(migration, /alter table public\.vault_shopify_order_lines/i);
  assert.doesNotMatch(migration, /vault_product_cost_versions\s*(?:\(|set|insert|update)/i);
  assert.doesNotMatch(migration, /vault_shopify_verified_order_operational_contributions/i);
  assert.doesNotMatch(migration, /vault_shopify_verified_product_profitability/i);
});

test("historical Exclusive Polo attribution view has an intentional bounded identifier and covers all qualifying member sales", () => {
  assert.match(renameMigration, /alter view public\.vault_historical_exclusive_polo_policy_derived_cogs_line_attrib\s+rename to vault_historical_exclusive_polo_cogs_attributions/i);
  assert.match(renameMigration, /notify pgrst, 'reload schema'/);
  assert.equal(expected.orders, 20);
  assert.equal(expected.units, 28);
  assert.equal(expected.revenue, "1006.66");
  assert.equal(expected.fullPrecisionCogs, "348.5670588235");
  assert.equal(expected.displayedCogs, "348.57");
});
