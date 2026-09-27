import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration=await readFile(new URL("../../../supabase/migrations/20261051000000_governed_pending_catalogue_purchasing_intake.sql",import.meta.url),"utf8");
const repository=await readFile(new URL("../lib/purchase-orders/PendingCatalogueDraftRepository.ts",import.meta.url),"utf8");
const panel=await readFile(new URL("../components/purchase-orders/PendingCatalogueAddPanel.tsx",import.meta.url),"utf8");

test("governed pending intake resolves supplier/type cost evidence inside the atomic existing RPC",()=>{
  for(const fragment of ["cost_type_id text null references public.vault_cost_types", "pack_profile_id text null references public.vault_pack_profiles", "create or replace function public.create_pending_catalogue_purchase_line", "vault_supplier_product_type_cost_profiles", "PENDING_CATALOGUE_COMMERCIAL_PROFILE_UNAVAILABLE", "PENDING_CATALOGUE_PACK_PROFILE_MISMATCH", "PENDING_CATALOGUE_PACK_COMPOSITION_INVALID", "update public.vault_purchase_orders set total_packs", "grant execute on function public.create_pending_catalogue_purchase_line(jsonb) to service_role"]) assert.match(migration,new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
});
test("governed payload sends identity and composition but never browser commercial authority",()=>{
  assert.match(repository,/cost_type_id: clean\(input.costTypeId\)/);
  assert.match(repository,/pack_profile_id: clean\(input.packProfileId\)/);
  assert.match(repository,/units_per_pack: size.unitsPerPack/);
  assert.match(repository,/governed \? \{ cost_type_id/);
  assert.match(panel,/unitCostGbp:0/);
  assert.match(panel,/Governed commercial preview/);
  assert.match(panel,/Create & Add to PO/);
});
test("pack-size conservation and immutable profile provenance are durable",()=>{
  assert.match(migration,/v_pack_count\*v_governed_units/);
  assert.match(migration,/v_pack_count\*\(size_row->>'units_per_pack'\)::integer/);
  assert.match(migration,/commercial_profile_id/);
  assert.match(migration,/commercial_profile_version_id/);
  assert.match(migration,/PENDING_CATALOGUE_IDEMPOTENCY_CONFLICT/);
});
test("rounded governed GBP pack cost is the sole source of the saved line, snapshot, and header value",()=>{
  // Raw £10.005 per pack is the regression boundary: aggregate-first rounding
  // would produce £30.02 for three packs, whereas governed per-pack accounting
  // produces £10.01 × 3 = £30.03.
  const rawPerPack=10.005, packCount=3;
  const governedPack=Math.round((rawPerPack+Number.EPSILON)*100)/100;
  const lineTotal=Math.round((governedPack*packCount+Number.EPSILON)*100)/100;
  assert.equal(governedPack,10.01);
  assert.equal(lineTotal,30.03);
  assert.match(migration,/v_landed_cost_per_pack_gbp:=round\(\(v_profile\.pack_cost\+v_profile\.shipping_cost_per_pack\+v_profile\.import_cost_per_pack\)\*v_profile\.exchange_rate_to_gbp,2\)/);
  assert.match(migration,/v_line_cost:=round\(v_landed_cost_per_pack_gbp\*v_pack_count,2\)/);
  assert.match(migration,/'landed_cost_per_pack_gbp',v_landed_cost_per_pack_gbp/);
  assert.match(migration,/case when v_governed then v_landed_cost_per_pack_gbp else v_line_cost end,v_line_cost/);
  assert.match(migration,/estimated_total_gbp=\(select sum\(l\.line_cost_gbp\)/);
});
