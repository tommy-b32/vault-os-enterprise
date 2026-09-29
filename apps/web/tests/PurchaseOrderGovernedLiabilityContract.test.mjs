import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sql=fs.readFileSync(new URL("../../../supabase/migrations/20261067000000_governed_purchase_order_liability.sql",import.meta.url),"utf8");
const liability=sql.slice(sql.indexOf("create view public.vault_purchase_order_governed_liability"),sql.indexOf("revoke all on public.vault_purchase_order_governed_liability"));
const wallet=sql.slice(sql.indexOf("create or replace view public.vault_purchasing_wallet"));

test("governed liability is a read-only security-invoker model with a narrow service role grant",()=>{
  assert.match(liability,/with \(security_invoker=true\)/);
  for(const field of ["purchase_order_id","liability_evidence_state","liability_source","selected_gbp_minor_units","selected_gbp_amount","governed_gbp_allocation_run_id","fx_commitment_evidence_id","freight_allocation_run_id"])assert.match(liability,new RegExp(field));
  assert.match(sql,/revoke all on public\.vault_purchase_order_governed_liability from public,anon,authenticated/);
  assert.match(sql,/grant select on public\.vault_purchase_order_governed_liability to service_role/);
  assert.doesNotMatch(sql,/grant (?:insert|update|delete|all) on public\.vault_purchase_order_governed_liability/i);
});

test("valid governed GBP allocation is the highest authority and is independent of completeness",()=>{
  for(const item of ["current_run_count<>1","validation.fx_commitment_evidence_id is distinct from fx.fx_commitment_evidence_id","validation.freight_allocation_run_id is distinct from freight.id","validation.child_count is distinct from validation_parent.line_count","validation.child_line_count is distinct from validation_parent.line_count","validation.covered_po_line_count is distinct from validation_parent.line_count","po.total_packs is distinct from po_lines.pack_count","validation.child_merchandise_usd_minor_units+validation.child_freight_usd_minor_units is distinct from validation.child_landed_usd_minor_units","validation.child_landed_usd_minor_units is distinct from validation_parent.source_usd_liability_minor_units","validation.child_gbp_minor_units is distinct from validation_parent.target_gbp_minor_units","governed_gbp_landed_cost_allocation"])assert.match(liability,new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.doesNotMatch(liability,/landed_cost_completeness/);
  assert.doesNotMatch(liability,/actual_total_gbp/);
  assert.match(liability,/selected_gbp_minor_units/);
});

test("invalid or conflicting current governed actual evidence fails closed without a lower-authority fallback",()=>{
  assert.match(liability,/when coalesce\(gbp_counts\.current_run_count,0\)>0 then 'unavailable'/);
  assert.match(liability,/when coalesce\(gbp_counts\.current_run_count,0\)>0 then null/);
  assert.match(liability,/\) then 'unavailable'/);
});

test("lower authority sources remain explicit",()=>{
  assert.match(liability,/when fx\.commitment_evidence_state='available' then 'governed_fx_commitment'/);
  assert.match(liability,/when fx\.commitment_evidence_state='missing' and legacy\.purchase_order_id is not null then 'legacy_estimated_total'/);
  assert.match(liability,/legacy_estimate_eligible/);
});

test("only a valid singular FX commitment can select FX, and conflicting FX cannot reach legacy fallback",()=>{
  assert.match(liability,/when fx\.commitment_evidence_state='available' then 'available'/);
  assert.match(liability,/when fx\.commitment_evidence_state='missing' and legacy\.purchase_order_id is not null then 'available'/);
  assert.match(liability,/when fx\.commitment_evidence_state='missing' and legacy\.purchase_order_id is not null then \(po\.estimated_total_gbp\*100\)::bigint/);
  assert.doesNotMatch(liability,/when legacy\.purchase_order_id is not null then/);
});

test("governed actual validation fails closed on header-pack or persisted-rank corruption",()=>{
  for(const item of ["coalesce(sum(recommended_packs),0)::integer as pack_count","coalesce(sum(recommended_units),0)::integer as unit_count","po.total_packs is distinct from po_lines.pack_count","po.total_packs=po_lines.pack_count","min(c.remainder_rank)::integer as child_min_rank","max(c.remainder_rank)::integer as child_max_rank","validation.child_min_rank is distinct from 1","validation.child_max_rank is distinct from validation_parent.line_count","validation.child_min_rank=1 and validation.child_max_rank=validation_parent.line_count"])assert.match(liability,new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
});

test("wallet preserves active-state filtering, fail-closed availability, and payment subtraction while consuming liability",()=>{
  assert.match(wallet,/join public\.vault_purchase_order_governed_liability liability/);
  assert.match(wallet,/greatest\(liability\.selected_gbp_amount-po\.paid_amount_gbp,0\)/);
  assert.match(wallet,/where po\.status in \('approved','ordered','part_paid','shipped','received'\)/);
  assert.match(wallet,/when unresolved_commitment_order_count>0 then null/);
  assert.doesNotMatch(wallet,/landed_cost_completeness|estimated_total_gbp|actual_total_gbp|gbp_commitment_amount/);
});

test("stage scope does not modify completeness, evidence, payments, or prior allocation migrations",()=>{
  assert.doesNotMatch(sql,/insert into public\.|update public\.|delete from public\.|capture_purchase_order_gbp_landed_cost_allocation|record_purchase_order_|actual_total_gbp|paid_amount_gbp\s*=/i);
});
