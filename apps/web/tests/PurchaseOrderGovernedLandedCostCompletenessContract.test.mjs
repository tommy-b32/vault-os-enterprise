import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sql=fs.readFileSync(new URL("../../../supabase/migrations/20261069000000_governed_landed_cost_completeness.sql",import.meta.url),"utf8");
const view=sql.slice(sql.indexOf("create or replace view public.vault_purchase_order_landed_cost_completeness"),sql.indexOf("commit;"));

test("69000 preserves the completeness view contract and completes only from valid governed GBP evidence",()=>{
  assert.match(view,/with \(security_invoker=true\)/);
  assert.match(view,/po\.id as purchase_order_id/);
  assert.match(view,/end as landed_cost_completeness/);
  for(const item of ["liability.liability_evidence_state='available'","liability.liability_source='governed_gbp_landed_cost_allocation'","liability.governed_gbp_allocation_run_id is not null","liability.selected_gbp_minor_units is not null","liability.selected_gbp_minor_units>0","then 'complete_landed_cost'"])assert.match(view,new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
});

test("69000 requires a positive governed minor-unit amount before completion",()=>{
  const governed=view.slice(view.indexOf("when liability.liability_evidence_state='available'"),view.indexOf("then 'complete_landed_cost'"));
  assert.match(governed,/selected_gbp_minor_units is not null/);
  assert.match(governed,/selected_gbp_minor_units>0/);
  assert.doesNotMatch(governed,/selected_gbp_minor_units(?:\s*=\s*0|\s*<\s*0)/);
});

test("69000 fails closed for any current governed GBP allocation that is not valid",()=>{
  const governed=view.slice(view.indexOf("case"),view.indexOf("-- Retain the historical"));
  assert.match(governed,/vault_purchase_order_current_gbp_landed_cost_allocation_runs run/);
  assert.match(governed,/then 'landed_cost_pending'/);
  assert.ok(governed.indexOf("vault_purchase_order_current_gbp_landed_cost_allocation_runs")>governed.indexOf("governed_gbp_allocation_run_id is not null"));
});

test("69000 retains the narrow historical absence path without requiring payments",()=>{
  for(const item of ["vault_purchase_order_line_merchandise_cost_evidence","vault_purchase_order_freight_evidence","then 'complete_landed_cost'"])assert.match(view,new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.doesNotMatch(view,/payment|paid_amount_gbp|actual_total_gbp/i);
});

test("69000 does not alter liability, wallet, evidence, or ACLs",()=>{
  assert.match(view,/vault_purchase_order_governed_liability liability/);
  assert.doesNotMatch(sql,/vault_purchasing_wallet|estimated_total_gbp|actual_total_gbp|paid_amount_gbp|insert into|update public\.|delete from|grant |revoke |alter default privileges/i);
});

test("69000 adds only an independently proven governed structural approval path",()=>{
  for(const item of ["approve_mixed_supplier_purchase_order(uuid,uuid)","governed_liability.liability_evidence_state='available'","governed_liability.liability_source='governed_gbp_landed_cost_allocation'","governed_liability.selected_gbp_minor_units>0","governed_liability.governed_gbp_allocation_run_id is not null","MIXED_PO_GOVERNED_LANDED_COST_INVALID"])assert.match(sql,new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.doesNotMatch(sql,/available_purchasing_power_gbp|wallet_last_updated|paid_amount_gbp|actual_total_gbp/i);
});
