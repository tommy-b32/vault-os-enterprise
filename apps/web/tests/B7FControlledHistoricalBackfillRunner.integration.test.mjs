import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runnerMigration = await readFile(new URL("../../../supabase/migrations/20261015000000_b7f_controlled_historical_backfill_runner.sql", import.meta.url), "utf8");
const safetyMigration = await readFile(new URL("../../../supabase/migrations/20261016000000_b7f_historical_backfill_runner_transaction_safety.sql", import.meta.url), "utf8");
const ambiguityFixMigration = await readFile(new URL("../../../supabase/migrations/20261018000000_b7f_historical_backfill_runner_ambiguity_fix.sql", import.meta.url), "utf8");
const adoptionMigration = await readFile(new URL("../../../supabase/migrations/20261017000000_b7f_historical_backfill_adoption_only.sql", import.meta.url), "utf8");
const name = `vault-b7f-runner-${process.pid}`, docker = spawnSync("docker", ["info"], { encoding: "utf8" }).status === 0;
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
let running = false;
const run = (args, input) => { const r = spawnSync("docker", args, { encoding: "utf8", input }); if (r.status) throw new Error(r.stderr || r.stdout); return r.stdout.trim(); };
const sql = (input) => run(["exec", "-i", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "b7f", "-X", "-q"], input);
const value = (input) => JSON.parse(run(["exec", "-i", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "b7f", "-X", "-q", "-t", "-A"], input));
const call = () => run(["exec", "-i", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "b7f", "-X", "-q", "-t", "-A"], "call public.advance_b7f_historical_backfill_job_safely();").split("|");
const adopt = () => run(["exec", "-i", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "b7f", "-X", "-q", "-t", "-A"], "call public.adopt_b7f_historical_backfill_receipts_safely();").split("|");

