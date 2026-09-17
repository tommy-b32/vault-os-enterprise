import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../../../supabase/migrations/20261004000000_governed_decision_memory_capture_schedule.sql", import.meta.url),
  "utf8",
);

test("governed memory scheduler is a single 15-minute named pg_cron job", () => {
  assert.equal((migration.match(/'governed-decision-memory-capture'/g) ?? []).length, 2);
  assert.match(migration, /'\*\/15 \* \* \* \*'/);
  assert.match(migration, /where jobname = 'governed-decision-memory-capture'/);
  assert.match(migration, /perform cron\.unschedule\(existing_job_id\)/);
  assert.match(migration, /perform cron\.schedule\(/);
  assert.doesNotMatch(migration, /vault-shopify|vault-meta|command-centre-refresh/);
});

test("scheduler POSTs only to the approved protected endpoint with a Vault-held scheduler secret", () => {
  assert.match(migration, /url := 'https:\/\/vault-os-enterprise-5f4k\.vercel\.app\/api\/internal\/governed-decision-memory\/capture'/);
  assert.match(migration, /select decrypted_secret[\s\S]*from vault\.decrypted_secrets[\s\S]*name = 'governed_decision_memory_scheduler_secret'/);
  assert.match(migration, /'Authorization', 'Bearer ' \|\| decrypted_secret/);
  assert.match(migration, /'Content-Type', 'application\/json'/);
  assert.match(migration, /body := '\{\}'::jsonb/);
  assert.match(migration, /timeout_milliseconds := 15000/);
  assert.match(migration, /if scheduler_secret is null or btrim\(scheduler_secret\) = '' then[\s\S]*raise exception/);
  assert.match(migration, /and btrim\(decrypted_secret\) <> ''/);
  assert.doesNotMatch(migration, /SUPABASE_SECRET_KEY|service_role|NEXT_PUBLIC|GOVERNED_DECISION_MEMORY_SCHEDULER_SECRET/);
});

test("scheduler does not alter governed-memory persistence semantics or supply governed state", () => {
  assert.doesNotMatch(migration, /insert into|update public\.vault_governed_decision_memory|delete from public\.vault_governed_decision_memory|record_governed_decision_memory|semantic_hash|observed_at|capture_kind|style_states|wallet_state|supplier_qualifications/);
  assert.doesNotMatch(migration, /alter table public\.vault_governed_decision_memory|create table public\.vault_governed_decision_memory|enable row level security|grant |revoke /);
  assert.match(migration, /create extension if not exists pg_cron/);
  assert.match(migration, /create extension if not exists pg_net/);
  assert.match(migration, /create extension if not exists supabase_vault/);
});
