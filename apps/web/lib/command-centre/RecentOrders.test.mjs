import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { unavailable } from "./CommandCentreCockpit.ts";

const require = createRequire(import.meta.url);
const repositorySource = await readFile(new URL("../business/ShopifyTradingRepository.ts", import.meta.url), "utf8");
const componentSource = await readFile(new URL("../../components/command-centre/CommandCentreCockpit.tsx", import.meta.url), "utf8");

function compile(source, dependencies) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  });
  const exports = {};
  new Function("require", "exports", outputText)(
    (name) => name in dependencies ? dependencies[name] : require(name),
    exports,
  );
  return exports;
}


function repository(orders = [], lines = [], failTable = null) {
  const calls = [];
  const client = { from(table) {
    const call = { table, filters: [], sorting: [], offset: 0, end: Infinity, limit: Infinity };
    calls.push(call);
    const query = {
      select(fields) { call.fields = fields; return query; },
      eq(key, value) { call.filters.push(row => row[key] === value); return query; },
      is(key, value) { call.filters.push(row => row[key] === value); return query; },
      in(key, values) { call.filters.push(row => values.includes(row[key])); return query; },
      order(key, options = {}) { call.sorting.push([key, options.ascending !== false]); return query; },
      limit(value) { call.limit = value; return query; },
      range(offset, end) { Object.assign(call, { offset, end }); return query; },
      then(resolve, reject) {
        if (table === failTable) return Promise.resolve({ data: null, error: { message: "failed" } }).then(resolve, reject);
        const data = (table === "vault_shopify_orders" ? orders : lines).filter(row => call.filters.every(f => f(row))).sort((a,b) => {
          for (const [key, ascending] of call.sorting) {
            if (a[key] !== b[key]) return (a[key] < b[key] ? -1 : 1) * (ascending ? 1 : -1);
          }
          return 0;
        }).slice(call.offset, Math.min(call.end + 1, call.limit));
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  } };
  return { ...compile(repositorySource, { "server-only": {}, "@/lib/supabase-admin": { supabaseAdmin: client } }), calls };
}
const order = (id, overrides = {}) => ({ id, source: "shopify", order_name: "#" + id, order_number: id,
  net_revenue: "70", refunds: "30", currency: "GBP", shopify_created_at: "2026-09-05T03:00:00Z",
  fulfilment_status: null, cancelled_at: null, "metadata->>test": false, ...overrides });

test("latest seven eligible orders use Shopify creation time, canonical net revenue and summed units", async () => {
  const { ShopifyTradingRepository: repo, calls } = repository([
    order("1250"), order("1249"), order("1248"), order("1247"), order("1246"), order("1245"), order("1244"), order("1243"),
    order("9999", { "metadata->>test": true }), order("9998", { cancelled_at: "2026-09-05" }),
    order("9997", { source: "other" }), order("9996", { shopify_created_at: "2026-01-01T00:00:00Z", created_at: "2026-09-06" }),
  ], [{ id: "a", order_id: "1250", quantity: 2 }, { id: "b", order_id: "1250", quantity: 1 }]);
  const result = await repo.getRecentOrderSummaries();
  assert.deepEqual(result.map(row => row.id), ["1250", "1249", "1248", "1247", "1246", "1245", "1244"]);
  assert.equal(calls[0].limit, 7);
  assert.equal(result[0].quantity, 3);
  assert.equal(result[0].netRevenue, 70);
  assert.equal(result[0].currency, "GBP");
  assert.equal(result[0].createdAt, "2026-09-05T03:00:00Z");
  assert.equal(result[1].quantity, null);
  assert.deepEqual(calls[0].sorting, [["shopify_created_at", false], ["id", false]]);
  assert.doesNotMatch(calls[0].fields, /customer|refunds|gross_total/);
});

test("line pagination, empty results, name fallback and invalid data are handled", async () => {
  const { ShopifyTradingRepository: repo } = repository([order("1250", { order_name: null, net_revenue: 0 })],
    Array.from({ length: 501 }, (_, i) => ({ id: String(i), order_id: "1250", quantity: 2 })));
  const [result] = await repo.getRecentOrderSummaries();
  assert.equal(result.quantity, 1002);
  assert.equal(result.displayName, "#1250");
  assert.equal(result.netRevenue, 0);
  assert.deepEqual(await repository().ShopifyTradingRepository.getRecentOrderSummaries(), []);
  for (const table of ["vault_shopify_orders", "vault_shopify_order_lines"]) {
    await assert.rejects(repository([order("1")], [], table).ShopifyTradingRepository.getRecentOrderSummaries(), /unavailable/);
  }
  for (const net_revenue of [null, "", "bad"]) {
    await assert.rejects(repository([order("1", { net_revenue })]).ShopifyTradingRepository.getRecentOrderSummaries());
  }
});

test("recent orders render inside Orders Today with links, units, money, time and graceful states", () => {
  const { CommandCentreCockpit } = compile(componentSource, {
    "next/link": ({ children, ...props }) =>
      React.createElement("a", props, children),
    "@/components/brain/workspace/VaultIcon": () => null,
    "@/components/command-centre/CommandCentreLiveRefresh": {
      CommandCentreLiveRefresh: () => null,
    },
    "@/lib/command-centre/AttentionPriorityPresentation": {},
  });

  const emptyMetrics = (values = {}) =>
    new Proxy(values, {
      get: (target, key) => target[key] ?? unavailable(),
    });

  const at = "2026-09-07T12:00:00Z";

  const value = (amount, state = "available") => ({
    state,
    value: {
      amount,
      currency: "GBP",
    },
    updatedAt: at,
  });

  const data = {
    generatedAt: at,
    systemStatus: "live",
    latestSourceAt: at,
    businessPulse: {
      state: "healthy",
      label: "Healthy",
    },
    trading: emptyMetrics({
      revenue: value(75),
      calendarRevenue: {
        week: value(0),
        month: value(100, "stale"),
        threeMonths: value(0),
        sixMonths: value(200, "stale"),
        year: unavailable(),
      },
      revenueComparison: {
        state: "available",
        value: 25,
      },
      revenueTrend: [
        {
          label: "2026-09-01",
          value: 50,
        },
        {
          label: "2026-09-07",
          value: 75,
        },
      ],
      orderTrend: [],
    }),
    website: emptyMetrics({
      shopifyAnalytics: emptyMetrics({
        availability: "unavailable",
      }),
      visitorTrend: [],
    }),
    meta: emptyMetrics({ connection: "unavailable" }),
    profit: emptyMetrics({ missingInputs: ["product cost", "shipping", "payment fees"] }),
    finance: emptyMetrics(),
    inventory: emptyMetrics(),
    operations: emptyMetrics(),
    executiveBriefing: {
      headline: "Briefing",
      summary: "Summary",
      positives: [],
      blockers: [],
      supportingEvidence: [],
      unlocks: [],
      todayFocus: unavailable(),
    },
    attention: [],
    domains: [],
    feed: [],
  };


  data.generatedAt = "2026-09-05T12:00:00Z";
  data.trading.orders = { state: "available", value: 8 };
  data.trading.units = { state: "available", value: 12 };
  data.trading.averageOrderValue = value(40);
  data.trading.orderComparison = { state: "available", value: 25 };
  data.trading.orderTrend = [{ label: "2026-09-04", value: 4 }, { label: "2026-09-05", value: 8 }];
  const recent = ["1250", "1249", "1248", "1247", "1246", "1245", "1244", "1243"].map((id, index) => ({ id, displayName: "#" + id,
    destination: "/orders/" + id, quantity: index === 1 ? 1 : 2, netRevenue: 70, currency: "GBP",
    createdAt: index === 0 ? "2026-09-05T03:00:00Z" : "2026-09-04T00:00:00Z" }));
  const render = () => renderToStaticMarkup(React.createElement(CommandCentreCockpit, { data }));
  for (const [status, tone, label] of [
    ["FULFILLED", "completed", "Completed"],
    ["UNFULFILLED", "awaiting", "Awaiting fulfilment"],
    ["PARTIALLY_FULFILLED", "awaiting", "Awaiting fulfilment"],
    ["ON_HOLD", "awaiting", "Awaiting fulfilment"],
    ["SCHEDULED", "awaiting", "Awaiting fulfilment"],
    [null, "unknown", "Fulfilment status unknown"],
    ["UNEXPECTED", "unknown", "Fulfilment status unknown"],
    ["", "unknown", "Fulfilment status unknown"],
  ]) {
    data.trading.recentOrders = { state: "available", value: [{ ...recent[0], fulfilmentStatus: status }], updatedAt: at };
    const html = render();
    assert.ok(html.includes(`class="cc-fulfilment-dot is-${tone}" role="img" aria-label="${label}" title="${label}"`));
    assert.ok(html.includes('href="/orders/1250"'));
    assert.ok(html.includes("#1250"));
  }
  assert.match(componentSource, /\.cc-fulfilment-dot\.is-completed\{background:#48da7d\}/);
  assert.match(componentSource, /\.cc-fulfilment-dot\.is-awaiting\{background:#54c8f3\}/);
  assert.match(componentSource, /\.cc-fulfilment-dot\{[^}]*background:#69716e/);
  for (const [state, rows, message] of [["available", recent, null], ["available", recent.slice(0, 2), null], ["stale", recent, "Stale"], ["available", [], "No recent orders"], ["unavailable", null, "Recent orders unavailable"]]) {
    data.trading.recentOrders = { state, value: rows, updatedAt: at };
    const html = render();
    const card = html.match(/<article[^>]*>[\s\S]*?<\/article>/g).find(article => article.includes("Orders Today"));
    assert.ok(card.includes("Units 12"));
    assert.ok(card.includes("AOV \u00a340"));
    assert.ok(card.includes("+25%"));
    assert.ok(card.indexOf("</svg>") < card.indexOf("Recent Orders"));
    if (message) assert.ok(card.includes(message));
    if (rows?.length) {
      assert.equal((card.match(/<li>/g) ?? []).length, Math.min(rows.length, 7));
      for (const row of rows.slice(0, 7)) {
        assert.ok(card.includes(`href="${row.destination}"`));
        assert.ok(card.includes(`dateTime="${row.createdAt}"`) || card.includes(`datetime="${row.createdAt}"`));
      }
      assert.ok(card.includes("2 items")); assert.ok(card.includes("1 item"));
      assert.ok(card.includes("\u00a370")); assert.ok(card.includes("9h ago")); assert.ok(card.includes("4 Sept"));
      assert.ok(!html.includes("#1243"));
    }
  }
});

test("loader isolates recent-order failures and links use the existing canonical detail route", async () => {
  const loader = await readFile(new URL("./getCommandCentreCockpit.ts", import.meta.url), "utf8");
  assert.match(loader, /getRecentOrderSummaries\(\)\.catch\(\(\) => null\)/);
  assert.ok(loader.includes('destination: `/orders/${encodeURIComponent(order.id)}`'));
  const route = await readFile(new URL("../../app/orders/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(route, /OrdersRepository.getById\(id\)/);
});


test("recent summaries select and preserve canonical fulfilment status unchanged", async () => {
  for (const status of ["FULFILLED", "UNFULFILLED", "PARTIALLY_FULFILLED", "ON_HOLD", "SCHEDULED", null, "UNEXPECTED"]) {
    const { ShopifyTradingRepository: repo, calls } = repository([order("1250", { fulfilment_status: status })]);
    const [result] = await repo.getRecentOrderSummaries();
    assert.equal(result.fulfilmentStatus, status);
    assert.match(calls[0].fields, /\bfulfilment_status\b/);
  }
});
