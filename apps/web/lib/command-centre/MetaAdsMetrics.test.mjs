import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { unavailable } from "./CommandCentreCockpit.ts";

const repositorySource = await readFile(new URL("../business/MetaAdsRepository.ts", import.meta.url), "utf8");
const cockpitSource = await readFile(new URL("./getCommandCentreCockpit.ts", import.meta.url), "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Exercise the existing Meta mapping and value helpers without loading unrelated repositories.
const helpers = cockpitSource.slice(cockpitSource.indexOf("function available"), cockpitSource.indexOf("export async function"));
const mapping = cockpitSource.slice(cockpitSource.indexOf("    meta: {") + "    meta: ".length, cockpitSource.indexOf("    finance: {"));
const mapMeta = new Function("metaAds", "unavailable", compile(`${helpers}\nconst result = ${mapping.trim().replace(/,$/, "")};\nreturn result;`));

const now = new Date("2026-09-06T12:00:00Z");
const row = {
  reporting_date: "2026-09-06", fetched_at: now.toISOString(),
  spend: "120", purchases: "8", purchase_value: "480", roas: "4",
  impressions: "20000", ctr: "3.99", cpc: "0.15",
  link_clicks: "300", landing_page_views: "240",
};

async function snapshot(overrides = {}, availability = "live", error = null, history = [], timezone = "Europe/London", at = now) {
  const supabaseAdmin = {
    from(table) {
      const result = table === "vault_meta_ads_daily"
        ? { data: [{ ...row, ...overrides }, ...history], error }
        : { data: { availability, reporting_timezone: timezone, currency: "GBP" }, error };
      return {
        select(columns) {
          if (table === "vault_meta_ads_daily") {
            assert.ok(columns.includes("link_clicks"));
            assert.ok(columns.includes("landing_page_views"));
          }
          return this;
        },
        eq() { return this; },
        order() { return this; },
        maybeSingle: async () => result,
        limit: async (count) => { assert.ok(count >= 8); return result; },
      };
    },
  };
  const exports = {};
  new Function("require", "exports", compile(repositorySource))(
    (name) => name === "server-only" ? {} : { supabaseAdmin }, exports,
  );
  return exports.MetaAdsRepository.getSnapshot(at);
}

const history = Array.from({ length: 7 }, (_, i) => ({
  ...row,
  reporting_date: new Date(Date.UTC(2026, 8, 5 - i)).toISOString().slice(0, 10),
  spend: i === 0 ? "600" : "100", purchase_value: i === 0 ? "600" : "300", purchases: i === 0 ? "60" : "10",
}));

test("Meta card retains its headline and comparisons above nine shared detail rows with unique tooltips", async () => {
  const source = await readFile(new URL("../../components/command-centre/CommandCentreCockpit.tsx", import.meta.url), "utf8");
  const start = source.lastIndexOf("<KpiCard", source.indexOf('eyebrow="Meta Ads"'));
  const card = source.slice(start, source.indexOf("</KpiCard>", start) + "</KpiCard>".length);
  const helpers = source.slice(source.indexOf("const META_HELP"), source.indexOf("function Snapshot"));
  const compiled = ts.transpileModule(`${helpers}\nconst VaultIcon = () => null;\nexport function Render({data}) { return <>${card}<MetaMetricRows meta={data.meta} scope="snapshot" /></>; }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("require", "exports", compiled)(createRequire(import.meta.url), exports);
  const meta = mapMeta(await snapshot({}, "live", null, history), unavailable);
  const html = renderToStaticMarkup(React.createElement(exports.Render, { data: { meta } }));
  const headline = html.slice(html.indexOf('class="cc-kpi-values"'), html.indexOf('class="cc-meta-comparison"'));
  assert.match(headline, /<strong>4\.00x<\/strong>/);
  assert.match(headline, /<strong>£120<\/strong>/);
  assert.match(headline, /<strong>8<\/strong>/);
  assert.ok(headline.indexOf("ROAS today") < headline.indexOf("Spend today"));
  assert.ok(headline.indexOf("Spend today") < headline.indexOf("Purchases"));
  const detailStart = html.indexOf('class="cc-meta-details"');
  assert.ok(html.indexOf("ROAS change") < detailStart);
  assert.ok(html.indexOf("baseline 2.00x") < detailStart);
  assert.ok(html.indexOf("Cost per purchase change") < detailStart);
  assert.ok(html.indexOf("Meta-attributed revenue") < detailStart);
  const details = html.slice(detailStart, html.indexOf("</section>", detailStart));
  const labels = [...details.matchAll(/aria-describedby="meta-card-details-[^"]+">([^<]+)/g)].map(match => match[1]);
  assert.deepEqual(labels, ["Spend today", "Meta-attributed revenue", "Purchases", "Cost per purchase", "ROAS", "CTR", "CPC", "CPM", "Landing page view rate"]);
  assert.equal((details.match(/class="cc-metric-row"/g) ?? []).length, 9);
  assert.equal((details.match(/tabindex="0"/g) ?? []).length, 9);
  assert.equal((details.match(/role="tooltip"/g) ?? []).length, 9);
  for (const value of ["£120", "£480", ">8<", "£15", "4.00x", "3.99%", "£0.15", "£6", "80.00%"]) assert.ok(details.includes(value), value);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test("previous seven exact completed dates exclude today and use ratios of totals", async () => {
  const source = await snapshot({}, "live", null, history);
  assert.deepEqual(source.previous7Days, { roas: 2, costPerPurchase: 10 });
  assert.equal(source.roasChangePercent, 100);
  assert.equal(source.costPerPurchaseChangePercent, 50);
  const changedToday = await snapshot({ spend: "240", purchase_value: "2400" }, "live", null, history);
  assert.deepEqual(changedToday.previous7Days, source.previous7Days);
  const weighted = await snapshot({}, "live", null, history.map((day, i) => ({ ...day, purchases: i === 0 ? "120" : "5" })));
  assert.equal(weighted.previous7Days.costPerPurchase, 1200 / 150);
  assert.notEqual(weighted.previous7Days.costPerPurchase, (5 + 6 * 20) / 7);
});

test("zero baseline and today denominators do not invent comparisons", async () => {
  const zeroSpend = await snapshot({}, "live", null, history.map(day => ({ ...day, spend: "0" })));
  assert.equal(zeroSpend.previous7Days.roas, null);
  assert.equal(zeroSpend.roasChangePercent, null);
  assert.equal(zeroSpend.costPerPurchaseChangePercent, null);
  const zeroPurchases = await snapshot({}, "live", null, history.map(day => ({ ...day, purchases: "0" })));
  assert.equal(zeroPurchases.previous7Days.costPerPurchase, null);
  assert.equal(zeroPurchases.costPerPurchaseChangePercent, null);
  assert.equal((await snapshot({ spend: "0" }, "live", null, history)).roasChangePercent, null);
  assert.equal((await snapshot({ purchases: "0" }, "live", null, history)).costPerPurchaseChangePercent, null);
  const zeroRevenue = await snapshot({}, "live", null, history.map(day => ({ ...day, purchase_value: "0" })));
  assert.equal(zeroRevenue.roasChangePercent, null);
});

test("missing dates cannot be substituted with older history; stale and pending states survive mapping", async () => {
  const incomplete = await snapshot({}, "live", null, [...history.slice(0, 6), { ...row, reporting_date: "2026-08-29" }]);
  assert.equal(incomplete.previous7Days, null);
  assert.deepEqual(mapMeta(incomplete, unavailable).roasChangePercent, unavailable());
  const stale = mapMeta(await snapshot({}, "stale", null, history), unavailable);
  for (const key of ["roasChangePercent", "costPerPurchaseChangePercent", "previous7DaysRoas"]) {
    assert.equal(stale[key].state, "stale");
    assert.equal(stale[key].updatedAt, row.fetched_at);
    assert.deepEqual(mapMeta(await snapshot({}, "pending_configuration", null, history), unavailable)[key], unavailable());
    assert.deepEqual(mapMeta(await snapshot({}, "live", { message: "failed" }, history), unavailable)[key], unavailable());
  }
});

test("account timezone selects today and excludes it at UTC midnight and DST boundaries", async () => {
  for (const [at, timezone, todayDate] of [
    ["2026-09-06T00:30:00Z", "America/Los_Angeles", "2026-09-05"],
    ["2026-03-29T23:30:00Z", "Europe/London", "2026-03-30"],
  ]) {
    const preceding = history.map((day, i) => ({ ...day, reporting_date: new Date(Date.parse(`${todayDate}T00:00:00Z`) - (i + 1) * 86400000).toISOString().slice(0, 10) }));
    const source = await snapshot({ reporting_date: todayDate, fetched_at: at }, "live", null, preceding, timezone, new Date(at));
    assert.equal(source.today.roas, 4);
    assert.equal(source.previous7Days.roas, 2);
  }
});

test("Meta comparison directions and focusable tooltip markup are accessible", async () => {
  const source = await readFile(new URL("../../components/command-centre/CommandCentreCockpit.tsx", import.meta.url), "utf8");
  const local = source.slice(source.indexOf("const META_HELP"), source.indexOf("function KpiCard")) + "\nexport { MetaLabel };";
  const exports = {};
  new Function("require", "exports", ts.transpileModule(local, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText)(createRequire(import.meta.url), exports);
  for (const [amount, lowerIsBetter, word] of [[10, false, "Improved"], [-10, false, "Worsened"], [-10, true, "Improved"], [10, true, "Worsened"], [0, true, "Unchanged"]]) {
    const html = renderToStaticMarkup(React.createElement(exports.MetaComparison, { label: "Change", lowerIsBetter, value: { state: "stale", value: amount, updatedAt: row.fetched_at } }));
    assert.ok(html.includes(word));
    assert.ok(html.includes("Stale"));
    assert.ok(html.includes('tabindex="0"'));
    assert.ok(html.includes('role="tooltip"'));
    assert.ok(html.includes('aria-describedby="meta-top-'));
  }
  for (const metric of ["ROAS", "CTR", "CPC", "CPM", "Cost per purchase", "Landing page view rate", "Meta-attributed revenue", "Spend", "Purchases"]) {
    assert.ok(source.includes(`metaHelp="${metric}"`));
    const html = renderToStaticMarkup(React.createElement(exports.MetaLabel, { label: metric, scope: "snapshot" }));
    assert.ok(html.includes(metric));
    assert.ok(html.includes('tabindex="0"'));
    assert.ok(html.includes('role="tooltip"'));
    const describedBy = html.match(/aria-describedby="([^"]+)"/)[1];
    assert.ok(html.includes(`id="${describedBy}"`));
  }
  assert.ok(source.includes(".cc-hint:hover>.cc-hint-content,.cc-hint:focus>.cc-hint-content"));
});

test("Meta derives efficiency from today's stored data and preserves percentage CTR", async () => {
  const source = await snapshot();
  assert.equal(source.today.linkClicks, 300);
  assert.equal(source.today.landingPageViews, 240);
  const meta = mapMeta(source, unavailable);
  for (const [key, amount] of [["costPerPurchase", 15], ["cpm", 6], ["costPerClick", 0.15]]) {
    assert.deepEqual(meta[key], { state: "available", value: { amount, currency: "GBP" }, updatedAt: row.fetched_at });
  }
  assert.equal(meta.landingPageViewRate.value, 80);
  assert.equal(meta.clickThroughRate.value, 3.99);
});

for (const [denominator, metric] of [["purchases", "costPerPurchase"], ["impressions", "cpm"], ["link_clicks", "landingPageViewRate"]]) {
  test(`zero ${denominator} makes ${metric} unavailable`, async () => {
    const source = await snapshot({ [denominator]: "0" });
    assert.equal(source.today[metric], null);
    assert.deepEqual(mapMeta(source, unavailable)[metric], unavailable());
  });
}

test("valid zero numerators remain available", async () => {
  const meta = mapMeta(await snapshot({ spend: "0", landing_page_views: "0" }), unavailable);
  assert.equal(meta.costPerPurchase.value.amount, 0);
  assert.equal(meta.cpm.value.amount, 0);
  assert.equal(meta.landingPageViewRate.value, 0);
});

test("stale sync or aged data retains stale efficiency values and timestamps", async () => {
  for (const source of [await snapshot({}, "stale"), await snapshot({ fetched_at: "2026-09-06T11:00:00Z" })]) {
    const meta = mapMeta(source, unavailable);
    assert.equal(meta.connection, "stale");
    for (const key of ["costPerPurchase", "cpm", "landingPageViewRate", "clickThroughRate"]) {
      assert.equal(meta[key].state, "stale");
      assert.equal(meta[key].updatedAt, source.fetchedAt);
    }
  }
});

test("missing today, query errors and pending configuration preserve connection and empty values", async () => {
  for (const source of [
    await snapshot({ reporting_date: "2026-09-05" }),
    await snapshot({}, "live", { message: "unavailable" }),
    await snapshot({ reporting_date: "2026-09-05" }, "pending_configuration"),
  ]) {
    const meta = mapMeta(source, unavailable);
    assert.equal(meta.connection, source.availability);
    for (const key of ["costPerPurchase", "cpm", "landingPageViewRate", "clickThroughRate"]) {
      assert.deepEqual(meta[key], unavailable());
    }
  }
});

test("Marketing Snapshot formats Meta percentage values directly to two decimals", async () => {
  const component = await readFile(new URL("../../components/command-centre/CommandCentreCockpit.tsx", import.meta.url), "utf8");
  for (const key of ["clickThroughRate", "landingPageViewRate"]) {
    assert.ok(component.includes(`value={data.meta.${key}}\n            formatter={(value) => \x60${"${Number(value).toFixed(2)}"}%\x60}`) ||
      component.replaceAll("\r\n", "\n").includes(`value={data.meta.${key}}\n            formatter={(value) => \x60${"${Number(value).toFixed(2)}"}%\x60}`));
  }
});
