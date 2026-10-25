import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const root=new URL("../../../",import.meta.url);
const draft=await readFile(new URL("supabase/migrations/20261115000000_inactive_historical_cogs_draft_evidence.sql",root),"utf8");
const foundation=await readFile(new URL("supabase/migrations/20261035000000_governed_historical_exclusive_tee_cogs_foundation.sql",root),"utf8");
test("draft versions remain outside existing policy attribution",()=>{assert.match(draft,/status in \('governed_simulation_foundation','draft'\)/);assert.match(draft,/Historical attribution must exclude draft policy versions/);assert.match(foundation,/where version\.status='governed_simulation_foundation'/);});
test("governed delivery links are immutable and not directly writable",()=>{for(const token of ["vault_historical_cogs_policy_governed_delivery_evidence","primary key (policy_version_id, delivery_batch_id)","historical_policy_governed_delivery_link_immutable","revoke all on public.vault_historical_cogs_policy_governed_delivery_evidence from public, anon, authenticated, service_role","grant select on public.vault_historical_cogs_policy_governed_delivery_evidence to service_role"])assert.match(draft,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));});
test("identical evidence sets have one order-independent draft identity",()=>{
  assert.match(draft,/evidence_set_fingerprint text/);
  assert.match(draft,/unique index vault_historical_cogs_policy_versions_draft_evidence_set_unique/);
  assert.match(draft,/array\(select unnest\(p_legacy_batch_ids\) order by 1\)/);
  assert.match(draft,/array\(select unnest\(p_governed_delivery_batch_ids\) order by 1\)/);
});
test("duplicate draft admission serializes after evidence validation",()=>{
  const validation=draft.indexOf("HISTORICAL_COGS_DRAFT_GOVERNED_EVIDENCE_INVALID");
  const lock=draft.indexOf("pg_advisory_xact_lock");
  const existing=draft.indexOf("evidence_set_fingerprint=v_fingerprint",lock);
  const insert=draft.indexOf("returning id into v_version");
  assert.ok(validation>=0 && lock>validation && existing>lock && insert>existing);
  assert.match(draft,/exception when unique_violation then[\s\S]*evidence_set_fingerprint=v_fingerprint[\s\S]*return v_version/);
});
