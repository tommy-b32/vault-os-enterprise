import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../../../supabase/migrations/20260910000000_purchase_intelligence_option_identity.sql", import.meta.url), "utf8");
const pack = (rows) => [...rows.filter((r) => r.status === 'resolved' && r.model && r.size).reduce((groups, r) => { const key = `${r.product}:${r.model}`; const v = groups.get(key) ?? { model: r.model, S: 0, M: 0, L: 0, XL: 0, total: 0 }; v[r.size] += r.available; v.total += r.available; groups.set(key, v); return groups; }, new Map()).values()];

test("semantic pack SQL uses canonical identity and preserves the output contract", () => {
  assert.match(sql, /v\.model_design as colour_design/);
  assert.match(sql, /v\.normalized_size = 'XL'/);
  assert.match(sql, /v\.identity_resolution_status = 'resolved'/);
  assert.match(sql, /v\.model_design is not null and v\.normalized_size is not null/);
  assert.match(sql, /group by p\.id.*v\.model_design/s);
  assert.doesNotMatch(sql.slice(sql.indexOf('create or replace view public.vault_pack_inventory_intelligence')), /v\.option_[12]/);
  for (const field of ['product_id','colour_design','small_stock','medium_stock','large_stock','xl_stock','xxl_stock','xxxl_stock','total_available_stock','total_committed_stock','total_incoming_stock','complete_packs','loose_units_after_complete_packs','missing_sizes','full_size_run_available','broken_size_run','stock_status','last_inventory_sync']) assert.ok(sql.includes(field));
});
test("semantic model rows isolate sizes, totals, defaults, and unresolved variants", () => {
  const rows = pack([{product:'p',model:'Triple',size:'M',available:2,status:'resolved'},{product:'p',model:'Triple',size:'L',available:3,status:'resolved'},{product:'p',model:'Triple',size:'XL',available:1,status:'resolved'},{product:'p',model:'Badge',size:'XL',available:9,status:'resolved'},{product:'p',model:null,size:'XL',available:50,status:'resolved'},{product:'p',model:'Triple',size:null,available:50,status:'resolved'},{product:'p',model:'Triple',size:'XL',available:50,status:'unresolved'}]);
  assert.deepEqual(rows, [{model:'Triple',S:0,M:2,L:3,XL:1,total:6},{model:'Badge',S:0,M:0,L:0,XL:9,total:9}]);
  assert.equal(pack([{product:'s',model:'Default',size:'XL',available:4,status:'resolved'}])[0].model, 'Default');
});
