import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20261035000000_governed_historical_exclusive_tee_cogs_foundation.sql", root), "utf8");
const expectedReconciliation = Object.freeze({
  orders: 203,
  units: 390,
  revenueGbp: "14035.85",
  policyDerivedCogsGbp: "4479.011216300940",
  displayedPolicyDerivedCogsGbp: "4479.01",
});

test("historical Exclusive Tee foundation is immutable, policy-derived, and isolated from Stage 1", () => {
  for (const table of [
    "vault_historical_supplier_batch_evidence",
    "vault_historical_merchandise_class_memberships",
    "vault_historical_cogs_policies",
    "vault_historical_cogs_policy_versions",
    "vault_historical_cogs_policy_batch_evidence",
  ]) assert.match(migration, new RegExp(`create table public\\.${table}`));
  assert.match(migration, /create trigger historical_batch_evidence_immutable/);
  assert.match(migration, /create trigger historical_membership_immutable/);
  assert.match(migration, /LATEST_RECEIVED_DOCUMENTED_BATCH_AVERAGE/i);
  assert.match(migration, /POLICY_DERIVED_BATCH_AVERAGE/);
  assert.match(migration, /latest_received_documented_batch_average/);
  assert.match(migration, /security_invoker = true/);
  assert.match(migration, /grant select on public\.vault_historical_policy_derived_cogs_line_attributions to service_role/);
  assert.match(migration, /where link\.policy_version_id=version\.id[\s\S]*evidence\.received_date[\s\S]*<=orders\.shopify_created_at[\s\S]*order by evidence\.received_date desc/);
  assert.equal((migration.match(/Owner-supplied historical Exclusive Tee shipment record/g) ?? []).length, 6);
  assert.equal((migration.match(/,'valid_received','Owner-supplied historical Exclusive Tee shipment record/g) ?? []).length, 6);
  assert.match(migration, /policy_name,status\) values\(policy_id,[\s\S]*'governed_simulation_foundation'/);
  assert.match(migration, /membership_provenance,status\) values\(policy_version_id,[\s\S]*'governed_simulation_foundation'/);
  assert.match(migration, /'2026-08-06','2026-08-13',55,490\.48,222\.94,713\.42,'valid_received','Owner-supplied historical Exclusive Tee shipment record; valid received batch\. Owner confirmed the landed total was corrected from a manual transcription error before admission\.'/);
  assert.equal(expectedReconciliation.orders, 203);
  assert.equal(expectedReconciliation.units, 390);
  assert.equal(expectedReconciliation.revenueGbp, "14035.85");
  assert.equal(expectedReconciliation.policyDerivedCogsGbp, "4479.011216300940");
  assert.equal(expectedReconciliation.displayedPolicyDerivedCogsGbp, "4479.01");
  assert.equal((migration.match(/owner_attested_historical_classification/g) ?? []).length, 2);
  assert.doesNotMatch(migration, /alter table public\.vault_shopify_order_lines/);
  assert.doesNotMatch(migration, /vault_product_cost_versions\s*(?:\(|set|insert|update)/i);
  assert.doesNotMatch(migration, /vault_shopify_verified_product_profitability/);
});
