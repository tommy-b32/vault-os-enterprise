import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../../../supabase/migrations/20261062000000_governed_supplier_standard_series_weight_evidence.sql", import.meta.url), "utf8");

test("supplier standard-series weight evidence is immutable, explicit, and unseeded", () => {
  for (const item of ["vault_supplier_product_type_standard_series_weight_evidence", "standard_series_weight_kg numeric(12,3) not null check (standard_series_weight_kg > 0)", "evidence_classification='supplier_standard_series_weight'", "source_evidence_snapshot jsonb not null", "supersedes_evidence_id", "supplier_product_type_standard_series_weight_evidence_immutable", "record_supplier_product_type_standard_series_weight_evidence", "SUPPLIER_STANDARD_SERIES_WEIGHT_IDEMPOTENCY_CONFLICT", "SUPPLIER_STANDARD_SERIES_WEIGHT_CURRENT_EVIDENCE_EXISTS", "SUPPLIER_STANDARD_SERIES_WEIGHT_SUPERSESSION_INVALID", "vault_supplier_product_type_current_standard_series_weight_evidence", "security invoker"]) assert.match(sql, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(sql, /insert into public\.vault_supplier_product_type_standard_series_weight_evidence[\s\S]*?values\s*\([^v]/i);
  assert.doesNotMatch(sql, /freight allocation|landed_cost_completeness|shipment_weight|supplier_chargeable_weight|1\.7|2\.5|3\.5|4\.5/);
});

test("capture validates governed identity, units, exact replay, and same-tuple supersession", () => {
  for (const item of ["vault_suppliers s where s.id=v_supplier and s.is_active", "vault_cost_type_pack_profile_compatibilities", "v_canonical_units<>v_units", "hashtextextended(v_supplier::text||':'||v_cost_type||':'||v_pack_profile,0)", "existing.source_evidence_snapshot is distinct from v_snapshot", "superseded.supplier_id<>v_supplier", "superseded.cost_type_id<>v_cost_type", "superseded.pack_profile_id<>v_pack_profile", "v_current_count<>1", "current_row.id<>v_supersedes"]) assert.match(sql, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(sql, /revoke all on function public\.record_supplier_product_type_standard_series_weight_evidence\(jsonb\) from public,anon,authenticated/);
  assert.match(sql, /grant execute on function public\.record_supplier_product_type_standard_series_weight_evidence\(jsonb\) to service_role/);
});
