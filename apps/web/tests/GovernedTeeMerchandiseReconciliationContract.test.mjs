import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql=await readFile(new URL("../../../supabase/migrations/20261060000000_governed_tee_merchandise_reconciliation.sql",import.meta.url),"utf8");
test("governed Tee reconciliation is a singular USD-50, five-unit supplier fact with replay safety",()=>{
  for(const text of ["Exclusive supplier order evidence: 15 Serie T-shirt = USD 750","'tee','tee_5_piece','USD',50","shipping 74 kg = USD 1,030","5eec6ed8-16af-4024-8f02-e43fdf5c8cd7","f2978e12-f2db-40bc-bd35-a1d10cee64f7","if v_count=0 then insert","elsif v_count=1 then","EXCLUSIVE_TEE_MERCHANDISE_EVIDENCE_CONFLICT","v_existing.source_note<>v_note"]) assert.match(sql,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
});
test("capture is draft-only, exact-batch, provenance-gated, immutable, and idempotent",()=>{
  for(const text of ["capture_draft_complete_cost_tee_merchandise_reconciliation","po.status<>'draft'","cardinality(v_lines)<>10","v_packs<>15","v_units<>75","v_total<>750","manual_fixed_pack_purchase','pending_catalogue_purchase","TEE_RECONCILIATION_MANUAL_PROVENANCE_INVALID","TEE_RECONCILIATION_PENDING_PROVENANCE_INVALID","TEE_RECONCILIATION_MANUAL_EFFECTIVE_VERSION_AMBIGUOUS","effective_from<=l.created_at order by pc.effective_from desc limit 1","max(effective_from)","TEE_RECONCILIATION_IDEMPOTENCY_CONFLICT","TEE_RECONCILIATION_IDEMPOTENT_STATE_INVALID","complete_cost_tee_merchandise_reconciliation_captured","hashtextextended(v_po::text,0)","hashtextextended(v_operator::text||':'||v_key,0)","independent_merchandise_reconciliation"]) assert.match(sql,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  const body=sql.slice(sql.indexOf("create function public.capture_draft"),sql.indexOf("revoke all on function public.capture_draft"));
  assert.doesNotMatch(body,/update public\.vault_purchase_order_lines|update public\.vault_purchase_orders|insert into public\.vault_purchase_order_freight_evidence|insert into public\.vault_purchase_order_fx_commitment_evidence/);
});
test("independent reconciliation does not relabel the existing pending-cost contract",()=>{
  assert.match(sql,/cost_completeness in \('merchandise_only_landed_cost_pending','independent_merchandise_reconciliation'\)/);
  assert.match(sql,/insert into public\.vault_purchase_order_line_merchandise_cost_evidence/);
});
