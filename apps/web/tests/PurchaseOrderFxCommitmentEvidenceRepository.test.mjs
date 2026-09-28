import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../lib/purchase-orders/PurchaseOrderRepository.ts", import.meta.url),
  "utf8",
);
const method = source.slice(
  source.indexOf("recordPurchaseOrderFxCommitmentEvidence"),
  source.indexOf("export async function recordPurchaseOrderReceipt"),
);

test("FX commitment repository maps explicit supplier liability evidence without PO or product cost writes", () => {
  assert.match(method, /record_purchase_order_fx_commitment_evidence/);
  assert.match(method, /supplierLiabilityAmount: number/);
  assert.match(method, /fxRateToGbp: number/);
  assert.match(method, /source_currency: sourceCurrency/);
  assert.match(method, /supplier_liability_amount: input\.supplierLiabilityAmount/);
  assert.match(method, /fx_rate_to_gbp: input\.fxRateToGbp/);
  assert.match(method, /operator_supplied_supplier_liability_evidence/);
  for (const field of [
    "purchase_order_id",
    "supplier_id",
    "operator_id",
    "source_currency",
    "supplier_liability_amount",
    "fx_rate_to_gbp",
    "gbp_commitment_amount",
    "liability_evidence_mode",
    "source_evidence_snapshot",
    "source_note",
    "idempotency_key",
  ]) {
    assert.match(method, new RegExp(field));
  }
  assert.doesNotMatch(method, /0\.745755/);
  assert.doesNotMatch(
    method,
    /estimated_total_gbp|actual_total_gbp|line_cost_gbp|pack_cost_gbp|allocation/,
  );
});
