import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

async function observabilityModule() {
  const source = await read("supabase/functions/_shared/shopify/shipping-sync-observability.ts");
  const mod = {};
  new Function("exports", ts.transpileModule(source.replace(/^import .*;\r?\n/gm, ""), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(mod);
  return mod;
}

async function shippingLabelsModule() {
  const source = await read("supabase/functions/_shared/shopify/shipping-labels.ts");
  const mod = {};
  new Function("exports", "shopifyGraphQL", ts.transpileModule(source.replace(/^import .*;\r?\n/gm, ""), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(mod, () => { throw new Error("not called"); });
  return mod;
}

test("shipping refresh retains its authenticated, fail-closed invocation contract", async () => {
  const [refresh, config] = await Promise.all([
    read("supabase/functions/shopify-shipping-refresh/index.ts"),
    read("supabase/config.toml"),
  ]);
  assert.match(config, /\[functions\.shopify-shipping-refresh\]\s+verify_jwt = true/);
  assert.match(refresh, /request\.method !== "POST"/);
  assert.match(refresh, /X-Vault-Sync-Secret/);
  assert.match(refresh, /VAULT_ORDER_SYNC_SECRET/);
  assert.match(refresh, /refreshShippingCosts\(supabase\)/);
  assert.match(refresh, /shippingValidationDiagnostic\(shipping\.recovery\.failure\)/);
  assert.match(refresh, /shippingPersistenceDiagnostic\(shipping\.recovery\.failure\)/);
  assert.match(refresh, /Shipping recovery unavailable; normal refresh completed/);
  assert.match(refresh, /Shipping refresh unavailable; retry the same bounded window/);
  assert.doesNotMatch(refresh, /label_cost_gbp\s*:\s*0|coalesce\([^\n]*label_cost_gbp[^\n]*0/i);
});

test("shipping persistence diagnostics use an allowlist and never retain raw PostgREST text", async () => {
  const mod = await shippingLabelsModule();
  const diagnostic = new mod.ShippingPersistenceError({
    code: "23514",
    message: "row for gid://shopify/Order/123 violates constraint",
    details: "order 00000000-0000-0000-0000-000000000001 for person@example.com with Bearer secret",
  }, "11111111-1111-1111-1111-111111111111", 2).diagnostic;
  assert.deepEqual(diagnostic, {
    failure_stage: "record_shopify_shipping_costs",
    batch_correlation_id: "11111111-1111-1111-1111-111111111111",
    snapshot_count: 2,
    postgrest_code: "23514",
    postgrest_message_category: "constraint_violation",
    postgrest_details_present: true,
  });
  assert.doesNotMatch(JSON.stringify(diagnostic), /person@example|Bearer|00000000/i);
  assert.equal(mod.shippingPersistenceDiagnostic(new Error("other")), null);
});

test("shipping refresh preserves stable, non-sensitive outcome telemetry", async () => {
  const mod = await observabilityModule();
  assert.equal(mod.shippingSyncFailureCode(new Error("Shipping analytics unavailable or incompatible currency/timezone")), "SHIPPING_SOURCE_INCOMPATIBLE");
  assert.equal(mod.shippingSyncFailureCode(new Error("Incomplete shipping table")), "SHIPPING_SOURCE_INCOMPLETE");
  assert.equal(mod.shippingSyncFailureCode(new Error("Unable to persist shipping costs")), "SHIPPING_PERSISTENCE_FAILED");
  assert.equal(mod.shippingSyncFailureCode(new Error("anything else")), "SHIPPING_SYNC_FAILED");
  const calls = [];
  await mod.recordShippingSyncOutcome({ rpc: async (name, args) => { calls.push({ name, args }); return { error: null }; } }, { status: "unavailable", failureCode: "SHIPPING_SOURCE_UNAVAILABLE" });
  assert.deepEqual(calls, [{ name: "record_shopify_shipping_sync_outcome", args: { p_status: "unavailable", p_failure_code: "SHIPPING_SOURCE_UNAVAILABLE" } }]);
});
