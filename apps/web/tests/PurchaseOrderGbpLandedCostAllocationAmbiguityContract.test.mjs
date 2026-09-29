import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql=await readFile(new URL("../../../supabase/migrations/20261066000000_fix_gbp_allocation_rpc_ambiguity.sql",import.meta.url),"utf8");

test("66000 qualifies the final GBP child conservation aggregate and preserves RPC security",()=>{
 assert.match(sql,/create or replace function public\.capture_purchase_order_gbp_landed_cost_allocation\(authoritative_payload jsonb\)/i);
 assert.match(sql,/from public\.vault_purchase_order_gbp_landed_cost_allocation_lines l where l\.allocation_run_id=v_run/i);
 assert.doesNotMatch(sql,/from public\.vault_purchase_order_gbp_landed_cost_allocation_lines\s+where allocation_run_id=v_run/i);
 assert.match(sql,/count\(distinct l\.purchase_order_line_id\).*count\(distinct l\.remainder_rank\).*sum\(l\.source_merchandise_usd_minor_units\).*sum\(l\.source_freight_usd_minor_units\).*sum\(l\.source_landed_usd_minor_units\).*sum\(l\.allocated_gbp_minor_units\)/i);
 assert.match(sql,/security invoker/i);
 assert.match(sql,/revoke all on function public\.capture_purchase_order_gbp_landed_cost_allocation\(jsonb\) from public,anon,authenticated,service_role;/i);
 assert.match(sql,/grant execute on function public\.capture_purchase_order_gbp_landed_cost_allocation\(jsonb\) to service_role;/i);
 assert.doesNotMatch(sql,/alter\s+default\s+privileges|grant\s+.*\s+on\s+table|create\s+table|select\s+.*capture_purchase_order_gbp_landed_cost_allocation/i);
});
