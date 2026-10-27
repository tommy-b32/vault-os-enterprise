import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const draftMigration = await readFile(new URL("supabase/migrations/20261115000000_inactive_historical_cogs_draft_evidence.sql", root), "utf8");
const reviewMigration = await readFile(new URL("supabase/migrations/20261116000000_historical_cogs_simulation_review_approval.sql", root), "utf8");
const previewMigration = await readFile(new URL("supabase/migrations/20261119000000_trusted_historical_cogs_preview_binding.sql", root), "utf8");
const rpcIdentifierFixMigration = await readFile(new URL("supabase/migrations/20261120000000_historical_cogs_preview_rpc_identifier_fix.sql", root), "utf8");
const container = `vault-cogs-review-${process.pid}`;
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (char) => char.repeat(64);
let started = false;
function docker(args, input) { const result = spawnSync("docker", args, { input, encoding:"utf8" }); if (result.status) throw Error(result.stderr || result.stdout); return result.stdout.trim(); }
function sql(text) { return docker(["exec","-i",container,"psql","-v","ON_ERROR_STOP=1","-U","postgres","-d","review_test","-t","-A"], text); }
function sqlFails(text) { const result = spawnSync("docker", ["exec","-i",container,"psql","-v","ON_ERROR_STOP=1","-U","postgres","-d","review_test","-t","-A"], { input:text, encoding:"utf8" }); assert.notEqual(result.status,0); return result.stderr; }

