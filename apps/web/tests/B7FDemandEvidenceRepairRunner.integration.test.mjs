import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../../supabase/migrations/20261019000000_b7f_controlled_demand_evidence_repair_runner.sql", import.meta.url), "utf8");
const docker = spawnSync("docker", ["info"], { encoding: "utf8" }).status === 0;
const name = `vault-b7f-repair-${process.pid}`;
const run = (args, input) => { const result = spawnSync("docker", args, { encoding: "utf8", input }); if (result.status) throw new Error(result.stderr || result.stdout); return result.stdout.trim(); };
const sql = (input) => run(["exec", "-i", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "b7f", "-X", "-q"], input);
const value = (input) => JSON.parse(run(["exec", "-i", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "b7f", "-X", "-q", "-t", "-A"], input));

test("B7F demand-evidence repair runner source contract is fixed, isolated, Vault-only, and fail-closed", () => {
  assert.match(migration, /from_boundary = '2026-04-30T00:00:00\.000Z'/);
  assert.match(migration, /through_boundary = '2026-09-03T00:00:00\.000Z'/);
  assert.match(migration, /window_hours = 168/);
  assert.match(migration, /commit;\s*\n\s*select \* into repair_job/, "unsafe caller-managed transactions fail before reads or writes");
  assert.match(migration, /count\(distinct o\.id\).*count\(l\.id\).*count\(d\.id\).*d\.id is null/s, "preflight reconciles the exact Shopify-line population");
  assert.match(migration, /preflight_missing = 0[\s\S]*?no HTTP submitted/, "already-covered or empty windows skip HTTP");
  assert.match(migration, /preflight_orders > 50[\s\S]*?no HTTP submitted/, "oversized windows fail closed before HTTP");
  assert.match(migration, /set active_window_id = repair_window\.id, status = 'running'[\s\S]*?commit;[\s\S]*?select net\.http_post/s, "pending reservation commits before pg_net submission");
  assert.match(migration, /historical_orders_by_created_at[\s\S]*?postflight_missing <> 0/s, "exact receipt and zero-missing postflight reconciliation are both required");
  assert.match(migration, /pg_input_is_valid\(response\.content, 'jsonb'\)[\s\S]*?valid_http_response := coalesce\(response_body -> 'success' = 'true'::jsonb[\s\S]*?sync_mode.*historical_orders_by_created_at[\s\S]*?, false\)/s, "missing or malformed 2xx application fields fail closed rather than producing SQL NULL");
  assert.match(migration, /started_at >= repair_window\.submitted_at[\s\S]*?order by sr\.completed_at desc, sr\.id desc/, "only fresh exact receipts are deterministically eligible");
  assert.match(migration, /if new_request_id is null[\s\S]*?state = 'uncertain'[\s\S]*?automatic replay is forbidden/s, "a null pg_net id cannot be represented as submitted");
  assert.match(migration, /postflight_expected <> repair_window\.preflight_expected_lines[\s\S]*?postflight_existing <> postflight_expected[\s\S]*?postflight_missing <> 0/s, "postflight counts must exactly reconcile before completion");
  assert.match(migration, /state <> 'submitted' or \(pg_net_request_id is not null and submitted_at is not null and attempt_count > 0\)/, "submitted state requires durable request metadata");
  assert.match(migration, /state = 'uncertain'[\s\S]*?automatic replay is forbidden/s, "ambiguous outcomes cannot auto-retry");
  assert.match(migration, /vault\.decrypted_secrets/);
  assert.match(migration, /language plpgsql\s+as \$\$/, "procedure remains SECURITY INVOKER by default");
  assert.match(migration, /revoke all on procedure public\.advance_b7f_demand_evidence_repair_job_safely\(\).*service_role/);
  assert.match(migration, /grant execute on procedure public\.advance_b7f_demand_evidence_repair_job_safely\(\) to postgres/);
  assert.doesNotMatch(migration, /vault_b7f_historical_backfill_jobs|vault_b7f_historical_backfill_windows|initialize_b7f_historical_backfill_job|advance_b7f_historical_backfill_job_safely/);
  assert.doesNotMatch(migration, /cron\.schedule|retry_b7f/i);
  assert.doesNotMatch(migration, /on conflict\s*\(\s*job_id\s*,\s*created_from\s*,\s*created_before\s*\)/i, "OUT names cannot collide with an inferred conflict target");
});

