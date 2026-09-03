import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const webRoot = new URL("../", import.meta.url);
const repositoryRoot = new URL("../../", webRoot);

async function source(relativePath) {
  return readFile(new URL(relativePath, repositoryRoot), "utf8");
}

test("Shopify pixel subscribes to canonical funnel events through the existing collector", async () => {
  const collector = await source("services/collector/vault-event-collector.js");

  for (const eventName of [
    "product_added_to_cart",
    "checkout_started",
    "checkout_completed",
  ]) {
    assert.match(collector, new RegExp(`analytics\\.subscribe\\("${eventName}"`));
  }

  assert.match(collector, /VAULT_COLLECTOR_ENDPOINT/);
  assert.match(collector, /shopify_event_id: event\.id/);
  assert.match(collector, /session_id: event\.clientId/);
  assert.match(collector, /occurred_at: event\.timestamp/);
  assert.match(collector, /shopify_checkout_token: checkout && checkout\.token/);
  assert.match(collector, /!analyticsAllowed\(\)/);
  assert.doesNotMatch(collector, /checkout\.(email|phone|billingAddress|shippingAddress)/);
});

test("collector endpoint accepts only the supported canonical event names and remains idempotent", async () => {
  const endpoint = await source("supabase/functions/collect-event/index.ts");

  for (const eventName of [
    "PAGE_VIEW",
    "PRODUCT_ADDED_TO_CART",
    "CHECKOUT_STARTED",
    "CHECKOUT_COMPLETED",
  ]) {
    assert.match(endpoint, new RegExp(`"${eventName}"`));
  }

  assert.match(endpoint, /occurred_at: new Date\(occurredAtTimestamp\)\.toISOString\(\)/);
  assert.match(endpoint, /shopify_checkout_token: checkoutToken \|\| null/);
  assert.match(endpoint, /error\?\.code === "23505"/);
  assert.match(endpoint, /Privacy-limited collection accepts PAGE_VIEW only/);
});

test("funnel migration uses London business time and exact mature checkout correlation", async () => {
  const migration = await source(
    "supabase/migrations/20260901000000_storefront_funnel_events.sql",
  );

  assert.match(migration, /add column if not exists occurred_at timestamptz/);
  assert.match(migration, /add column if not exists shopify_checkout_token text/);
  assert.match(migration, /count\(distinct session_id\)/);
  assert.match(migration, /count\(distinct started\.shopify_checkout_token\)/);
  assert.match(migration, /time zone 'Europe\/London'/);
  assert.match(migration, /now\(\) - interval '30 minutes'/);
  assert.match(migration, /completed\.shopify_checkout_token = started\.shopify_checkout_token/);
  assert.match(migration, /orders\.shopify_checkout_token = started\.shopify_checkout_token/);
  assert.doesNotMatch(migration, /event_name\s*=\s*'PAGE_VIEW'/);
  assert.doesNotMatch(migration, /update\s+public\.vault_events/i);
});

test("canonical Shopify orders retain checkout tokens and Command Centre uses the funnel view", async () => {
  const [orders, repository, loader] = await Promise.all([
    source("supabase/functions/_shared/shopify/orders.ts"),
    source("apps/web/lib/business/StorefrontFunnelRepository.ts"),
    source("apps/web/lib/command-centre/getCommandCentreCockpit.ts"),
  ]);

  assert.match(orders, /checkoutToken: string \| null/);
  assert.match(orders, /shopify_checkout_token: order\.checkoutToken/);
  assert.match(repository, /vault_storefront_funnel_today/);
  assert.match(loader, /StorefrontFunnelRepository\.getToday\(\)/);
  assert.match(loader, /funnelResult\.addToCartSessions/);
  assert.match(loader, /funnelResult\.abandonedCheckouts/);
});
