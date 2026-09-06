import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { createProfitTodayValue, createProductCostValue, createPaymentFeeValue, unavailable } from "./CommandCentreCockpit.ts";

const at = "2026-09-07T12:00:00Z";
const money = (amount, state = "available", currency = "GBP") => ({ state, value: { amount, currency }, updatedAt: at });
const inputs = () => ({ revenue: money(200), productCost: money(60), shipping: money(10), metaSpend: money(20), paymentFees: money(5) });

test("only complete matching sold-unit coverage exposes COGS; shipping and fees still block profit", () => {
  const coverage = { totalCogs: 40, totalUnits: 5, costedUnits: 5, missingCostLines: 0, orderCount: 2, sourceAt: at };
  const trading = { itemsSold: 5, orderCount: 2 };
  const source = { status: "live", updatedAt: at, generatedAt: at };
  const cost = createProductCostValue(coverage, trading, source);
  assert.deepEqual(cost, money(40));
  for (const bad of [null, { ...coverage, missingCostLines: 1 }, { ...coverage, costedUnits: 4 }, { ...coverage, totalCogs: null }, { ...coverage, orderCount: 3 }]) {
    assert.deepEqual(createProductCostValue(bad, trading, source), unavailable());
  }
  assert.equal(createProductCostValue(coverage, trading, { ...source, status: "stale" }).state, "stale");
  assert.equal(createProductCostValue(coverage, trading, { ...source, status: "unavailable" }).state, "unavailable");
  const result = createProfitTodayValue({ ...inputs(), productCost: cost, shipping: unavailable(), paymentFees: unavailable() });
  assert.deepEqual(result.estimatedProfit, unavailable());
  assert.deepEqual(result.missingInputs, ["shipping", "payment fees"]);
});

test("trusted complete costs subtract each expense once and margin divides by net revenue", () => {
  // 200 is already canonical adjusted revenue: refunds and discounts are not subtracted again.
  const result = createProfitTodayValue(inputs());
  assert.deepEqual(result.estimatedProfit, money(105));
  assert.equal(result.margin.value, 52.5);
  assert.deepEqual(result.missingInputs, []);
});

for (const key of ["productCost", "shipping", "paymentFees", "revenue", "metaSpend"]) {
  test(`missing ${key} keeps profit and margin unavailable, preserving available support`, () => {
    const source = { ...inputs(), [key]: unavailable() };
    const result = createProfitTodayValue(source);
    assert.deepEqual(result.estimatedProfit, unavailable());
    assert.deepEqual(result.margin, unavailable());
    assert.equal(result.missingInputs.length, 1);
    for (const field of Object.keys(source)) assert.deepEqual(result[field], source[field]);
  });
}

test("zero advertising spend is valid; zero revenue yields a loss with no division by zero", () => {
  assert.equal(createProfitTodayValue({ ...inputs(), metaSpend: money(0) }).estimatedProfit.value.amount, 125);
  const result = createProfitTodayValue({ ...inputs(), revenue: money(0) });
  assert.equal(result.estimatedProfit.value.amount, -95);
  assert.deepEqual(result.margin, unavailable());
  const zero = createProfitTodayValue(Object.fromEntries(Object.keys(inputs()).map(key => [key, money(0)])));
  assert.equal(zero.estimatedProfit.value.amount, 0);
  assert.deepEqual(zero.margin, unavailable());
});

test("stale, invalid, mismatched-currency and pending sources cannot produce a live profit", () => {
  const source = inputs();
  source.shipping = { ...money(10, "stale"), updatedAt: "2026-09-07T11:00:00Z" };
  const result = createProfitTodayValue(source);
  assert.equal(result.estimatedProfit.state, "stale");
  assert.equal(result.margin.state, "stale");
  assert.equal(result.estimatedProfit.updatedAt, source.shipping.updatedAt);
  for (const shipping of [money(NaN), money(-1), money(10, "available", "USD"), { state: "pending", value: null, updatedAt: null }, { ...money(10), updatedAt: null }]) {
    assert.equal(createProfitTodayValue({ ...inputs(), shipping }).estimatedProfit.state, "unavailable");
  }
});

test("live loader reuses canonical revenue, Meta and complete payment-fee coverage", async () => {
  const loader = await readFile(new URL("./getCommandCentreCockpit.ts", import.meta.url), "utf8");
  const section = loader.slice(loader.indexOf("profit: (() =>"), loader.indexOf("systemStatus:", loader.indexOf("profit: (() =>")));
  assert.ok(section.includes("const paymentFees = createPaymentFeeValue(todayPaymentFees, trading"));
  assert.ok(section.includes("paymentFees,"));
  assert.ok(section.includes("const shipping = createShippingCostValue(todayShipping, trading"));
  assert.ok(section.includes("productCost: createProductCostValue(todayCogs, trading"));
  assert.ok(section.includes("tradingMoney(trading.netRevenue)"));
  assert.ok(section.includes("money(metaAds.today.spend, metaAds.currency)"));
  assert.ok(section.includes('metaAds.reportingTimezone === "Europe/London"'));
});

test("Profit card follows Finance without changing headline layout and renders incomplete help", async () => {
  const source = await readFile(new URL("../../components/command-centre/CommandCentreCockpit.tsx", import.meta.url), "utf8");
  const helpers = source.slice(source.indexOf("const META_HELP"), source.indexOf("function Snapshot"));
  const exports = {};
  new Function("require", "exports", ts.transpileModule(`${helpers}\nconst VaultIcon = () => null;`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText)(createRequire(import.meta.url), exports);
  const data = { profit: createProfitTodayValue({ ...inputs(), productCost: unavailable(), shipping: unavailable(), paymentFees: unavailable() }), trading: { orders: { state: "available", value: 2 }, units: { state: "available", value: 3 } } };
  const html = renderToStaticMarkup(React.createElement(exports.ProfitTodayCard, { data }));
  assert.ok(html.includes("Profit Today"));
  assert.ok(html.includes("Unavailable"));
  assert.ok(html.includes("Missing: product cost, shipping, payment fees"));
  assert.ok(html.includes("£200"));
  assert.ok(html.includes("-£20"));
  assert.ok(html.includes("2 orders"));
  assert.equal((html.match(/role="tooltip"/g) ?? []).length, 3);
  assert.equal((html.match(/tabindex="0"/g) ?? []).length, 3);
  assert.ok(html.includes('aria-describedby="profit-estimate"'));
  assert.ok(html.includes("not accounting profit"));
  const financeStart = source.indexOf('<KpiCard eyebrow="Finance Position"');
  assert.ok(source.slice(source.indexOf("</KpiCard>", financeStart)).startsWith('</KpiCard>\n        <ProfitTodayCard data={data} />') || source.replaceAll("\r\n", "\n").slice(source.replaceAll("\r\n", "\n").indexOf("</KpiCard>", source.replaceAll("\r\n", "\n").indexOf('<KpiCard eyebrow="Finance Position"'))).startsWith('</KpiCard>\n        <ProfitTodayCard data={data} />'));
  assert.ok(source.includes('.cc-kpi-grid>.cc-kpi-card:nth-child(6){contain:size;align-self:stretch;overflow:visible}'));
});

test("Profit card identifies Shopify reporting lag without weakening its missing-cost state", async () => {
  const source = await readFile(new URL("../../components/command-centre/CommandCentreCockpit.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("Awaiting Shopify cost data"));
  assert.ok(source.includes('profit.shippingSourceState === "awaiting_shopify_cost"'));
});
