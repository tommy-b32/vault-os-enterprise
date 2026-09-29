import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sql=fs.readFileSync(new URL("../../../supabase/migrations/20261068000000_restrict_governed_liability_view_privileges.sql",import.meta.url),"utf8");
const view="public.vault_purchase_order_governed_liability";

test("68000 replaces the governed liability view ACL with service-role SELECT only",()=>{
  assert.match(sql,new RegExp(`revoke all privileges on table ${view} from public,anon,authenticated,service_role;`));
  assert.match(sql,new RegExp(`grant select on table ${view} to service_role;`));
  assert.doesNotMatch(sql,/grant\s+(?:all|insert|update|delete|truncate|references|trigger)\b/i);
});

test("68000 is an ACL-only repair",()=>{
  assert.doesNotMatch(sql,/alter\s+default\s+privileges|create\s+(?:or\s+replace\s+)?view|vault_purchasing_wallet|landed_cost_completeness|insert\s+into|update\s+public\.|delete\s+from|vault_purchase_order_(?:gbp_landed_cost_allocation|fx_commitment|freight|line_merchandise)/i);
});
