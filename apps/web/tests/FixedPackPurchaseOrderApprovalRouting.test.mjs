import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repository = await readFile(new URL("../lib/purchase-orders/PurchaseOrderRepository.ts", import.meta.url), "utf8");
const action = await readFile(new URL("../app/purchase-orders/actions.ts", import.meta.url), "utf8");

test("authoritative persisted source families route each approval RPC", () => {
  assert.match(repository, /purchase_intelligence_required/);
  assert.match(repository, /purchase_intelligence_bring_forward/);
  assert.match(repository, /fixed_pack_purchase_recommendation/);
  assert.match(repository, /manual_fixed_pack_purchase/);
  assert.match(repository, /pending_catalogue_purchase/);
  assert.match(repository, /!legacy\.has\(source\) && !fixed\.has\(source\) && !pending\.has\(source\)/);
  assert.match(repository, /if \(sources\.some\(\(source\) => !family\.has\(source\)\)\) throw new Error\("PO_SOURCE_MIX_INVALID"\)/);
  assert.match(repository, /approve_pending_catalogue_purchase_order/);
  assert.match(repository, /approve_fixed_pack_vault_purchase_order/);
  assert.match(repository, /approve_vault_purchase_order/);
});

test("fixed-pack qualification is server-derived for recommendation, manual, and combined baskets", () => {
  assert.match(repository, /validateFixedPackSourceProvenance\(/);
  assert.match(repository, /source_family: "fixed_pack"/);
  assert.match(repository, /purchase_order_id: purchaseOrderId/);
  assert.match(repository, /expected_total_packs: orderData\.total_packs/);
  assert.match(repository, /expected_total_gbp: orderData\.estimated_total_gbp/);
  assert.match(repository, /provenance_fingerprint: source\.fingerprint/);
});

test("action contract stays browser-ID-only and operator attribution stays server-side", () => {
  assert.match(action, /const operator = await requireAuthenticatedOperator\(\)/);
  assert.match(action, /const purchaseOrderId = formData\.get\("purchase_order_id"\)/);
  assert.match(action, /operatorId: operator\.id/);
  assert.doesNotMatch(action, /formData\.get\("operator_id"\)/);
});

test("both RPC results retain the shared approval result and approved repeats route idempotently", () => {
  assert.match(repository, /if \(order\.data\.status === "approved"\) \{\s*return \{ sourceFamily, canonicalQualification: \{\} \};\s*\}/);
  assert.match(repository, /purchaseOrderId: result\.purchase_order_id/);
  assert.match(repository, /approvedByOperatorId: result\.approved_by_operator_id/);
  assert.match(repository, /approvedAt: result\.approved_at/);
  assert.match(repository, /transitioned: result\.transitioned/);
});
