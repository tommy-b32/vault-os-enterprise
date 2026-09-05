import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createCalendarRevenueValues, unavailable } from "./CommandCentreCockpit.ts";

const require = createRequire(import.meta.url);
const repositorySource = await readFile(new URL("../business/ShopifyTradingRepository.ts", import.meta.url), "utf8");
const componentSource = await readFile(new URL("../../components/command-centre/CommandCentreCockpit.tsx", import.meta.url), "utf8");

function compile(source, dependencies) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const exports = {};
  new Function("require", "exports", outputText)((name) => name in dependencies ? dependencies[name] : require(name), exports);
  return exports;
}

function repository(rows = [], fail = () => false) {
  const calls = [];
  const client = { from(table) {
    const filters = [];
    const call = { table, filters, offset: 0, end: Infinity, orders: [] };
    calls.push(call);
    const query = {
      select() { return query; },
      gte(key, value) { filters.push([key, value, (a, b) => a >= b]); return query; },
      lt(key, value) { filters.push([key, value, (a, b) => a < b]); return query; },
      is(key, value) { filters.push([key, value, (a, b) => a === b]); return query; },
      eq(key, value) { filters.push([key, value, (a, b) => a === b]); return query; },
      in() { return query; },
      order(key) { call.orders.push(key); return query; },
      range(offset, end) { Object.assign(call, { offset, end }); return query; },
      then(resolve, reject) {
        const failure = fail(call);
        if (failure) return Promise.resolve({ data: null, error: failure === "missing" ? null : { message: "Read failed" } }).then(resolve, reject);
        const data = table === "vault_shopify_order_lines" ? [] : rows.filter((row) =>
          filters.every(([key, value, compare]) => compare(row[key], value)),
        ).slice(call.offset, call.end + 1);
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  } };
  return { ...compile(repositorySource, { "server-only": {}, "@/lib/supabase-admin": { supabaseAdmin: client } }), calls };
}

const { getCalendarRevenueRanges } = repository();

test("calendar periods start Monday and at the first of the London month and year", () => {
  const now = "2026-09-06T12:34:56.789Z";
  assert.deepEqual(getCalendarRevenueRanges(new Date(now)), {
    week: { from: "2026-08-30T23:00:00.000Z", to: now },
    month: { from: "2026-08-31T23:00:00.000Z", to: now },
    year: { from: "2026-01-01T00:00:00.000Z", to: now },
  });
  assert.equal(getCalendarRevenueRanges(new Date("2026-09-06T23:00:00Z")).week.from, "2026-09-06T23:00:00.000Z");
  assert.deepEqual(getCalendarRevenueRanges(new Date("2027-01-01T00:00:00Z")), {
    week: { from: "2026-12-28T00:00:00.000Z", to: "2027-01-01T00:00:00.000Z" },
    month: { from: "2027-01-01T00:00:00.000Z", to: "2027-01-01T00:00:00.000Z" },
    year: { from: "2027-01-01T00:00:00.000Z", to: "2027-01-01T00:00:00.000Z" },
  });
});

test("London calendar boundaries use the offset at each boundary across BST and GMT transitions", () => {
  for (const [now, week, month] of [
    ["2026-03-29T02:00:00Z", "2026-03-23T00:00:00.000Z", "2026-03-01T00:00:00.000Z"],
    ["2026-03-29T23:00:00Z", "2026-03-29T23:00:00.000Z", "2026-03-01T00:00:00.000Z"],
    ["2026-03-31T23:00:00Z", "2026-03-29T23:00:00.000Z", "2026-03-31T23:00:00.000Z"],
    ["2026-10-25T02:00:00Z", "2026-10-18T23:00:00.000Z", "2026-09-30T23:00:00.000Z"],
    ["2026-10-26T00:00:00Z", "2026-10-26T00:00:00.000Z", "2026-09-30T23:00:00.000Z"],
  ]) {
    const ranges = getCalendarRevenueRanges(new Date(now));
    assert.equal(ranges.week.from, week);
    assert.equal(ranges.month.from, month);
    assert.equal(ranges.year.from, "2026-01-01T00:00:00.000Z");
  }
});

const order = (overrides = {}) => ({
  id: "order", shopify_created_at: "2026-09-07T08:00:00.000Z", currency: "GBP",
  gross_total: "100.00", net_revenue: "75.00", refunds: "25.00",
  cancelled_at: null, "metadata->>test": false, ...overrides,
});

test("calendar revenue uses today's stored refund-adjusted net amounts and cancellation/test exclusions", async () => {
  const { ShopifyTradingRepository: repo } = repository([
    order(), order({ id: "refunded", net_revenue: "0.00", refunds: "100.00" }),
    order({ id: "cancelled", cancelled_at: "2026-09-07T09:00:00Z" }),
    order({ id: "test", "metadata->>test": true }),
  ]);
  const now = new Date("2026-09-07T12:00:00Z");
  const today = await repo.getTodaySummary(now);
  const calendar = await repo.getCalendarRevenue(now);
  assert.equal(today.netRevenue, 75);
  for (const period of Object.values(calendar)) assert.equal(period.netRevenue, today.netRevenue);
});

test("calendar queries include period starts and exclude future and prior-period orders", async () => {
  const { ShopifyTradingRepository: repo } = repository([
    order({ shopify_created_at: "2026-08-30T22:59:59.999Z", net_revenue: 1000 }),
    order({ shopify_created_at: "2026-08-30T23:00:00.000Z", net_revenue: 10 }),
    order({ shopify_created_at: "2026-08-31T23:00:00.000Z", net_revenue: 20 }),
    order({ shopify_created_at: "2026-09-06T12:00:00.000Z", net_revenue: 9999 }),
  ]);
  const result = await repo.getCalendarRevenue(new Date("2026-09-06T12:00:00Z"));
  assert.equal(result.week.netRevenue, 30);
  assert.equal(result.month.netRevenue, 20);
  assert.equal(result.year.netRevenue, 1030);
});

test("calendar revenue paginates beyond API row limits with deterministic ordering", async () => {
  const { ShopifyTradingRepository: repo, calls } = repository(
    Array.from({ length: 1201 }, (_, index) => order({ id: String(index), net_revenue: 1 })),
  );
  const result = await repo.getCalendarRevenue(new Date("2026-09-07T12:00:00Z"));
  for (const period of Object.values(result)) assert.equal(period.netRevenue, 1201);
  assert.equal(calls.length, 9);
  assert.ok(calls.every((call) => call.orders.join() === "shopify_created_at,id"));
});

test("failed pages, invalid amounts and mixed currencies stay unavailable without hiding other periods", async () => {
  const now = new Date("2026-09-07T12:00:00Z");
  const failed = repository([order()], (call) => call.filters.some(([key, value]) => key === "shopify_created_at" && value === "2026-01-01T00:00:00.000Z"));
  const result = await failed.ShopifyTradingRepository.getCalendarRevenue(now);
  assert.equal(result.year, null);
  assert.equal(result.week.netRevenue, 75);
  const failedPage = repository(Array.from({ length: 501 }, () => order()), (call) => call.offset === 500);
  assert.deepEqual(await failedPage.ShopifyTradingRepository.getCalendarRevenue(now), { week: null, month: null, year: null });
  const missing = repository([], () => "missing");
  assert.deepEqual(await missing.ShopifyTradingRepository.getCalendarRevenue(now), { week: null, month: null, year: null });
  for (const rows of [[order({ net_revenue: null })], [order({ net_revenue: "bad" })], [order(), order({ currency: "USD" })]]) {
    const invalid = await repository(rows).ShopifyTradingRepository.getCalendarRevenue(now);
    assert.deepEqual(invalid, { week: null, month: null, year: null });
  }
});

test("empty successful periods are genuine zero; absent data/freshness/currency remain unavailable and stale is retained", async () => {
  const now = new Date("2026-09-07T12:00:00Z");
  const summary = await repository().ShopifyTradingRepository.getCalendarRevenue(now);
  const at = now.toISOString();
  const zero = createCalendarRevenueValues(summary, at, false, "GBP");
  assert.deepEqual(zero.week, { state: "available", value: { amount: 0, currency: "GBP" }, updatedAt: at });
  assert.equal(createCalendarRevenueValues(summary, at, true, "GBP").year.state, "stale");
  for (const values of [
    createCalendarRevenueValues(null, at, false, "GBP"),
    createCalendarRevenueValues(summary, null, false, "GBP"),
    createCalendarRevenueValues(summary, at, false, null),
  ]) assert.deepEqual(values, { week: unavailable(), month: unavailable(), year: unavailable() });
  const withYearCurrency = { ...summary, year: { ...summary.year, netRevenue: 100, currency: "GBP" } };
  assert.equal(createCalendarRevenueValues(withYearCurrency, at, false, null).week.value.amount, 0);
});

test("loader reads calendar revenue at the business snapshot time and preserves canonical freshness", async () => {
  const loader = await readFile(new URL("./getCommandCentreCockpit.ts", import.meta.url), "utf8");
  assert.match(loader, /business\.trading\.data\s*\? ShopifyTradingRepository\.getCalendarRevenue\(new Date\(business\.generatedAt\)\)\.catch\(\(\) => null\)/);
  assert.match(loader, /calendarRevenue: createCalendarRevenueValues\(calendarRevenue, tradingAt, tradingStale, tradingCurrency\)/);
});

test("all three totals render only in Revenue below its chart, with zero, stale and unavailable labels", () => {
  const { CommandCentreCockpit } = compile(componentSource, {
    "next/link": ({ children, ...props }) => React.createElement("a", props, children),
    "@/components/brain/workspace/VaultIcon": () => null,
    "@/components/command-centre/CommandCentreLiveRefresh": { CommandCentreLiveRefresh: () => null },
    "@/lib/command-centre/AttentionPriorityPresentation": {},
  });
  const emptyMetrics = (values = {}) => new Proxy(values, { get: (target, key) => target[key] ?? unavailable() });
  const at = "2026-09-07T12:00:00Z";
  const value = (amount, state = "available") => ({ state, value: { amount, currency: "GBP" }, updatedAt: at });
  const data = {
    generatedAt: at, systemStatus: "live", latestSourceAt: at, businessPulse: { state: "healthy", label: "Healthy" },
    trading: emptyMetrics({
      revenue: value(75), calendarRevenue: { week: value(0), month: value(100, "stale"), year: unavailable() },
      revenueComparison: { state: "available", value: 25 },
      revenueTrend: [{ label: "2026-09-01", value: 50 }, { label: "2026-09-07", value: 75 }], orderTrend: [],
    }),
    website: emptyMetrics({ shopifyAnalytics: emptyMetrics({ availability: "unavailable" }), visitorTrend: [] }),
    finance: emptyMetrics(), inventory: emptyMetrics(), operations: emptyMetrics(),
    executiveBriefing: { headline: "Briefing", summary: "Summary", positives: [], blockers: [], supportingEvidence: [], unlocks: [], todayFocus: unavailable() },
    attention: [], domains: [], feed: [],
  };
  const html = renderToStaticMarkup(React.createElement(CommandCentreCockpit, { data }));
  const revenue = html.match(/<article[^>]*>[\s\S]*?<\/article>/)[0];
  for (const label of ["This week", "This month", "This year"]) {
    assert.equal(html.split(label).length - 1, 1);
    assert.ok(revenue.includes(label));
  }
  assert.match(revenue, /This week<\/span><strong class="is-available">£0<\/strong>/);
  assert.match(revenue, /This month<\/span><strong class="is-stale">£100<small>Stale<\/small>/);
  assert.match(revenue, /This year<\/span><strong class="is-unavailable">Unavailable<\/strong>/);
  assert.match(revenue, /Europe\/London · Partial \/ in progress/);
  assert.match(revenue, /£75/);
  assert.match(revenue, /\+25%/);
  assert.match(revenue, /Seven-day live trend from 2026-09-01 to 2026-09-07/);
  assert.ok(revenue.indexOf("</svg>") < revenue.indexOf("This week"));
});
