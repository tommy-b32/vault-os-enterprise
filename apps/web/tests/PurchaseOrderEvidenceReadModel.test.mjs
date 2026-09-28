import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../lib/purchase-orders/PurchaseOrderRepository.ts", import.meta.url),
  "utf8",
);
const method = source.slice(
  source.indexOf("getPurchaseOrderEvidenceState"),
  source.indexOf("export async function getPurchaseOrder("),
);

test("PO evidence read model preserves governed current-state and completeness contracts", () => {
  assert.match(method, /vault_purchase_order_freight_evidence/);
  assert.match(method, /vault_purchase_order_current_fx_commitment/);
  assert.match(method, /vault_purchase_order_landed_cost_completeness/);
  assert.match(method, /supersedes_evidence_id === evidence\.id/);
  assert.match(method, /currentFreight\.length === 1/);
  assert.match(method, /currentFreight\.length === 0/);
  assert.match(method, /"conflicting"/);
  assert.match(method, /rawFxState !== "available" && rawFxState !== "missing" && rawFxState !== "conflicting"/);
  assert.match(method, /if \(rawFxState === "available"\)/);
  assert.match(method, /fxEvidence: PurchaseOrderEvidenceState\["fxCommitment"\]\["evidence"\] = null/);
  for (const field of [
    "supplier_liability_amount",
    "fx_rate_to_gbp",
    "gbp_commitment_amount",
    "liability_evidence_mode",
    "source_evidence_snapshot",
    "captured_at",
  ]) {
    assert.match(method, new RegExp(field));
  }
  assert.match(method, /rawCompleteness !== "complete_landed_cost" && rawCompleteness !== "landed_cost_pending"/);
  assert.match(method, /landedCostCompleteness: rawCompleteness/);
  assert.doesNotMatch(method, /estimated_total_gbp|actual_total_gbp|line_cost_gbp|pack_cost_gbp|freight.*\/|supplierLiabilityAmount \*/);
});