test("B7F repair runner reserves, submits, and attests only after receipt plus zero-missing reconciliation", { skip: !docker && "Docker daemon unavailable" }, async (t) => {
  t.after(() => spawnSync("docker", ["rm", "-f", name]));
  run(["run", "--rm", "-d", "--name", name, "-e", "POSTGRES_PASSWORD=x", "-e", "POSTGRES_DB=b7f", "postgres:17"]);
  for (let n = 0; n < 30; n += 1) { try { value("select 1"); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); } }
  sql("create extension pgcrypto;create role anon;create role authenticated;create role service_role;create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text,created_at timestamptz);insert into vault.decrypted_secrets values('vault_shopify_order_sync_service_role_jwt','jwt',now()),('vault_order_sync_secret','secret',now());create schema net;create sequence net.request_seq;create table net._http_response(id bigint,status_code integer,timed_out boolean,error_msg text,content text,created timestamptz);create function net.http_post(url text,body jsonb default '{}'::jsonb,params jsonb default '{}'::jsonb,headers jsonb default '{}'::jsonb,timeout_milliseconds integer default 0) returns bigint language sql as $$select nextval('net.request_seq')$$;create function public.b7f_backfill_touch() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;create table public.vault_shopify_order_sync_runs(id uuid primary key default gen_random_uuid(),sync_mode text,created_from timestamptz,created_before timestamptz,orders_synced integer,order_lines_synced integer,started_at timestamptz,completed_at timestamptz);create table public.vault_shopify_orders(id uuid primary key default gen_random_uuid(),source text,shopify_created_at timestamptz,metadata jsonb);create table public.vault_shopify_order_lines(id uuid primary key default gen_random_uuid(),order_id uuid,source text,shopify_line_item_id text);create table public.vault_shopify_demand_line_observations(id uuid primary key default gen_random_uuid(),source text,shopify_line_item_id text,unique(source,shopify_line_item_id));");
  sql(migration);
  sql("select public.initialize_b7f_demand_evidence_repair_job();insert into public.vault_shopify_orders(source,shopify_created_at,metadata) values('shopify','2026-05-01T00:00:00Z','{}');insert into public.vault_shopify_order_lines(order_id,source,shopify_line_item_id) select id,'shopify','line-1' from public.vault_shopify_orders;");
  assert.equal(run(["exec", "-i", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "b7f", "-X", "-q", "-t", "-A"], "call public.advance_b7f_demand_evidence_repair_job_safely();").split("|")[0], "submitted");
  assert.equal(value("select state from public.vault_b7f_demand_evidence_repair_windows"), "submitted");
  assert.equal(value("select pg_net_request_id is not null from public.vault_b7f_demand_evidence_repair_windows"), true, "durable reservation receives one request id");
  sql("insert into public.vault_shopify_demand_line_observations(source,shopify_line_item_id) values('shopify','line-1');insert into public.vault_shopify_order_sync_runs(sync_mode,created_from,created_before,orders_synced,order_lines_synced,started_at,completed_at) values('historical_orders_by_created_at','2026-04-30T00:00:00Z','2026-05-07T00:00:00Z',1,1,now(),now());insert into net._http_response values(1,200,false,null,'{\"success\":true,\"sync_mode\":\"historical_orders_by_created_at\",\"created_from\":\"2026-04-30T00:00:00Z\",\"created_before\":\"2026-05-07T00:00:00Z\"}',now());");
  assert.equal(run(["exec", "-i", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "b7f", "-X", "-q", "-t", "-A"], "call public.advance_b7f_demand_evidence_repair_job_safely();").split("|")[0], "attested");
  assert.equal(value("select state from public.vault_b7f_demand_evidence_repair_windows"), "completed");
});
