import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const source = new URL("apps/web/tests/fixtures/replay-compat/20260807500000_replay_inert_vault_secrets.sql", root);
const staged = new URL(".temp/supabase-baseline-replay/supabase/migrations/20260807500000_replay_inert_vault_secrets.sql", root);

test("inert Vault replay fixture is durable, byte-identical, secret-free, and isolated-only", async () => {
  const [fixtureBytes, stagedBytes] = await Promise.all([readFile(source), readFile(staged)]);
  assert.deepEqual(fixtureBytes, stagedBytes);

  const fixture = fixtureBytes.toString("utf8");
  assert.match(fixture, /REPLAY-ONLY/);
  assert.match(fixture, /Cron execution is disabled at the server level for this isolated runtime/);
  assert.match(fixture, /'replay-inert-service-role-jwt'/);
  assert.match(fixture, /'vault_shopify_order_sync_service_role_jwt'/);
  assert.match(fixture, /'replay-inert-order-sync-secret'/);
  assert.match(fixture, /'vault_order_sync_secret'/);
  assert.equal((fixture.match(/'Isolated baseline replay inert placeholder'/g) ?? []).length, 2);
  assert.equal((fixture.match(/select vault\.create_secret\(/gi) ?? []).length, 2);
  assert.doesNotMatch(fixture, /cron\.schedule|net\.http_post|decrypted_secrets|https?:\/\/|service_role[^_a-z]|eyJ[A-Za-z0-9_-]{10,}/i);
});
