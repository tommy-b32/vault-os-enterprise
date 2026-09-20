import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../../supabase/migrations/20261015000000_b7f_controlled_historical_backfill_runner.sql", import.meta.url), "utf8");
const name = `vault-b7f-runner-${process.pid}`, docker = spawnSync("docker", ["info"], { encoding: "utf8" }).status === 0;
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
let running = false;
const run = (args, input) => { const r = spawnSync("docker", args, { encoding: "utf8", input }); if (r.status) throw new Error(r.stderr || r.stdout); return r.stdout.trim(); };
const sql = (input) => run(["exec", "-i", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "b7f", "-X", "-q"], input);
const value = (input) => JSON.parse(run(["exec", "-i", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "b7f", "-X", "-q", "-t", "-A"], input));

test("controlled B7F runner persists one bounded window and advances only by exact historical receipts", { skip: !docker && "Docker daemon unavailable" }, async (t) => {
  t.after(() => running && spawnSync("docker", ["rm", "-f", name])); run(["run", "--rm", "-d", "--name", name, "-e", "POSTGRES_PASSWORD=x", "-e", "POSTGRES_DB=b7f", "postgres:17"]); running = true;
  for (let n = 0; n < 30; n += 1) { try { value("select 1"); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
  sql(`create extension pgcrypto;create role anon;create role authenticated;create role service_role;create schema vault;create table vault.decrypted_secrets(name text, decrypted_secret text, created_at timestamptz);insert into vault.decrypted_secrets values('vault_shopify_order_sync_service_role_jwt','test-jwt',now()),('vault_order_sync_secret','test-secret',now());create schema net;create sequence net.request_seq;create table net._http_response(id bigint,status_code integer,timed_out boolean,error_msg text,content text,created timestamptz default now());create function net.http_post(url text,body jsonb default '{}'::jsonb,params jsonb default '{}'::jsonb,headers jsonb default '{}'::jsonb,timeout_milliseconds integer default 2000) returns bigint language sql as $$select nextval('net.request_seq')$$;create table public.vault_shopify_order_sync_runs(id uuid primary key,sync_mode text,created_from timestamptz,created_before timestamptz,orders_synced integer,order_lines_synced integer,completed_at timestamptz);`);
  sql(migration);
  sql(`insert into vault_shopify_order_sync_runs values('${id(1)}','historical_orders_by_created_at','2026-01-01T00:00:00Z','2026-01-08T00:00:00Z',0,0,now()),('${id(2)}','recent_orders_by_updated_at','2026-01-08T00:00:00Z','2026-01-15T00:00:00Z',99,99,now());select initialize_b7f_historical_backfill_job();`);
  assert.equal(value("select action from advance_b7f_historical_backfill_job()"), "adopted", "exact existing January receipt is adopted without request");
  assert.equal(value("select next_window_start from vault_b7f_historical_backfill_jobs"), "2026-01-08T00:00:00+00:00");
  assert.equal(value("select action from advance_b7f_historical_backfill_job()"), "submitted", "next exact seven-day window is pending then submitted");
  assert.equal(value("select state from vault_b7f_historical_backfill_windows where created_from='2026-01-08T00:00:00Z'"), "submitted");
  assert.throws(() => sql("insert into vault_b7f_historical_backfill_windows(job_id,created_from,created_before,state) select id,'2026-01-15T00:00:00Z','2026-01-22T00:00:00Z','pending' from vault_b7f_historical_backfill_jobs"), /duplicate/);
  sql(`insert into vault_shopify_order_sync_runs values('${id(3)}','historical_orders_by_created_at','2026-01-08T00:00:00Z','2026-01-15T00:00:00Z',2,3,now());`);
  assert.equal(value("select action from advance_b7f_historical_backfill_job()"), "attested", "only an exact historical sync run completes the window");
  sql("update vault_b7f_historical_backfill_jobs set next_window_start='2026-09-17T09:34:53.489Z',active_window_id=null,status='running'");
  assert.equal(value("select created_before from advance_b7f_historical_backfill_job()"), "2026-09-20T09:34:53.489+00:00", "final window is shortened exactly at boundary");
});

test("controlled runner source contract retains explicit retry, no cron, and Vault-only credentials", () => {
  assert.match(migration, /from_boundary = '2026-01-01T00:00:00\.000Z'/);
  assert.match(migration, /through_boundary = '2026-09-20T09:34:53\.489Z'/);
  assert.match(migration, /vault_b7f_historical_backfill_one_active_window/);
  assert.match(migration, /B7F_BACKFILL_RETRY_REQUIRES_UNCERTAIN_WINDOW/);
  assert.match(migration, /vault\.decrypted_secrets/);
  assert.doesNotMatch(migration, /cron\.schedule|decrypted_secret.*into .*vault_b7f/i);
});
