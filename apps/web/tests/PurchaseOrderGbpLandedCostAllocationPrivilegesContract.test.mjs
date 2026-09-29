import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql=await readFile(new URL("../../../supabase/migrations/20261065000000_restrict_gbp_landed_allocation_service_role_privileges.sql",import.meta.url),"utf8");
const parent="public.vault_purchase_order_gbp_landed_cost_allocation_runs";
const child="public.vault_purchase_order_gbp_landed_cost_allocation_lines";
const view="public.vault_purchase_order_current_gbp_landed_cost_allocation_runs";
const rpc="public.capture_purchase_order_gbp_landed_cost_allocation(jsonb)";

test("65000 narrows GBP allocation privileges without changing sources or defaults",()=>{
 for(const object of [parent,child,view]) assert.match(sql,new RegExp(`revoke all privileges on table ${object} from public,anon,authenticated,service_role;`));
 assert.match(sql,new RegExp(`revoke all on function ${rpc.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")} from public,anon,authenticated;`));
 assert.match(sql,new RegExp(`grant execute on function ${rpc.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")} to service_role;`));
 assert.doesNotMatch(sql,/alter\s+default\s+privileges|insert\s+into|select\s+.*capture_purchase_order_gbp_landed_cost_allocation|vault_purchase_order_payments|vault_purchase_order_freight_|vault_purchase_order_fx_|vault_purchase_order_line_merchandise/i);
});

test("65000 grants only lock-compatible parent and view UPDATE(id)",()=>{
 assert.match(sql,new RegExp(`grant select,insert on table ${parent} to service_role;`));
 assert.match(sql,new RegExp(`grant update\\(id\\) on table ${parent} to service_role;`));
 assert.match(sql,new RegExp(`grant select,insert on table ${child} to service_role;`));
 assert.match(sql,new RegExp(`grant select on table ${view} to service_role;`));
 assert.match(sql,new RegExp(`grant update\\(id\\) on table ${view} to service_role;`));
 assert.doesNotMatch(sql,/grant update on table/i);
 assert.doesNotMatch(sql,/grant update\((?!id\))/i);
 assert.doesNotMatch(sql,/grant\s+(delete|truncate|references|trigger)\b/i);
});
