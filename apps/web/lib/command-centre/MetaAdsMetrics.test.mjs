import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
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

async function snapshot(overrides = {}, availability = "live", error = null) {
  const supabaseAdmin = {
    from(table) {
      const result = table === "vault_meta_ads_daily"
        ? { data: [{ ...row, ...overrides }], error }
        : { data: { availability, reporting_timezone: "Europe/London", currency: "GBP" }, error };
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
        limit: async () => result,
      };
    },
  };
  const exports = {};
  new Function("require", "exports", compile(repositorySource))(
    (name) => name === "server-only" ? {} : { supabaseAdmin }, exports,
  );
  return exports.MetaAdsRepository.getSnapshot(now);
}

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
