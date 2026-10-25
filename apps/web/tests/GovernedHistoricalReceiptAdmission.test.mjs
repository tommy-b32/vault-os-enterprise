import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migration = new URL("../../../supabase/migrations/20261113000000_governed_historical_receipt_admission_controls.sql", import.meta.url);

test("receipt admission requires provenance and rejects legacy duplicates without policy linkage", async () => {
  const sql = await readFile(migration, "utf8");
  for (const text of [
    "vault_historical_delivery_source_document_required",
    "DUPLICATE_LEGACY_HISTORICAL_BATCH_EVIDENCE",
    "vault_historical_supplier_batch_evidence legacy",
    "legacy.merchandise_class_id = new.merchandise_class_id",
    "new.goods_cost_gbp + new.inbound_shipping_gbp + new.other_direct_landed_gbp",
    "GOVERNED_APPROVAL_EVIDENCE_INCOMPLETE",
    "source_document_reference",
    "approved_by_operator_id",
    "vault_historical_delivery_cost_batch_approvals",
  ]) assert.match(sql, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(sql, /vault_historical_cogs_policy_batch_evidence\s*\(/);
});
