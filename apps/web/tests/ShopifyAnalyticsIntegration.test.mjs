import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { checkShopifyAnalyticsAccess, parseShopifyAnalyticsTable, SHOPIFY_ANALYTICS_QUERY } from "../../../supabase/functions/_shared/shopify/analytics.ts";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const columns = ["day", "sessions", "online_store_visitors", "sessions_with_cart_additions", "sessions_that_reached_checkout", "sessions_that_completed_checkout", "conversion_rate"].map((name) => ({ name, dataType: name === "day" ? "DATE" : "NUMBER" }));
const analyticsAccess = (...handles) => ({
  shop: { id: "shop", ianaTimezone: "Europe/London" },
  currentAppInstallation: { accessScopes: handles.map((handle) => ({ handle })) },
});

test("ShopifyQL requests seven daily human-session aggregates and Shopify conversion", () => {
  assert.match(SHOPIFY_ANALYTICS_QUERY, /FROM sessions/);
  assert.match(SHOPIFY_ANALYTICS_QUERY, /WHERE human_or_bot_session = 'human'/);
  assert.match(SHOPIFY_ANALYTICS_QUERY, /TIMESERIES day/);
  assert.match(SHOPIFY_ANALYTICS_QUERY, /SINCE -6d UNTIL today/);
  for (const metric of columns.slice(1).map(({ name }) => name)) assert.match(SHOPIFY_ANALYTICS_QUERY, new RegExp(`\\b${metric}\\b`));
});

test("parser preserves zero, partial current-day values, and Shopify-provided conversion", () => {
  const days = parseShopifyAnalyticsTable({ columns, rows: [
    ["2026-09-03", 0, 0, 0, 0, 0, 0],
    ["2026-09-04", 68, null, 7, 2, 1, 0.0147],
  ] });
  assert.equal(days.length, 2);
  assert.equal(days[0].sessions, 0);
  assert.equal(days[1].visitors, null);
  assert.equal(days[1].conversionRate, 0.0147);
});

test("Analytics access accepts cached read_reports without refreshing", async () => {
  let queries = 0;
  let refreshes = 0;
  const access = await checkShopifyAnalyticsAccess(
    async () => {
      queries += 1;
      return analyticsAccess("read_reports");
    },
    async () => {
      refreshes += 1;
    },
  );
  assert.equal(access.currentAppInstallation.accessScopes[0].handle, "read_reports");
  assert.equal(queries, 1);
  assert.equal(refreshes, 0);
});

test("Analytics access refreshes once when cached token lacks read_reports", async () => {
  let queries = 0;
  let refreshes = 0;
  const access = await checkShopifyAnalyticsAccess(
    async () => analyticsAccess(...(++queries === 1 ? [] : ["read_reports"])),
    async () => {
      refreshes += 1;
    },
  );
  assert.equal(access.currentAppInstallation.accessScopes[0].handle, "read_reports");
  assert.equal(queries, 2);
  assert.equal(refreshes, 1);
});

test("Analytics access stops after one refresh when read_reports remains absent", async () => {
  let queries = 0;
  let refreshes = 0;
  const access = await checkShopifyAnalyticsAccess(
    async () => {
      queries += 1;
      return analyticsAccess("read_products");
    },
    async () => {
      refreshes += 1;
    },
  );
  assert.equal(access.currentAppInstallation.accessScopes.some(({ handle }) => handle === "read_reports"), false);
  assert.equal(queries, 2);
  assert.equal(refreshes, 1);
});

test("Analytics access safely propagates a one-time token refresh failure", async () => {
  let queries = 0;
  let refreshes = 0;
  await assert.rejects(
    checkShopifyAnalyticsAccess(
      async () => {
        queries += 1;
        return analyticsAccess();
      },
      async () => {
        refreshes += 1;
        throw new Error("token refresh failed");
      },
    ),
    /token refresh failed/,
  );
  assert.equal(queries, 1);
  assert.equal(refreshes, 1);
});

test("cache is aggregate-only, idempotent, stale-aware, and permission-safe", async () => {
  const [migration, edge, analytics, repository] = await Promise.all([
    read("supabase/migrations/20260904120000_shopify_analytics_daily.sql"),
    read("supabase/functions/shopify-analytics-sync/index.ts"),
    read("supabase/functions/_shared/shopify/analytics.ts"),
    read("apps/web/lib/business/ShopifyAnalyticsRepository.ts"),
  ]);
  assert.match(migration, /unique \(shop_id, reporting_date\)/);
  assert.match(edge, /onConflict: "shop_id,reporting_date"/);
  assert.match(analytics, /pending_permission/);
  assert.match(edge, /protected_data_denied/);
  assert.match(edge, /throttled/);
  assert.match(repository, /30 \* 60_000/);
  assert.match(repository, /timeZone: "Europe\/London"/);
  assert.doesNotMatch(`${migration}${edge}`, /session_id|customer_id|customer_email|customer_name/);
});

test("dashboard switches only after cached Shopify aggregates are available", async () => {
  const [component, loader] = await Promise.all([
    read("apps/web/components/command-centre/CommandCentreCockpit.tsx"),
    read("apps/web/lib/command-centre/getCommandCentreCockpit.ts"),
  ]);
  assert.match(component, /shopifyAnalyticsAvailable \?/);
  assert.match(component, /Pending Shopify reporting access/);
  assert.match(component, /Shopify Analytics · Updated/);
  assert.match(component, /Vault live tracking/);
  assert.match(loader, /shopifyToday\.conversionRate \* 100/);
  assert.doesNotMatch(loader, /completedCheckout\s*\/\s*shopifyToday\.sessions/);
});
