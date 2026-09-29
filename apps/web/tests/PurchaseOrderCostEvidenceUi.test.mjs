import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/purchase-orders/[id]/page.tsx", import.meta.url), "utf8");
const component = await readFile(new URL("../components/purchase-orders/PurchaseOrderCostEvidence.tsx", import.meta.url), "utf8");

test("PO page loads and passes the governed purchase-cost evidence read model", () => {
  assert.match(page, /getPurchaseOrderEvidenceState\(draft\.id\)/);
  assert.match(page, /<PurchaseOrderCostEvidence/);
  assert.match(page, /evidence=\{evidenceState\}/);
});

test("purchase-cost evidence UI renders governed states and submits only established actions", () => {
  assert.match(component, /recordPurchaseOrderFreightEvidenceAction/);
  assert.match(component, /recordPurchaseOrderFxCommitmentEvidenceAction/);
  assert.match(component, /Freight evidence not recorded/);
  assert.match(component, /Freight evidence requires review/);
  assert.match(component, /FX commitment not recorded/);
  assert.match(component, /FX commitment evidence requires review/);
  assert.match(component, /freight\.freightAmount/);
  assert.match(component, /Supplier chargeable weight/);
  assert.match(component, /Actual measured shipment weight/);
  assert.match(component, /Legacy \/ unclassified/);
  assert.match(component, /freight\.supplierChargeableWeightKg/);
  assert.doesNotMatch(component, /Shipment weight \(kg\)/);
  assert.match(component, /fx\.supplierLiabilityAmount/);
  assert.match(component, /fx\.fxRateToGbp/);
  assert.match(component, /fx\.gbpCommitmentAmount/);
  assert.match(component, /Supplier-confirmed order total/);
  assert.match(component, /landed_cost_pending/);
  assert.match(component, /Freight and FX evidence do not allocate landed cost to individual products\./);
  assert.match(component, /source_evidence_snapshot/);
  assert.doesNotMatch(component, /0\.745755|estimated_total_gbp|actual_total_gbp|line_cost_gbp|pack_cost_gbp|freightAmount\s*\/|supplierLiabilityAmount\s*\*/i);
});
