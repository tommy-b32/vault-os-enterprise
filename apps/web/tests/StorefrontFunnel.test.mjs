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
  const [baseMigration, migration] = await Promise.all([
    source("supabase/migrations/20260901000000_storefront_funnel_events.sql"),
    source("supabase/migrations/20260903200000_command_centre_live_funnel_rates.sql"),
  ]);

  assert.match(baseMigration, /add column if not exists occurred_at timestamptz/);
  assert.match(baseMigration, /add column if not exists shopify_checkout_token text/);
  assert.match(migration, /select distinct session_id/);
  assert.match(migration, /join tracked_sessions tracked on tracked\.session_id = event\.session_id/);
  assert.match(migration, /event\.analytics_allowed = true/);
  assert.match(migration, /event\.occurred_at is not null/);
  assert.match(migration, /count\(distinct started\.shopify_checkout_token\)/);
  assert.match(migration, /time zone 'Europe\/London'/);
  assert.match(migration, /now\(\) - interval '30 minutes'/);
  assert.match(migration, /completed\.shopify_checkout_token = started\.shopify_checkout_token/);
  assert.match(migration, /orders\.shopify_checkout_token = started\.shopify_checkout_token/);
  assert.match(migration, /event_name = 'PAGE_VIEW'/);
  assert.match(migration, /nullif\(today_events\.tracked_sessions, 0\)/);
  assert.doesNotMatch(migration, /update\s+public\.vault_events/i);
});

test("funnel source readiness keeps missing sources and zero denominators unavailable", async () => {
  const migration = await source(
    "supabase/migrations/20260903200000_command_centre_live_funnel_rates.sql",
  );

  for (const readiness of [
    "sessions_available",
    "add_to_cart_available",
    "checkout_started_available",
    "checkout_completed_available",
  ]) {
    assert.match(migration, new RegExp(readiness));
  }
  assert.match(migration, /case when source_status\.sessions_available/);
  assert.match(migration, /else null end as tracked_sessions/);
  assert.match(migration, /nullif\(today_events\.tracked_sessions, 0\)/);
});

test("Europe/London business dates follow both BST and GMT boundaries", () => {
  const londonDate = (timestamp) => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));

  assert.equal(londonDate("2026-06-01T22:59:59Z"), "2026-06-01");
  assert.equal(londonDate("2026-06-01T23:00:00Z"), "2026-06-02");
  assert.equal(londonDate("2026-01-15T23:59:59Z"), "2026-01-15");
  assert.equal(londonDate("2026-01-16T00:00:00Z"), "2026-01-16");
});

test("funnel counts sessions rather than repeated events and completion prevents abandonment", async () => {
  const migration = await source(
    "supabase/migrations/20260903200000_command_centre_live_funnel_rates.sql",
  );

  assert.match(migration, /count\(distinct event\.session_id\).*PRODUCT_ADDED_TO_CART/s);
  assert.match(migration, /count\(distinct event\.session_id\).*CHECKOUT_COMPLETED/s);
  assert.match(migration, /completed\.shopify_checkout_token = started\.shopify_checkout_token/);
  assert.match(migration, /orders\.shopify_checkout_token = started\.shopify_checkout_token/);
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
  assert.match(loader, /funnelResult\.trackedSessions/);
  assert.match(loader, /funnelResult\.checkoutStartedSessions/);
  assert.match(loader, /funnelResult\.checkoutCompletedSessions/);
  assert.match(loader, /funnelResult\.conversionRate/);
  assert.match(loader, /funnelResult\.abandonedCheckouts/);
});

test("Shopify trading and fulfilment exclude cancelled and test orders", async () => {
  const repository = await source(
    "apps/web/lib/business/ShopifyTradingRepository.ts",
  );

  assert.match(repository, /\.is\("cancelled_at", null\)/);
  assert.match(repository, /\.eq\("metadata->>test", false\)/);
  assert.match(repository, /getOperationsSnapshot/);
  assert.match(repository, /awaitingFulfilment/);
  assert.doesNotMatch(repository, /shopify_updated_at.*dispatch/s);
});

test("missing operational event timestamps and incomplete inventory cost coverage remain unavailable", async () => {
  const loader = await source(
    "apps/web/lib/command-centre/getCommandCentreCockpit.ts",
  );

  assert.match(loader, /stockValue: unavailable\(\)/);
  assert.match(loader, /dispatchedToday: unavailable\(\)/);
  assert.match(loader, /refundsToday: unavailable\(\)/);
  assert.match(loader, /supplierIssues: unavailable\(\)/);
  assert.match(loader, /lateDeliveries: unavailable\(\)/);
});

test("zero and insufficient prior-day history never create a misleading comparison", async () => {
  const state = await source("apps/web/lib/business/VaultBusinessState.ts");

  assert.match(state, /previous === undefined \|\| previous === 0/);
  assert.match(state, /return null/);
});
