import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTodayPayoutValue, unavailable } from "./CommandCentreCockpit.ts";

const require = createRequire(import.meta.url);
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



const ledgerSource = await readFile(new URL("../business/CashLedgerRepository.ts", import.meta.url), "utf8");
const rules = await import("../business/CashLedgerRules.ts");
const paymentsSource = await readFile(new URL("../../../../supabase/functions/_shared/shopify/payments.ts", import.meta.url), "utf8");

function ledger(entries = [], fail = false) {
  const calls = [];
  const client = { from(table) {
    const call = { table, sorting: [], limit: Infinity }; calls.push(call);
    const q = {
      select(fields) { call.fields = fields; return q; }, eq(key, value) { call[key] = value; return q; },
      order(key, options) { call.sorting.push([key, options.ascending]); return q; }, limit(n) { call.limit = n; return q; },
      then(resolve, reject) {
        const data = table === "vault_cash_accounts" ? [{ id: "business", currency: "GBP" }] : entries.filter(e => e.account_id === call.account_id)
          .sort((a,b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).slice(0, call.limit);
        return Promise.resolve(fail ? { data: null, error: { message: "offline" } } : { data, error: null }).then(resolve,reject);
      },
    }; return q;
  } };
  return { ...compile(ledgerSource, { "server-only": {}, "@/lib/supabase-admin": { supabaseAdmin: client }, "@/lib/business/CashLedgerRules": rules }), calls };
}

test("cash ledger requests latest seven additions by created time, excludes other accounts, and preserves signed pence", async () => {
  const entries = Array.from({ length: 8 }, (_,i) => ({ id: String(i), account_id: "business", description: "Entry " + i,
    created_at: new Date(Date.UTC(2026,8,5,i)).toISOString(), transaction_date: "2026-01-01", amount_gbp: i === 7 ? "70.00" : i === 6 ? "-125.36" : "0" }));
  const { CashLedgerRepository: repo, calls } = ledger([...entries, { ...entries[7], id: "other", account_id: "other" }]);
  const result = await repo.getRecentEntries();
  assert.deepEqual(result.transactions.map(e=>e.id), ["7","6","5","4","3","2","1"]);
  assert.equal(result.currency, "GBP");
  assert.equal(result.transactions[0].amountPence, 7000);
  assert.equal(result.transactions[1].amountPence, -12536);
  assert.equal(result.transactions[2].amountPence, 0);
  assert.equal(calls[1].limit, 7);
  assert.deepEqual(calls[1].sorting, [["created_at", false], ["id", false]]);
  assert.deepEqual((await ledger().CashLedgerRepository.getRecentEntries()).transactions, []);
  assert.equal((await ledger(entries.slice(0,2)).CashLedgerRepository.getRecentEntries()).transactions.length, 2);
  await assert.rejects(ledger([], true).CashLedgerRepository.getRecentEntries());
});

const now = "2026-09-05T12:00:00Z";
const sourceStatus = { status: "live", lastUpdatedAt: now };
const payout = (status, issuedAt = "2026-09-04T23:00:00Z") => ({ amount: 612.4, currency: "GBP", issuedAt, status });
test("canonical payout states distinguish scheduled, paid, transit and unsuccessful payouts", () => {
  for (const [status,label,amount] of [["SCHEDULED","Expected today",612.4],["PAID","Payout paid today",612.4],["IN_TRANSIT","Payout pending",612.4],
    ["FAILED","Payout failed",null],["CANCELED","Payout canceled",null],["ACTION_REQUIRED","Payout needs attention",null]]) {
    const result = createTodayPayoutValue(payout(status),sourceStatus,now);
    assert.equal(result.value.label,label);
    assert.equal(result.value.money?.amount ?? null,amount);
  }
  assert.equal(createTodayPayoutValue(payout("PENDING"),sourceStatus,now).state,"unavailable");
  assert.equal(createTodayPayoutValue(null,sourceStatus,now).value.label,"No payout today");
});
test("London date boundaries, stale snapshots, and permission failures cannot invent today's payout", () => {
  for (const issuedAt of ["2026-09-04T22:59:59Z","2026-09-05T23:00:00Z"]) {
    assert.equal(createTodayPayoutValue(payout("PAID",issuedAt),sourceStatus,now).value.label,"No payout today");
  }
  assert.equal(createTodayPayoutValue(payout("PAID"), { ...sourceStatus, status:"error" }, now).state,"unavailable");
  assert.equal(createTodayPayoutValue(null,undefined,now).state,"unavailable");
  assert.equal(createTodayPayoutValue(payout("PAID"), { ...sourceStatus, lastUpdatedAt:"2026-09-04T12:00:00Z" },now).state,"unavailable");
  assert.equal(createTodayPayoutValue(payout("PAID"), { ...sourceStatus, lastUpdatedAt:"2026-09-05T11:00:00Z" },now).state,"stale");
  assert.equal(createTodayPayoutValue(payout("SCHEDULED","2026-03-28T23:30:00Z"), { status:"live",lastUpdatedAt:"2026-03-29T02:00:00Z" },"2026-03-29T02:00:00Z").value.label,"No payout today");
});
test("existing Payments API reader uses net DEPOSIT data and fails closed on incomplete coverage or API failure", async () => {
  const nodes = [
    { id:"withdrawal", transactionType:"WITHDRAWAL", status:"PAID", issuedAt:now, net:{amount:"999",currencyCode:"GBP"} },
    { id:"deposit", transactionType:"DEPOSIT", status:"SCHEDULED", issuedAt:"2026-09-05T09:00:00Z", net:{amount:"612.40",currencyCode:"GBP"} },
  ];
  let hasNextPage = false;
  const api = compile(paymentsSource, { "./graphql.ts": { shopifyGraphQL: async (query, variables, deadline) => {
    assert.match(query,/payouts\(first: 20/); assert.ok(deadline > Date.now());
    return { shopifyPaymentsAccount: { activated:true,defaultCurrency:"GBP",balance:[],payouts:{nodes,pageInfo:{hasNextPage}} } };
  } } });
  assert.equal((await api.fetchShopifyPaymentsSnapshot(new Date(now))).todayPayout.amount,612.4);
  hasNextPage = true;
  await assert.rejects(api.fetchShopifyPaymentsSnapshot(new Date(now)),/coverage/);
  hasNextPage = false;
  nodes.splice(1);
  assert.equal((await api.fetchShopifyPaymentsSnapshot(new Date(now))).todayPayout, null);
  nodes.length = 0;
  assert.equal((await api.fetchShopifyPaymentsSnapshot(new Date(now))).todayPayout, null);
  const failure = compile(paymentsSource, { "./graphql.ts": { shopifyGraphQL: async () => { throw new Error("ACCESS_DENIED"); } } });
  await assert.rejects(failure.fetchShopifyPaymentsSnapshot(),/ACCESS_DENIED/);
});

test("Finance card keeps metrics and renders seven signed ledger rows with graceful states", () => {
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



  data.finance = {
    ledgerCash:value(3343.65), purchasingPower:value(100), protectedReserve:value(200), committedPurchaseOrders:value(300),
    todayPayout:createTodayPayoutValue(payout("SCHEDULED"),sourceStatus,now),
  };
  const rows = Array.from({length:8},(_,i)=>({id:String(i),description:"Ledger entry " + i,amountPence:i===0?7000:i===1?-12536:0,createdAt:i===0?"2026-09-07T10:00:00Z":"2026-09-04T00:00:00Z"}));
  for (const [state,transactions,message] of [["available",rows,null],["available",rows.slice(0,2),null],["stale",rows,"Stale"],["available",[],"No recent ledger entries"],["unavailable",null,"Cash ledger unavailable"]]) {
    data.finance.recentLedger = { state,value:transactions?{currency:"GBP",transactions}:null,updatedAt:at };
    const html=renderToStaticMarkup(React.createElement(CommandCentreCockpit,{data}));
    const card=html.match(/<article[^>]*>[\s\S]*?<\/article>/g).find(c=>c.includes("Finance Position"));
    assert.ok(card.includes("Recent Cash Ledger"));
    assert.ok(card.includes("Purchasing power")); assert.ok(card.includes("Reserve"));assert.ok(card.includes("Committed"));
    for(const amount of ["100","200","300"]) assert.ok(card.includes("\u00a3"+amount));
    assert.ok(card.includes("Expected today"));assert.ok(card.includes("\u00a3612.40"));
    if(message) assert.ok(card.includes(message));
    assert.equal((card.match(/<li>/g)??[]).length,Math.min(transactions?.length??0,7));
    assert.ok(!card.includes("Ledger entry 7"));
    if(transactions?.length) {
      assert.ok(card.includes('class="is-positive">+\u00a370.00'));
      assert.ok(card.includes('class="is-negative">-\u00a3125.36'));
      assert.ok(card.includes("2h ago")); assert.ok(card.includes("4 Sept"));
      if(transactions.length>2) assert.ok(card.includes('class="is-neutral">\u00a30.00'));
    }
  }
  assert.match(componentSource,/\.cc-recent-ledger \.is-positive\{color:#48da7d/);
  assert.match(componentSource,/\.cc-recent-ledger \.is-negative\{color:#ff6969/);
});

test("cockpit reuses cash ledger repository and already-loaded Payments state without another external request", async () => {
  const loader=await readFile(new URL("./getCommandCentreCockpit.ts",import.meta.url),"utf8");
  assert.match(loader,/CashLedgerRepository.getRecentEntries\(\).catch\(\(\) => null\)/);
  assert.match(loader,/createTodayPayoutValue\(finance\?\.todayPayout/);
  assert.match(loader,/refreshExternalSources: false/);
});
