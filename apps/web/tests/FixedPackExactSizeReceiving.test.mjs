import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../../supabase/migrations/20260920000000_fixed_pack_exact_size_receiving.sql", import.meta.url), "utf8");

test("B22C routes fixed-pack receipt allocations through saved exact-size evidence", () => {
  for (const source of ["fixed_pack_purchase_recommendation", "manual_fixed_pack_purchase"]) assert.match(migration, new RegExp(source));
  assert.match(migration, /purchase_order_line_size_allocation_id/);
  assert.match(migration, /FIXED_PACK_SIZE_ALLOCATION_LINE_MISMATCH/);
  assert.match(migration, /FIXED_PACK_DUPLICATE_SIZE_ALLOCATION/);
  assert.match(migration, /FIXED_PACK_PHYSICAL_ALLOCATION_EXCEEDED/);
  assert.match(migration, /FIXED_PACK_VARIANT_IDENTITY_CHANGED/);
  assert.match(migration, /for update/);
  assert.match(migration, /quantity_received\+a\.non_sellable_quantity/);
  assert.match(migration, /line_sellable,line_nonsellable/);
});

test("B22C preserves the legacy semantic receiving branch and service-only boundary", () => {
  assert.match(migration, /purchase_intelligence_required/);
  assert.match(migration, /purchase_intelligence_bring_forward/);
  assert.match(migration, /purchase_order_line_size_allocation_id\) select[\s\S]*0,null/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.match(migration, /RECEIPT_SOURCE_TYPE_UNSUPPORTED/);
});