test("simulation review and approval are guarded, immutable, snapshot-bound, and inactive", async (t) => {
  t.after(() => { if (started) docker(["rm","-f",container]); });
  docker(["run","--rm","-d","--name",container,"-e","POSTGRES_PASSWORD=x","-e","POSTGRES_DB=review_test","postgres:17"]); started=true;
  for (let i=0;i<40;i++) { try { sql("select 1"); break; } catch { if (i===39) throw Error("database not ready"); await new Promise((resolve)=>setTimeout(resolve,250)); } }
  sql(`create extension pgcrypto; create role anon; create role authenticated; create role service_role;
    create table public.vault_operators(id uuid primary key, role text not null, is_active boolean not null);
    create function public.assert_governed_historical_delivery_operator(p uuid) returns void language plpgsql as $$begin if not exists(select 1 from public.vault_operators where id=p and role in ('owner','operator') and is_active) then raise exception 'OPERATOR_UNAUTHORISED'; end if; end$$;
    create table public.vault_historical_cogs_policies(id uuid primary key, merchandise_class_id text not null, status text not null, policy_name text); create table public.vault_shopify_order_lines(id uuid primary key);
    create table public.vault_historical_cogs_policy_versions(id uuid primary key default gen_random_uuid(), policy_id uuid not null references public.vault_historical_cogs_policies(id), version_number integer not null, methodology text not null, evidence_method text not null, sale_period_from date not null, sale_period_through date not null, membership_provenance text not null, status text not null check(status='governed_simulation_foundation'), created_at timestamptz default now(), unique(policy_id,version_number));
    create table public.vault_historical_supplier_batch_evidence(id uuid primary key, merchandise_class_id text not null, evidence_status text not null, received_date date, quantity integer not null default 1, landed_total_gbp numeric not null, documentary_provenance text not null default 'test');
    create table public.vault_historical_cogs_policy_batch_evidence(policy_version_id uuid not null references public.vault_historical_cogs_policy_versions(id), batch_evidence_id uuid not null references public.vault_historical_supplier_batch_evidence(id), primary key(policy_version_id,batch_evidence_id));
    create function public.reject_historical_cogs_evidence_mutation() returns trigger language plpgsql as $$begin raise exception 'immutable'; end$$;
    create table public.vault_suppliers(id uuid primary key, supplier_name text not null);
    create table public.vault_historical_delivery_cost_batches(id uuid primary key, merchandise_class_id text not null, supplier_id uuid not null references public.vault_suppliers(id), receipt_status text not null, validation_status text not null, approval_status text not null, revision integer not null, received_at timestamptz, received_quantity integer not null default 1, landed_cost_gbp numeric not null, source_document_reference text);
    create table public.vault_historical_delivery_cost_batch_approvals(batch_id uuid not null references public.vault_historical_delivery_cost_batches(id));
    create view public.vault_historical_policy_derived_cogs_line_attributions as select id as policy_version_id from public.vault_historical_cogs_policy_versions where status='governed_simulation_foundation';
    insert into public.vault_operators values('${id(1)}','owner',true),('${id(2)}','operator',true),('${id(3)}','viewer',true);
    insert into public.vault_suppliers values('${id(4)}','Exclusive');
    insert into public.vault_historical_cogs_policies values('${id(5)}','exclusive_tee','governed_simulation_foundation','test');
    insert into public.vault_historical_cogs_policy_versions(id,policy_id,version_number,methodology,evidence_method,sale_period_from,sale_period_through,membership_provenance,status) values('${id(6)}','${id(5)}',1,'latest_received_documented_batch_average','POLICY_DERIVED_BATCH_AVERAGE','2026-01-01','2026-09-05','test','governed_simulation_foundation');
    insert into public.vault_historical_supplier_batch_evidence(id,merchandise_class_id,evidence_status,received_date,quantity,landed_total_gbp) values ${[0,1,2,3,4,5].map((n)=>`('${id(100+n)}','exclusive_tee','valid_received','2026-05-01',1,1)`).join(',')};
    insert into public.vault_historical_delivery_cost_batches values('${id(200)}','exclusive_tee','${id(4)}','RECEIVED','VALID','APPROVED',2,'2026-04-09',1,1,'ledger-1'),('${id(201)}','exclusive_tee','${id(4)}','RECEIVED','VALID','APPROVED',2,'2026-09-10',1,1,'ledger-2');
    insert into public.vault_historical_delivery_cost_batch_approvals values('${id(200)}'),('${id(201)}');`);
  sql(draftMigration); sql(reviewMigration); sql(previewMigration); sql(rpcIdentifierFixMigration);
  assert.equal(sql("select has_function_privilege('service_role','public.create_exclusive_tee_historical_cogs_simulation_review(uuid,text,text,text,text,text,integer,integer,integer,jsonb,numeric,numeric,integer,numeric,uuid)','execute')"),"f");
  assert.equal(sql("select has_function_privilege('service_role','public.record_exclusive_tee_historical_cogs_preview(uuid,text,text,text,text,jsonb,jsonb,integer,integer,integer,numeric,numeric,integer,numeric,uuid)','execute')"),"t");
  assert.equal(sql("select has_function_privilege('service_role','public.create_historical_cogs_review_from_preview(uuid,uuid)','execute')"),"t");
  assert.equal(sql("select has_function_privilege('anon','public.create_historical_cogs_review_from_preview(uuid,uuid)','execute')"),"f");
  assert.equal(sql("select has_function_privilege('anon','public.create_exclusive_tee_historical_cogs_simulation_review(uuid,text,text,text,text,text,integer,integer,integer,jsonb,numeric,numeric,integer,numeric,uuid)','execute')"),"f");
  const legacy=`ARRAY[${[0,1,2,3,4,5].map((n)=>`'${id(100+n)}'::uuid`).join(',')}]`; const governed=`ARRAY['${id(200)}'::uuid,'${id(201)}'::uuid]`;
  const draft=sql(`select public.create_exclusive_tee_historical_cogs_draft(${legacy}::uuid[],${governed},'${id(2)}');`);
  const reviewCall=(actor=id(2), input=hash('a'))=>`select public.create_exclusive_tee_historical_cogs_simulation_review('${draft}','date_only_receipts_eligible_following_europe_london_calendar_day_v1','${input}','${hash('b')}','${hash('c')}','${hash('d')}',388,14,22,'{"unresolved":0}',4463.111463,4479.011216,370,4097.838536,'${actor}');`;
  const review=sql(reviewCall()); assert.equal(sql(`select count(*) from public.vault_historical_cogs_simulation_review_evidence where review_id='${review}'`),'8');
  assert.equal(sql(reviewCall()),review);
  assert.match(sqlFails(reviewCall(id(3))),/OPERATOR_UNAUTHORISED/);
  const approve=(input=hash('a'), actor=id(1))=>`select public.approve_exclusive_tee_historical_cogs_simulation_review('${review}','date_only_receipts_eligible_following_europe_london_calendar_day_v1','${input}','${hash('b')}','${hash('c')}','${hash('d')}','owner approval','${actor}');`;
  assert.match(sqlFails(approve(hash('e'))),/SNAPSHOT_MISMATCH/);
  assert.match(sqlFails(approve(hash('a'),id(2))),/OWNER_UNAUTHORISED/);
  const approval=sql(approve()); assert.equal(sql(approve()),approval);
  assert.equal(sql(`select status from public.vault_historical_cogs_policy_versions where id='${draft}'`),'draft');
  assert.equal(sql(`select count(*) from public.vault_historical_policy_derived_cogs_line_attributions where policy_version_id='${draft}'`),'0');
  assert.match(sqlFails(`set role service_role; insert into public.vault_historical_cogs_simulation_reviews(draft_policy_version_id,policy_rule,simulation_input_sha256,simulation_resolution_sha256,simulator_code_sha256,per_line_report_sha256,calculated_line_count,returned_restocked_line_count,same_day_receipt_warning_count,exception_summary,simulated_cogs_gbp,existing_policy_cogs_gbp,simulated_closing_inventory_units,simulated_closing_inventory_landed_gbp,created_by_operator_id) values('${draft}','date_only_receipts_eligible_following_europe_london_calendar_day_v1','${hash('f')}','${hash('b')}','${hash('c')}','${hash('d')}',0,0,0,'{}',0,0,0,0,'${id(1)}');`),/permission denied/);
  assert.match(sqlFails(`update public.vault_historical_cogs_simulation_reviews set same_day_receipt_warning_count=0 where id='${review}';`),/immutable/);
  assert.match(sqlFails(`delete from public.vault_historical_cogs_simulation_review_approvals where id='${approval}';`),/immutable/);
  assert.match(sqlFails(`set role service_role; insert into public.vault_historical_cogs_preview_snapshots(draft_policy_version_id,eligibility_rule,source_snapshot_sha256,result_sha256,engine_sha256,per_line_sha256,source_evidence,calculated_line_count,returned_restocked_line_count,unresolved_line_count,same_day_receipt_warning_count,simulated_cogs_gbp,existing_policy_cogs_gbp,closing_inventory_units,closing_inventory_landed_gbp,created_by_operator_id) values('${draft}','date_only_receipts_eligible_following_europe_london_calendar_day_v1','${hash('a')}','${hash('b')}','${hash('c')}','${hash('d')}','{}',0,0,0,0,0,0,0,0,'${id(1)}');`),/permission denied/);
});
