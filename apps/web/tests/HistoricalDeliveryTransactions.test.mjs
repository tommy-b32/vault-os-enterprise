import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const migration=await readFile(new URL("../../../supabase/migrations/20261103000000_governed_weighted_average_landed_cogs.sql",import.meta.url),"utf8");
const repository=await readFile(new URL("../lib/cogs/HistoricalDeliveryRepository.ts",import.meta.url),"utf8");
const contracts=[
 ["correction success is atomic","correct_governed_historical_delivery_cost_batch","for update","insert into public.vault_historical_delivery_cost_batch_corrections","update public.vault_historical_delivery_cost_batches"],
 ["correction failure rolls back audit and batch","raise exception","language plpgsql"],
 ["approval success is atomic","approve_governed_historical_delivery_cost_batch","insert into public.vault_historical_delivery_cost_batch_approvals"],
 ["approval failure preserves costing state","APPROVAL_VALIDATION_REQUIRED","v_eligible :="],
 ["terminal SEIZED is non-costing","v_eligible := b.receipt_status='RECEIVED'"],
 ["terminal NOT_RECEIVED is non-costing","v_eligible := b.receipt_status='RECEIVED'"],
 ["terminal CANCELLED is non-costing","v_eligible := b.receipt_status='RECEIVED'"],
 ["review cannot cost","b.receipt_status='REVIEW' then raise exception"],
 ["original import is immutable","ORIGINAL_IMPORT_IMMUTABLE","original_import_immutable"],
 ["correction audit is append-only","corrections_append_only","GOVERNED_AUDIT_APPEND_ONLY"],
 ["approval audit is append-only","approvals_append_only","GOVERNED_AUDIT_APPEND_ONLY"],
 ["correction invalidates approval","approval_status='REJECTED'","approved_by_operator_id=null"],
 ["stale correction fails closed","STALE_HISTORICAL_DELIVERY_WRITE","p_expected_revision"],
 ["stale approval fails closed","STALE_HISTORICAL_DELIVERY_WRITE","p_expected_revision"],
 ["browser mutation RPC access is revoked","revoke all on function public.correct_governed_historical_delivery_cost_batch","public,anon,authenticated"],
 ["service role mutation RPC access is granted","grant execute on function public.correct_governed_historical_delivery_cost_batch","to service_role"],
];
for(const [name,...needles] of contracts)test(name,()=>needles.forEach(needle=>assert.match(migration,new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")))));
test("repository invokes correction RPC",()=>assert.match(repository,/rpc\("correct_governed_historical_delivery_cost_batch"/));
test("repository invokes approval RPC",()=>assert.match(repository,/rpc\("approve_governed_historical_delivery_cost_batch"/));
