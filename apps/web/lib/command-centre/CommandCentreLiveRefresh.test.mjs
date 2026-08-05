import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  COMMAND_CENTRE_REFRESH_EVENT_TYPES,
  isCommandCentreRefreshEvent,
} from "./CommandCentreRefreshEvents.ts";
import {
  decideRefreshRequest,
  RECOVERY_REFRESH_MS,
  REFRESH_DEBOUNCE_MS,
  shouldScheduleFinalRefresh,
} from "./CommandCentreLiveRefreshPolicy.ts";

const webRoot = new URL("../../", import.meta.url);
const repositoryRoot = new URL("../../../../", import.meta.url);

test("canonical refresh mapping covers every approved Command Centre domain event", () => {
  assert.deepEqual(COMMAND_CENTRE_REFRESH_EVENT_TYPES.inventory, [
    "inventory-sync-started",
    "inventory-sync-completed",
    "inventory-sync-failed",
  ]);
  assert.ok(COMMAND_CENTRE_REFRESH_EVENT_TYPES.trading.includes("order-sync-completed"));
  assert.ok(COMMAND_CENTRE_REFRESH_EVENT_TYPES.finance.includes("cash-transaction-created"));
  assert.ok(COMMAND_CENTRE_REFRESH_EVENT_TYPES.catalogue.includes("product-settings-updated"));
  assert.ok(COMMAND_CENTRE_REFRESH_EVENT_TYPES["advisor-input"].includes("reorder-approval-approved"));
});

test("unrelated and malformed refresh rows are ignored safely", () => {
  assert.equal(isCommandCentreRefreshEvent(null), false);
  assert.equal(isCommandCentreRefreshEvent({ domain: "other", event_type: "changed" }), false);
  assert.equal(isCommandCentreRefreshEvent({ domain: "inventory", event_type: "other" }), false);
  assert.equal(isCommandCentreRefreshEvent({ domain: "inventory", event_type: "inventory-sync-failed" }), true);
});

test("refresh policy debounces bursts, queues one final refresh, and defers hidden work", () => {
  assert.equal(REFRESH_DEBOUNCE_MS, 750);
  assert.equal(decideRefreshRequest({ hidden: false, online: true, refreshInFlight: false }), "debounce");
  assert.equal(decideRefreshRequest({ hidden: false, online: true, refreshInFlight: true }), "queue");
  assert.equal(decideRefreshRequest({ hidden: true, online: true, refreshInFlight: false }), "defer");
  assert.equal(decideRefreshRequest({ hidden: false, online: false, refreshInFlight: false }), "defer");
  assert.equal(shouldScheduleFinalRefresh(true), true);
  assert.equal(shouldScheduleFinalRefresh(false), false);
});

test("client confirms subscription truthfully and uses one page-level 90-second recovery interval", async () => {
  const client = await readFile(
    new URL("components/command-centre/CommandCentreLiveRefresh.tsx", webRoot),
    "utf8",
  );

  assert.equal(RECOVERY_REFRESH_MS, 90_000);
  assert.match(client, /subscriptionStatus === "SUBSCRIBED"/);
  assert.match(client, /subscriptionConfirmedRef\.current = true/);
  assert.match(client, /useState<CommandCentreLiveStatus>\("connecting"\)/);
  assert.doesNotMatch(client, /useState<CommandCentreLiveStatus>\("live"\)/);
  assert.match(client, /subscriptionStatus === "TIMED_OUT"[\s\S]*setStatus\("delayed"\)/);
  assert.match(client, /CHANNEL_ERROR[\s\S]*setStatus\("reconnecting"\)/);
  assert.match(client, /handleOffline[\s\S]*setStatus\("unavailable"\)/);
  assert.match(client, /const handleVisibilityChange[\s\S]*startRefresh\(\)/);
  assert.match(client, /event: "INSERT"/);
  assert.doesNotMatch(client, /30_000|setInterval[\s\S]{0,120}(revenue|orders|inventory)/i);
  assert.doesNotMatch(client, /SUPABASE_(SERVICE_ROLE|SECRET)_KEY/);
  assert.doesNotMatch(client, /calculate|averageOrderValue|purchasingPower|netRevenue/);
});

test("generatedAt completes an active refresh and preserves the queued final refresh", async () => {
  const client = await readFile(
    new URL("components/command-centre/CommandCentreLiveRefresh.tsx", webRoot),
    "utf8",
  );

  assert.match(client, /previousGeneratedAtRef\.current === generatedAt/);
  assert.match(client, /refreshInFlightRef\.current = false/);
  assert.match(client, /setStatus\("updated"\)/);
  assert.match(client, /if \(finalRefreshRequired\) requestDebouncedRefresh\(\)/);
});

