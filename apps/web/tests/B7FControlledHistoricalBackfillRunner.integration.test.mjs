import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runnerMigration = await readFile(new URL("../../../supabase/migrations/20261015000000_b7f_controlled_historical_backfill_runner.sql", import.meta.url), "utf8");
const safetyMigration = await readFile(new URL("../../../supabase/migrations/20261016000000_b7f_historical_backfill_runner_transaction_safety.sql", import.meta.url), "utf8");
const name = `vault-b7f-runner-${process.pid}`, docker = spawnSync("docker", ["info"], { encoding: "utf8" }).status === 0;
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
let running = false;
const run = (args, input) => { const r = spawnSync("docker", args, { encoding: "utf8", input }); if (r.status) throw new Error(r.stderr || r.stdout); return r.stdout.trim(); };
const sql = (input) => run(["exec", "-i", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "b7f", "-X", "-q"], input);
const value = (input) => JSON.parse(run(["exec", "-i", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "b7f", "-X", "-q", "-t", "-A"], input));
const call = () => run(["exec", "-i", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "b7f", "-X", "-q", "-t", "-A"], "call public.advance_b7f_historical_backfill_job_safely();").split("|");

test("transaction-safe B7F runner commits only durable receipts and preserves one bounded active window", { skip: !docker && "Docker daemon unavailable" }, async (t) => {
  t.after(() => running && spawnSync("docker", ["rm", "-f", name])); run(["run", "--rm", "-d", "--name", name, "-e", "POSTGRES_PASSWORD=x", "-e", "POSTGRES_DB=b7f", "postgres:17"]); running = true;
  for (let n = 0; n < 30; n += 1) { try { value("select 1"); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
  sql(`create extension pgcrypto;create role anon;create role authenticated;create role service_role;create schema vault;create table vault.decrypted_secrets(name text, decrypted_secret text, created_at timestamptz);insert into vault.decrypted_secrets values('vault_shopify_order_sync_service_role_jwt','test-jwt',now()),('vault_order_sync_secret','test-secret',now());create schema net;create sequence net.request_seq;create table net._http_response(id bigint,status_code integer,timed_out boolean,error_msg text,content text,created timestamptz default now());create function net.http_post(url text,body jsonb default '{}'::jsonb,params jsonb default '{}'::jsonb,headers jsonb default '{}'::jsonb,timeout_milliseconds integer default 2000) returns bigint language sql as $$select nextval('net.request_seq')$$;create table public.vault_shopify_order_sync_runs(id uuid primary key,sync_mode text,created_from timestamptz,created_before timestamptz,orders_synced integer,order_lines_synced integer,completed_at timestamptz);`);
  sql(runnerMigration);
  sql(safetyMigration);
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
  assert.doesNotMatch(safetyMigration, /cron\.schedule|decrypted_secret.*into .*vault_b7f/i);
});
