import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20261115000000_inactive_historical_cogs_draft_evidence.sql", root), "utf8");
const container = `vault-cogs-draft-duplicate-${process.pid}`;
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let started = false;
function docker(args, input) { const r = spawnSync("docker", args, { input, encoding: "utf8" }); if (r.status) throw Error(r.stderr || r.stdout); return r.stdout.trim(); }
function sql(text) { return docker(["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "draft_test", "-t", "-A"], text); }
function sqlFails(text) { const r = spawnSync("docker", ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "draft_test", "-t", "-A"], { input: text, encoding: "utf8" }); assert.notEqual(r.status, 0); return r.stderr; }
function sqlAsync(text) { return new Promise((resolve, reject) => { const p = spawn("docker", ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "draft_test", "-t", "-A"], { stdio: ["pipe", "pipe", "pipe"] }); let out = "", err = ""; p.stdout.on("data", (x) => { out += x; }); p.stderr.on("data", (x) => { err += x; }); p.on("close", (code) => code ? reject(Error(err || out)) : resolve(out.trim())); p.stdin.end(text); }); }

test("draft admission is canonical, idempotent, concurrent-safe and immutable", async (t) => {
  t.after(() => { if (started) docker(["rm", "-f", container]); });
  docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=x", "-e", "POSTGRES_DB=draft_test", "postgres:17"]); started = true;
  for (let i = 0; i < 40; i++) { try { sql("select 1"); break; } catch { if (i === 39) throw Error("database not ready"); await new Promise((r) => setTimeout(r, 250)); } }
  sql(`create extension pgcrypto; create role anon; create role authenticated; create role service_role;
    create table public.vault_operators(id uuid primary key, role text not null, is_active boolean not null);
    create function public.assert_governed_historical_delivery_operator(p uuid) returns void language plpgsql as $$begin if not exists(select 1 from public.vault_operators where id=p and role='owner' and is_active) then raise exception 'OPERATOR_UNAUTHORISED'; end if; end$$;
    create table public.vault_historical_cogs_policies(id uuid primary key, merchandise_class_id text not null, status text not null, policy_name text);
    create table public.vault_historical_cogs_policy_versions(id uuid primary key default gen_random_uuid(), policy_id uuid not null references public.vault_historical_cogs_policies(id), version_number integer not null, methodology text not null, evidence_method text not null, sale_period_from date not null, sale_period_through date not null, membership_provenance text not null, status text not null check(status='governed_simulation_foundation'), created_at timestamptz default now(), unique(policy_id,version_number));
    create table public.vault_historical_supplier_batch_evidence(id uuid primary key, merchandise_class_id text not null, evidence_status text not null, received_date date, quantity integer not null default 1, landed_total_gbp numeric not null, documentary_provenance text not null default 'test');
    create table public.vault_historical_cogs_policy_batch_evidence(policy_version_id uuid not null references public.vault_historical_cogs_policy_versions(id), batch_evidence_id uuid not null references public.vault_historical_supplier_batch_evidence(id), primary key(policy_version_id,batch_evidence_id));
    create function public.reject_historical_cogs_evidence_mutation() returns trigger language plpgsql as $$begin raise exception 'immutable'; end$$;
    create table public.vault_suppliers(id uuid primary key, supplier_name text not null);
    create table public.vault_historical_delivery_cost_batches(id uuid primary key, merchandise_class_id text not null, supplier_id uuid not null references public.vault_suppliers(id), receipt_status text not null, validation_status text not null, approval_status text not null, revision integer not null, received_at timestamptz, received_quantity integer not null default 1, landed_cost_gbp numeric not null, source_document_reference text);
    create table public.vault_historical_delivery_cost_batch_approvals(batch_id uuid not null references public.vault_historical_delivery_cost_batches(id));
    create view public.vault_historical_policy_derived_cogs_line_attributions as select id as policy_version_id from public.vault_historical_cogs_policy_versions where status='governed_simulation_foundation';
    insert into public.vault_operators values('${id(1)}','owner',true),('${id(2)}','viewer',true);
    insert into public.vault_suppliers values('${id(3)}','Exclusive');
    insert into public.vault_historical_cogs_policies values('${id(4)}','exclusive_tee','governed_simulation_foundation','test');
    insert into public.vault_historical_cogs_policy_versions(id,policy_id,version_number,methodology,evidence_method,sale_period_from,sale_period_through,membership_provenance,status) values('${id(5)}','${id(4)}',1,'latest_received_documented_batch_average','POLICY_DERIVED_BATCH_AVERAGE','2026-01-01','2026-09-05','test','governed_simulation_foundation');`);
  sql(`insert into public.vault_historical_supplier_batch_evidence(id,merchandise_class_id,evidence_status,received_date,quantity,landed_total_gbp) values ${[0,1,2,3,4,5,6].map((n)=>`('${id(100+n)}','exclusive_tee','valid_received','2026-05-01',1,1)`).join(",")};
    insert into public.vault_historical_delivery_cost_batches(id,merchandise_class_id,supplier_id,receipt_status,validation_status,approval_status,revision,received_at,received_quantity,landed_cost_gbp,source_document_reference) values('${id(200)}','exclusive_tee','${id(3)}','RECEIVED','VALID','APPROVED',2,'2026-04-09',1,1,'ledger-1'),('${id(201)}','exclusive_tee','${id(3)}','RECEIVED','VALID','APPROVED',2,'2026-09-10',1,1,'ledger-2'); insert into public.vault_historical_delivery_cost_batch_approvals values('${id(200)}'),('${id(201)}');`);
  sql(migration);
  const legacy = `ARRAY[${[0,1,2,3,4,5].map((n)=>`'${id(100+n)}'::uuid`).join(",")}]`; const governed = `ARRAY['${id(200)}'::uuid,'${id(201)}'::uuid]`;
  const call = `select public.create_exclusive_tee_historical_cogs_draft(${legacy}::uuid[],${governed},'${id(1)}');`;
  const first = sql(call); const again = sql(`select public.create_exclusive_tee_historical_cogs_draft(ARRAY['${id(105)}'::uuid,'${id(104)}'::uuid,'${id(103)}'::uuid,'${id(102)}'::uuid,'${id(101)}'::uuid,'${id(100)}'::uuid],ARRAY['${id(201)}'::uuid,'${id(200)}'::uuid],'${id(1)}');`);
  assert.equal(again, first); assert.equal(sql("select count(*) from public.vault_historical_cogs_policy_versions where status='draft'"), "1");
  const different = sql(`select public.create_exclusive_tee_historical_cogs_draft(ARRAY['${id(101)}'::uuid,'${id(102)}'::uuid,'${id(103)}'::uuid,'${id(104)}'::uuid,'${id(105)}'::uuid,'${id(106)}'::uuid],${governed},'${id(1)}');`);
  assert.notEqual(different, first); assert.equal(sql("select count(*) from public.vault_historical_cogs_policy_versions where status='draft'"), "2");
  assert.equal(sql(`select count(*) from public.vault_historical_cogs_policy_governed_delivery_evidence where policy_version_id='${first}'`), "2");
  assert.equal(sql(`select count(*) from public.vault_historical_policy_derived_cogs_line_attributions where policy_version_id='${first}'`), "0");
  assert.match(sqlFails(`select public.create_exclusive_tee_historical_cogs_draft(${legacy}::uuid[],${governed},'${id(2)}');`), /OPERATOR_UNAUTHORISED/);
  assert.match(sqlFails(`set role service_role; delete from public.vault_historical_cogs_policy_governed_delivery_evidence;`), /permission denied/);
  assert.match(sqlFails(`update public.vault_historical_cogs_policy_governed_delivery_evidence set approval_revision=3 where policy_version_id='${first}';`), /immutable/);
  const [a,b] = await Promise.all([sqlAsync(`begin; ${call} select pg_sleep(0.4); commit;`),sqlAsync(call)]); assert.equal(a.match(/[0-9a-f-]{36}/)?.[0], b);
  assert.equal(sql("select count(*) from public.vault_historical_cogs_policy_versions where status='draft'"), "2");
});
