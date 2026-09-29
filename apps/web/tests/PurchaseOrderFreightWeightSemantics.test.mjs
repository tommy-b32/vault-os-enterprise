import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../../../supabase/migrations/20261061000000_governed_freight_weight_semantic_evidence.sql", import.meta.url), "utf8");

test("freight-weight companion evidence is explicit, immutable, and does not alter legacy freight", () => {
  for (const item of ["vault_purchase_order_freight_weight_evidence", "supplier_chargeable_weight", "measured_shipment_weight", "actual_measured_shipment_weight_status", "purchase_order_freight_weight_evidence_immutable", "supersedes_evidence_id", "reject_purchase_cost_evidence_mutation", "record_purchase_order_freight_weight_evidence", "PO_FREIGHT_WEIGHT_IDEMPOTENCY_CONFLICT", "PO_FREIGHT_WEIGHT_SUPERSESSION_INVALID", "vault_purchase_order_freight_weight_semantics", "legacy_weight_semantics_unclassified"]) assert.match(sql, new RegExp(item));
  assert.match(sql, /supplier_chargeable_weight' and actual_measured_shipment_weight_status='unknown'/);
  assert.match(sql, /measured_shipment_weight' and actual_measured_shipment_weight_status='recorded'/);
  assert.doesNotMatch(sql, /update public\.vault_purchase_order_freight_evidence|delete from public\.vault_purchase_order_freight_evidence|allocation|standard_series/);
});

test("future freight capture atomically writes a chargeable semantic companion while leaving legacy capture available", () => {
  assert.match(sql, /record_purchase_order_freight_evidence_with_chargeable_weight/);
  assert.match(sql, /supplier_chargeable_weight_kg/);
  assert.match(sql, /shipment_weight,weight_unit/);
  assert.match(sql, /values\(v_po,v_supplier,v_ref,v_currency,v_amount,null,null/);
  assert.match(sql, /actual_measured_shipment_weight_status='unknown'/);
  assert.match(sql, /PO_FREIGHT_CHARGEABLE_CURRENT_FREIGHT_EXISTS/);
  assert.match(sql, /v_current_freight_count<>0/);
  assert.doesNotMatch(sql, /alter table public\.vault_purchase_order_freight_evidence rename/);
});
