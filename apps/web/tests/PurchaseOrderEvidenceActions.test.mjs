import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../app/purchase-orders/actions.ts", import.meta.url),
  "utf8",
);
const freightAction = source.slice(
  source.indexOf("recordPurchaseOrderFreightEvidenceAction"),
  source.indexOf("recordPurchaseOrderFxCommitmentEvidenceAction"),
);
const fxAction = source.slice(
  source.indexOf("recordPurchaseOrderFxCommitmentEvidenceAction"),
  source.indexOf("export async function recordPaymentAgainstPurchaseOrder"),
);

test("freight action resolves the trusted operator, maps governed freight evidence, and refreshes the PO", () => {
  assert.match(freightAction, /requireAuthenticatedOperator\(\)/);
  assert.match(freightAction, /recordPurchaseOrderFreightEvidence\(/);
  for (const field of [
    "purchase_order_id",
    "supplier_id",
    "currency",
    "freight_amount",
    "supplier_chargeable_weight_kg",
    "shipment_reference",
    "source_note",
    "idempotency_key",
  ]) {
    assert.match(freightAction, new RegExp(`formData\\.get\\(\"${field}\"\\)`));
  }
  assert.match(freightAction, /operatorId: operator\.id/);
  assert.match(freightAction, /freightAmount/);
  assert.match(freightAction, /supplierChargeableWeightKg/);
  assert.doesNotMatch(freightAction, /shipmentWeight|weightUnit/);
  assert.match(freightAction, /revalidatePath\(\`\/purchase-orders\/\$\{purchaseOrderId\}\`\)/);
  assert.doesNotMatch(freightAction, /estimated_total_gbp|actual_total_gbp|line_cost_gbp|pack_cost_gbp|allocation/);
});

test("FX action requires explicit governed evidence and refreshes the PO without defaulting FX", () => {
  assert.match(fxAction, /requireAuthenticatedOperator\(\)/);
  assert.match(fxAction, /recordPurchaseOrderFxCommitmentEvidence\(/);
  for (const field of [
    "purchase_order_id",
    "supplier_id",
    "source_currency",
    "supplier_liability_amount",
    "fx_rate_to_gbp",
    "liability_evidence_mode",
    "source_evidence_snapshot",
    "source_note",
    "idempotency_key",
  ]) {
    assert.match(fxAction, new RegExp(`formData\\.get\\(\"${field}\"\\)`));
  }
  assert.match(fxAction, /supplierLiabilityAmount/);
  assert.match(fxAction, /fxRateToGbp/);
  assert.match(fxAction, /operator_supplied_supplier_liability_evidence/);
  assert.match(fxAction, /operatorId: operator\.id/);
  assert.match(fxAction, /revalidatePath\(\`\/purchase-orders\/\$\{purchaseOrderId\}\`\)/);
  assert.doesNotMatch(fxAction, /0\.745755|estimated_total_gbp|actual_total_gbp|line_cost_gbp|pack_cost_gbp|allocation/);
});