test("refresh table is authenticated, append-only, payload-free, published, and bounded", async () => {
  const migration = await readFile(
    new URL("supabase/migrations/20260807000000_command_centre_refresh_events.sql", repositoryRoot),
    "utf8",
  );

  assert.match(migration, /enable row level security/i);
  assert.match(migration, /to authenticated[\s\S]*operator\.is_active = true/i);
  assert.match(migration, /revoke all[^;]*anon, authenticated/i);
  assert.match(migration, /grant select[^;]*to authenticated/i);
  assert.doesNotMatch(migration, /grant (insert|update|delete)[^;]*to authenticated/i);
  assert.match(migration, /append-only/i);
  assert.match(migration, /alter publication supabase_realtime[\s\S]*vault_command_centre_refresh_events/i);
  assert.match(migration, /cleanup_command_centre_refresh_events[\s\S]*interval '7 days'/i);
  assert.doesNotMatch(migration, /\bamount\b|\bcustomer\b|inventory_quantity|error_message|\bsecret\b/i);
});

test("canonical mutation owners emit only after successful writes", async () => {
  const [inventory, orderSync, webhook, cash, catalogue, commercial] = await Promise.all([
    readFile(new URL("supabase/functions/shopify-inventory-sync/index.ts", repositoryRoot), "utf8"),
    readFile(new URL("supabase/functions/shopify-order-sync/index.ts", repositoryRoot), "utf8"),
    readFile(new URL("supabase/functions/shopify-order-webhook/index.ts", repositoryRoot), "utf8"),
    readFile(new URL("app/commercial/actions.ts", webRoot), "utf8"),
    readFile(new URL("app/catalogue/actions.ts", webRoot), "utf8"),
    readFile(new URL("app/catalogue/commercial-actions.ts", webRoot), "utf8"),
  ]);

  for (const eventType of ["inventory-sync-started", "inventory-sync-completed", "inventory-sync-failed"]) {
    assert.match(inventory, new RegExp(eventType));
  }
  assert.ok(orderSync.indexOf("vault_shopify_order_sync_runs") < orderSync.indexOf("order-sync-completed"));
  assert.ok(webhook.indexOf('status: "complete"') < webhook.indexOf("order-created-completed"));
  assert.match(webhook, /fulfilment-sync-completed/);
  assert.match(webhook, /refund-sync-completed/);
  assert.ok(cash.indexOf('result === "created"') < cash.indexOf("cash-transaction-created"));
  assert.match(catalogue, /product-settings-updated/);
  assert.match(catalogue, /reorder-approval-approved/);
  assert.match(catalogue, /reorder-approval-revoked/);
  assert.match(commercial, /commercial-costs-updated/);
});

test("legacy public trading Broadcast is removed and canonical server loading remains intact", async () => {
  const [migration, client, page, loader, contract, emitter] = await Promise.all([
    readFile(new URL("supabase/migrations/20260807000000_command_centre_refresh_events.sql", repositoryRoot), "utf8"),
    readFile(new URL("components/command-centre/CommandCentreLiveRefresh.tsx", webRoot), "utf8"),
    readFile(new URL("app/page.tsx", webRoot), "utf8"),
    readFile(new URL("lib/command-centre/getCommandCentreCockpit.ts", webRoot), "utf8"),
    readFile(new URL("lib/command-centre/CommandCentreRefreshEvents.ts", webRoot), "utf8"),
    readFile(new URL("lib/command-centre/emitCommandCentreRefreshEvent.ts", webRoot), "utf8"),
  ]);

  assert.match(migration, /drop trigger if exists vault_shopify_orders_broadcast_trading_changed/i);
  assert.match(migration, /drop trigger if exists vault_shopify_order_lines_broadcast_trading_changed/i);
  assert.doesNotMatch(client, /vault-os:trading|trading-changed|broadcast/);
  assert.match(page, /dynamic = "force-dynamic"/);
  assert.match(loader, /getVaultBusinessState/);
  assert.match(loader, /getCommercialDecisionTimeline/);
  assert.doesNotMatch(loader, /CommandCentreLiveRefresh/);
  assert.doesNotMatch(client, /emitCommandCentreRefreshEvent|CommandCentreCockpit/);
  assert.doesNotMatch(contract, /components\/|supabase-admin|server-only/);
  assert.doesNotMatch(emitter, /components\/command-centre|CommandCentreLiveRefresh/);
});
