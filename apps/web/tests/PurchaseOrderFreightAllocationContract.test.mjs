import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../../../supabase/migrations/20261063000000_governed_po_freight_allocation.sql", import.meta.url), "utf8");

test("freight allocation is immutable, governed, unseeded, and USD-only", () => {
  for (const item of [
    "vault_purchase_order_freight_allocation_runs", "vault_purchase_order_freight_allocation_lines",
    "purchase_order_freight_allocation_runs_immutable", "purchase_order_freight_allocation_lines_immutable",
    "reject_purchase_cost_evidence_mutation", "freight_amount_minor_units bigint", "allocation_basis_milligrams bigint",
    "supplier_standard_series_weight_pro_rata_largest_remainder", "allocation_method_version='v1'",
    "unique (allocation_run_id,purchase_order_line_id)", "vault_purchase_order_current_freight_allocation_runs",
    "security invoker", "capture_purchase_order_freight_allocation"
  ]) assert.match(sql, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(sql, /insert into public\.vault_purchase_order_freight_allocation_runs[\s\S]*?values\s*\(\s*['"0-9]/i);
  assert.doesNotMatch(sql, /8706e0ef-daa9-4e4f-b128-04faa0bd9606|47bff97a-8826-44bf-97a6-608c1bdebcec/);
  assert.doesNotMatch(sql, /supplier_chargeable_weight|measured_shipment_weight|shipment_weight|actual_measured_shipment_weight|fx_commitment|landed_cost_completeness/i);
});

test("capture derives all authoritative allocations and validates governed sources", () => {
  for (const item of [
    "jsonb_object_keys(authoritative_payload)", "PO_FREIGHT_ALLOCATION_PAYLOAD_INVALID",
    "vault_purchase_order_lines", "recommended_packs", "vault_purchase_order_line_merchandise_cost_evidence",
    "vault_supplier_product_type_current_standard_series_weight_evidence", "m.pack_count=l.recommended_packs",
    "m.units_per_pack=l.units_per_pack", "standard_series_weight_kg*1000000",
    "v_total_units<=0", "vault_purchase_orders has no governed total-units column",
    "Validate exact milligram representation before any bigint cast", "for share of w",
    "w.standard_series_weight_kg*1000000<>trunc(w.standard_series_weight_kg*1000000)",
    "w.standard_series_weight_kg*1000000>9223372036854775807/m.pack_count",
    "v_freight_cents*v_basis_mg", "v_numerator%v_total_basis_mg", "remainder_numerator", "order by ((v_freight_cents",
    "v_rank<=v_residual_cents", "PO_FREIGHT_ALLOCATION_CONSERVATION_INVALID"
  ]) assert.match(sql, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("current-run, idempotency, supersession, and service-role controls fail closed", () => {
  for (const item of [
    "hashtextextended(v_po::text||':'||v_freight::text,0)", "hashtextextended(v_operator::text||':'||v_key,0)",
    "PO_FREIGHT_ALLOCATION_IDEMPOTENCY_CONFLICT", "PO_FREIGHT_ALLOCATION_CURRENT_RUN_EXISTS",
    "PO_FREIGHT_ALLOCATION_SUPERSESSION_INVALID", "current_run.id<>v_supersedes", "v_current_run_count<>1",
    "PO_FREIGHT_ALLOCATION_CURRENT_FREIGHT_INVALID", "revoke all on function public.capture_purchase_order_freight_allocation(jsonb) from public,anon,authenticated",
    "grant execute on function public.capture_purchase_order_freight_allocation(jsonb) to service_role"
  ]) assert.match(sql, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
