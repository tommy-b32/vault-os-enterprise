import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const moduleUrl = new URL("../../../supabase/functions/_shared/meta/insights.ts", import.meta.url);
const source = await readFile(moduleUrl, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const accessToken = "meta-access-token-that-must-not-leak";

function loadInsights(fetchImpl) {
  const previousDeno = globalThis.Deno;
  const previousFetch = globalThis.fetch;
  globalThis.Deno = {
    env: {
      get(name) {
        return {
          META_ACCESS_TOKEN: accessToken,
          META_AD_ACCOUNT_ID: "act_123",
        }[name];
      },
    },
  };
  globalThis.fetch = fetchImpl;

  const exports = {};
  new Function("exports", "require", compiled)(exports, () => ({}));

  return {
    fetchMetaDailyInsights: exports.fetchMetaDailyInsights,
    restore() {
      globalThis.Deno = previousDeno;
      globalThis.fetch = previousFetch;
    },
  };
}

test("account failures surface approved Meta diagnostics without tokens", async (t) => {
  const { fetchMetaDailyInsights, restore } = loadInsights(async () => Response.json({
    error: {
      message: `API access blocked: access_token=${accessToken}`,
      type: "OAuthException",
      code: 10,
      error_subcode: 463,
      fbtrace_id: "trace-account-123",
    },
  }, { status: 403 }));
  t.after(restore);

  await assert.rejects(fetchMetaDailyInsights(1), (error) => {
    assert.match(error.message, /^Meta API error: /);
    assert.match(error.message, /message="API access blocked: \[REDACTED\]"/);
    assert.match(error.message, /type="OAuthException"/);
    assert.match(error.message, /code="10"/);
    assert.match(error.message, /error_subcode="463"/);
    assert.match(error.message, /fbtrace_id="trace-account-123"/);
    assert.match(error.message, /http_status="403"/);
    assert.doesNotMatch(error.message, new RegExp(accessToken));
    assert.doesNotMatch(error.message, /access_token/i);
    return true;
  });
});

test("insights failures use the same safe diagnostics", async (t) => {
  let requests = 0;
  const { fetchMetaDailyInsights, restore } = loadInsights(async () => {
    requests += 1;
    if (requests === 1) {
      return Response.json({ currency: "GBP", timezone_name: "Europe/London" });
    }
    return Response.json({
      error: { message: "API access blocked.", code: 200, fbtrace_id: "trace-insights-456" },
    }, { status: 400 });
  });
  t.after(restore);

  await assert.rejects(fetchMetaDailyInsights(1), (error) => {
    assert.match(error.message, /message="API access blocked\."/);
    assert.match(error.message, /code="200"/);
    assert.match(error.message, /fbtrace_id="trace-insights-456"/);
    assert.match(error.message, /http_status="400"/);
    assert.doesNotMatch(error.message, /error_subcode=/);
    assert.doesNotMatch(error.message, new RegExp(accessToken));
    return true;
  });
  assert.equal(requests, 2);
});

test("successful Meta responses retain their existing result mapping", async (t) => {
  let requests = 0;
  const { fetchMetaDailyInsights, restore } = loadInsights(async () => {
    requests += 1;
    if (requests === 1) {
      return Response.json({ currency: "GBP", timezone_name: "Europe/London" });
    }
    return Response.json({ data: [{
      date_start: "2026-09-07", spend: "12.5", impressions: "1000", clicks: "20",
      inline_link_clicks: "15", ctr: "2", cpc: "0.625",
      actions: [{ action_type: "purchase", value: "2" }],
      action_values: [{ action_type: "purchase", value: "50" }],
      purchase_roas: [{ action_type: "purchase", value: "4" }],
    }] });
  });
  t.after(restore);

  assert.deepEqual(await fetchMetaDailyInsights(1), {
    adAccountId: "act_123",
    reportingTimezone: "Europe/London",
    currency: "GBP",
    days: [{
      reportingDate: "2026-09-07", spend: 12.5, impressions: 1000, clicks: 20,
      linkClicks: 15, landingPageViews: 0, ctr: 2, cpc: 0.625, purchases: 2,
      purchaseValue: 50, addToCarts: 0, checkouts: 0, roas: 4,
    }],
  });
  assert.equal(requests, 2);
});