test("transaction-safe B7F runner commits only durable receipts and preserves one bounded active window", { skip: !docker && "Docker daemon unavailable" }, async (t) => {
  t.after(() => running && spawnSync("docker", ["rm", "-f", name])); run(["run", "--rm", "-d", "--name", name, "-e", "POSTGRES_PASSWORD=x", "-e", "POSTGRES_DB=b7f", "postgres:17"]); running = true;
  for (let n = 0; n < 30; n += 1) { try { value("select 1"); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
  sql(`create extension pgcrypto;create role anon;create role authenticated;create role service_role;create schema vault;create table vault.decrypted_secrets(name text, decrypted_secret text, created_at timestamptz);insert into vault.decrypted_secrets values('vault_shopify_order_sync_service_role_jwt','test-jwt',now()),('vault_order_sync_secret','test-secret',now());create schema net;create sequence net.request_seq;create table net._http_response(id bigint,status_code integer,timed_out boolean,error_msg text,content text,created timestamptz default now());create function net.http_post(url text,body jsonb default '{}'::jsonb,params jsonb default '{}'::jsonb,headers jsonb default '{}'::jsonb,timeout_milliseconds integer default 2000) returns bigint language sql as $$select nextval('net.request_seq')$$;create table public.vault_shopify_order_sync_runs(id uuid primary key,sync_mode text,created_from timestamptz,created_before timestamptz,orders_synced integer,order_lines_synced integer,completed_at timestamptz);`);
  sql(runnerMigration);
  sql(safetyMigration);
  sql(ambiguityFixMigration);
  sql(adoptionMigration);
  sql(`insert into vault_shopify_order_sync_runs values('${id(1)}','historical_orders_by_created_at','2026-01-01T00:00:00Z','2026-01-08T00:00:00Z',0,0,now()),('${id(2)}','recent_orders_by_updated_at','2026-01-08T00:00:00Z','2026-01-15T00:00:00Z',99,99,now());select initialize_b7f_historical_backfill_job();`);
  assert.equal(call()[0], "adopted", "exact existing January receipt is adopted without HTTP submission");
  assert.equal(value("select state from vault_b7f_historical_backfill_windows where created_from='2026-01-01T00:00:00Z'"), "completed", "committed adoption persists its window");
  assert.equal(value("select next_window_start from vault_b7f_historical_backfill_jobs"), "2026-01-08T00:00:00+00:00");
  assert.equal(call()[0], "submitted", "next exact seven-day window is durably submitted");
  assert.equal(value("select state from vault_b7f_historical_backfill_windows where created_from='2026-01-08T00:00:00Z'"), "submitted");
  assert.equal(value("select pg_net_request_id is not null from vault_b7f_historical_backfill_windows where created_from='2026-01-08T00:00:00Z'"), true, "request id persists with submitted state");
  assert.equal(value("select active_window_id is not null from vault_b7f_historical_backfill_jobs"), true, "active pointer persists");
  const submittedRequest = value("select pg_net_request_id from vault_b7f_historical_backfill_windows where created_from='2026-01-08T00:00:00Z'");
  assert.equal(call()[0], "waiting", "submitted state prevents blind replay");
  assert.equal(value("select pg_net_request_id from vault_b7f_historical_backfill_windows where created_from='2026-01-08T00:00:00Z'"), submittedRequest, "waiting does not submit a second request");
  assert.throws(() => sql("insert into vault_b7f_historical_backfill_windows(job_id,created_from,created_before,state) select id,'2026-01-15T00:00:00Z','2026-01-22T00:00:00Z','pending' from vault_b7f_historical_backfill_jobs"), /duplicate/);
  sql(`insert into vault_shopify_order_sync_runs values('${id(3)}','historical_orders_by_created_at','2026-01-08T00:00:00Z','2026-01-15T00:00:00Z',2,3,now());`);
  assert.equal(call()[0], "attested", "only an exact historical sync run completes the window");
  assert.equal(value("select state from vault_b7f_historical_backfill_windows where created_from='2026-01-08T00:00:00Z'"), "completed", "reconciliation completion persists");
  assert.equal(value("select active_window_id is null from vault_b7f_historical_backfill_jobs"), true, "reconciliation clears active pointer");

  assert.throws(() => sql("select retry_b7f_historical_backfill_window((select id from vault_b7f_historical_backfill_windows where created_from='2026-01-08T00:00:00Z'))"), /B7F_BACKFILL_RETRY_REQUIRES_UNCERTAIN_WINDOW/, "completed windows cannot be blindly replayed");

  const requestsBeforeUnsafeCall = value("select last_value from net.request_seq");
  assert.throws(() => sql("begin; call public.advance_b7f_historical_backfill_job_safely(); rollback;"), /invalid transaction termination/, "unsafe explicit transaction fails before a result or request allocation");
  assert.equal(value("select last_value from net.request_seq"), requestsBeforeUnsafeCall, "unsafe call cannot allocate a request id");
  assert.equal(value("select count(*) from vault_b7f_historical_backfill_windows where state in ('pending','submitted','uncertain')"), 0, "unsafe call cannot create replayable runner state");

  sql("update vault_b7f_historical_backfill_jobs set next_window_start='2026-09-17T09:34:53.489Z',active_window_id=null,status='running'");
  assert.equal(call()[4], "2026-09-20 09:34:53.489+00", "final window is shortened exactly at boundary");

  sql("truncate vault_b7f_historical_backfill_windows, vault_b7f_historical_backfill_jobs, vault_shopify_order_sync_runs");
  sql(`select initialize_b7f_historical_backfill_job();update vault_b7f_historical_backfill_jobs set next_window_start='2026-01-15T00:00:00Z',status='running';insert into vault_shopify_order_sync_runs values('${id(10)}','historical_orders_by_created_at','2026-01-15T00:00:00Z','2026-01-22T00:00:00Z',3,4,'2026-02-01T00:00:00Z'),('${id(11)}','historical_orders_by_created_at','2026-01-22T00:00:00Z','2026-01-29T00:00:00Z',5,6,'2026-02-02T00:00:00Z'),('${id(12)}','recent_orders_by_updated_at','2026-01-29T00:00:00Z','2026-02-05T00:00:00Z',7,8,'2026-02-03T00:00:00Z'),('${id(13)}','historical_orders_by_created_at','2026-02-05T00:00:00Z','2026-02-12T00:00:00Z',9,10,'2026-02-04T00:00:00Z');`);
  const requestsBeforeAdoption = value("select last_value from net.request_seq");
  const adoption = adopt();
  assert.equal(adoption[0], "2", "adopts consecutive exact receipts only");
  assert.equal(adoption[1], "2026-01-29 00:00:00+00", "stops at the first gap without skipping it");
  assert.equal(adoption[2], "missing_exact_completed_receipt");
  assert.equal(adoption[3], "2026-01-29 00:00:00+00");
  assert.equal(adoption[4], "2026-02-05 00:00:00+00");
  assert.equal(value("select count(*) from vault_b7f_historical_backfill_windows"), 2, "missing window is not mutated");
  assert.equal(value("select active_window_id is null from vault_b7f_historical_backfill_jobs"), true, "adoption leaves no active window");
  assert.equal(value("select last_value from net.request_seq"), requestsBeforeAdoption, "adoption allocates no HTTP request");
  assert.throws(() => sql("begin;call public.adopt_b7f_historical_backfill_receipts_safely();rollback;"), /invalid transaction termination/, "caller-managed transaction cannot report rolled-back adoption");

  sql(`insert into vault_shopify_order_sync_runs values('${id(14)}','historical_orders_by_created_at','2026-01-29T00:00:00Z','2026-02-05T00:00:00Z',11,12,'2026-02-05T00:00:00Z');insert into vault_b7f_historical_backfill_windows(job_id,created_from,created_before,state,attempt_count,completed_sync_run_id,orders_synced,order_lines_synced,completed_at) select id,'2026-01-29T00:00:00Z','2026-02-05T00:00:00Z','completed',1,'${id(14)}',11,12,'2026-02-05T00:00:00Z' from vault_b7f_historical_backfill_jobs;`);
  assert.equal(adopt()[0], "2", "an already completed matching window is idempotently advanced without duplication");
  sql(`update vault_b7f_historical_backfill_jobs set next_window_start='2026-01-29T00:00:00Z',status='running',completed_at=null;insert into vault_shopify_order_sync_runs values('${id(15)}','historical_orders_by_created_at','2026-01-29T00:00:00Z','2026-02-05T00:00:00Z',13,14,'2026-02-06T00:00:00Z');`);
  assert.throws(() => adopt(), /B7F_BACKFILL_COMPLETED_WINDOW_RECEIPT_CONFLICT/, "a conflicting later exact receipt cannot rewrite completed runner evidence");

  sql("update vault_b7f_historical_backfill_jobs set next_window_start='2026-02-12T00:00:00Z';insert into vault_b7f_historical_backfill_windows(job_id,created_from,created_before,state,attempt_count) select id,'2026-02-12T00:00:00Z','2026-02-19T00:00:00Z','pending',1 from vault_b7f_historical_backfill_jobs;update vault_b7f_historical_backfill_jobs set active_window_id=(select id from vault_b7f_historical_backfill_windows where state='pending')");
  assert.throws(() => adopt(), /B7F_BACKFILL_ACTIVE_WINDOW_REQUIRES_RECONCILIATION/, "active window fails closed instead of adoption");
});

test("transaction-safe runner source contract retains explicit retry, no cron, Vault-only credentials, and fail-closed CALL", () => {
  assert.match(runnerMigration, /from_boundary = '2026-01-01T00:00:00\.000Z'/);
  assert.match(runnerMigration, /through_boundary = '2026-09-20T09:34:53\.489Z'/);
  assert.match(runnerMigration, /vault_b7f_historical_backfill_one_active_window/);
  assert.match(runnerMigration, /B7F_BACKFILL_RETRY_REQUIRES_UNCERTAIN_WINDOW/);
  assert.match(safetyMigration, /commit;\s*\n\s*select \* into j/s, "first procedure operation commits, rejecting explicit caller transactions before reads/writes");
  assert.match(safetyMigration, /revoke execute on function public\.advance_b7f_historical_backfill_job\(\) from service_role/);
  assert.match(safetyMigration, /drop function public\.advance_b7f_historical_backfill_job\(\)/, "the rollback-prone advance function is removed");
  assert.match(safetyMigration, /vault\.decrypted_secrets/);
  assert.match(safetyMigration, /state = 'uncertain'/);
  assert.match(safetyMigration, /holding the submission-phase locks[\s\S]*b7f_backfill_complete_if_attested\(w\.id\)/, "a receipt committed after reservation is adopted before pg_net submission");
  assert.match(safetyMigration, /language plpgsql\s+as \$\$/, "the transaction-controlling procedure is invoker-security");
  assert.match(ambiguityFixMigration, /on conflict do nothing/, "the OUT parameter job_id cannot collide with an inferred conflict-column list");
  assert.doesNotMatch(ambiguityFixMigration, /on conflict\s*\(\s*job_id\s*,\s*created_from\s*,\s*created_before\s*\)/i, "no ambiguous ON CONFLICT inference references remain");
  assert.match(ambiguityFixMigration, /from public\.vault_b7f_historical_backfill_windows as existing_window\s+where existing_window\.job_id = j\.id\s+and existing_window\.created_from = j\.next_window_start\s+and existing_window\.created_before = v_before/s, "OUT-parameter names are qualified in the conflict recovery lookup");
  assert.doesNotMatch(safetyMigration, /cron\.schedule|decrypted_secret.*into .*vault_b7f/i);
  assert.match(adoptionMigration, /for update[\s\S]*pg_advisory_xact_lock/, "adoption uses the normal runner lock discipline");
  assert.match(adoptionMigration, /order by completed_at desc, id desc/, "exact receipts are selected deterministically");
  assert.match(adoptionMigration, /least\(j\.next_window_start \+ make_interval\(hours => j\.window_hours\), j\.through_boundary\)/, "final adoption window cannot cross the boundary");
  assert.match(adoptionMigration, /commit;\s*\n\s*adopted_windows := 0/s, "caller-managed transaction fails before adoption progress");
  assert.match(adoptionMigration, /B7F_BACKFILL_COMPLETED_WINDOW_RECEIPT_CONFLICT/, "conflicting completed runner evidence fails closed instead of being rewritten");
  assert.doesNotMatch(adoptionMigration, /net\.http_post|\bnet\.|vault\.|advance_b7f_historical_backfill_job_safely|uncertain|submitted/i, "adoption helper is structurally HTTP- and Vault-free");
});
