import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../../../", import.meta.url);
const source = await readFile(new URL("supabase/functions/_shared/shopify/fulfillment-tracking-evidence.ts", root), "utf8");
const migration = await readFile(new URL("supabase/migrations/20261098000000_governed_shopify_fulfillment_tracking_evidence.sql", root), "utf8");
const lockGrantMigration = await readFile(new URL("supabase/migrations/20261099000000_grant_tracking_capture_lock_privilege.sql", root), "utf8");
const orders = await readFile(new URL("supabase/functions/_shared/shopify/orders.ts", root), "utf8");
const orderSync = await readFile(new URL("supabase/functions/shopify-order-sync/index.ts", root), "utf8");
const webhook = await readFile(new URL("supabase/functions/shopify-order-webhook/index.ts", root), "utf8");

async function api() {
  const executable = source
    .replace(/import type[^\n]+\n/, "")
    .replace(/import \{ sourceContentFingerprint \}[^\n]+\n/, "const sourceContentFingerprint=(value)=>JSON.stringify(value);\n")
    .replace(/import \{ runFulfillmentEvidenceProbe \}[^\n]+\n/, "const runFulfillmentEvidenceProbe=globalThis.__probe;\n");
  const js = ts.transpileModule(executable, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}

const order = (trackingValues) => ({ orderId: "gid://shopify/Order/1", updatedAt: "2026-10-08T10:00:00Z", fulfillmentsComplete: true, fulfillments: [{ fulfillmentId: "gid://shopify/Fulfillment/1", status: "SUCCESS", updatedAt: "2026-10-08T10:00:00Z", trackingValues }] });

test("tracking evidence preserves string numbers, deduplicates duplicates, and retains distinct tracking", async () => {
  const { buildFulfillmentTrackingEvidence } = await api();
  const payload = buildFulfillmentTrackingEvidence(order([
    { trackingNumber: "001234", trackingCompany: null, trackingUrl: null },
    { trackingNumber: "001234", trackingCompany: "Ignored duplicate", trackingUrl: "https://ignored" },
    { trackingNumber: "ABC-2", trackingCompany: "Carrier", trackingUrl: null },
  ]), "2026-10-08T10:01:00Z", "prospective");
  assert.deepEqual(payload.fulfillments[0].tracking, [
    { tracking_number: "001234", tracking_company: null, tracking_url: null },
    { tracking_number: "ABC-2", tracking_company: "Carrier", tracking_url: null },
  ]);
  assert.equal(payload.completeness.tracking_count, 2);
});

test("no tracking creates an affirmative zero-tracking capture and persistence is replay-safe", async () => {
  const { buildFulfillmentTrackingEvidence, persistFulfillmentTrackingEvidence } = await api();
  const payload = buildFulfillmentTrackingEvidence(order([]), "2026-10-08T10:01:00Z", "historical");
  assert.equal(payload.completeness.tracking_count, 0);
  const calls = [];
  const supabase = { rpc: async (...args) => { calls.push(args); return { error: null }; } };
  await persistFulfillmentTrackingEvidence(supabase, payload);
  await persistFulfillmentTrackingEvidence(supabase, payload);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0][1].payload, calls[1][1].payload);
});

test("distinct values from separate fulfilments remain separate", async () => {
  const { buildFulfillmentTrackingEvidence } = await api();
  const payload = buildFulfillmentTrackingEvidence({
    ...order([{ trackingNumber: "FIRST", trackingCompany: null, trackingUrl: null }]),
    fulfillments: [
      { fulfillmentId: "gid://shopify/Fulfillment/1", status: "SUCCESS", updatedAt: "2026-10-08T10:00:00Z", trackingValues: [{ trackingNumber: "FIRST", trackingCompany: null, trackingUrl: null }] },
      { fulfillmentId: "gid://shopify/Fulfillment/2", status: "SUCCESS", updatedAt: "2026-10-08T10:02:00Z", trackingValues: [{ trackingNumber: "SECOND", trackingCompany: "Carrier", trackingUrl: "https://carrier.example/second" }] },
    ],
  }, "2026-10-08T10:03:00Z", "prospective");
  assert.deepEqual(payload.fulfillments.map((fulfillment) => fulfillment.tracking[0].tracking_number), ["FIRST", "SECOND"]);
  assert.equal(payload.completeness.tracking_count, 2);
});

test("schema is immutable, service-role-only, and its bounded reader accepts only requested canonical orders", () => {
  assert.match(migration, /tracking_number text not null/);
  assert.match(migration, /revoke all on function public\.get_shopify_fulfillment_tracking_for_orders\(uuid\[\]\) from public,anon,authenticated/);
  assert.match(migration, /cardinality\(p_order_ids\)<1 or cardinality\(p_order_ids\)>100/);
  assert.match(migration, /where o\.id = any\(p_order_ids\)/);
  assert.doesNotMatch(source, /sales-workbook|BackfillProposal|BackfillWriter/);
});

test("SECURITY INVOKER replay locking has only the service-role UPDATE privilege PostgreSQL requires", () => {
  assert.match(migration, /record_shopify_fulfillment_tracking_evidence[\s\S]*?security invoker/i);
  assert.match(migration, /vault_shopify_fulfillment_tracking_capture_observations[\s\S]*?for update/i);
  assert.match(lockGrantMigration, /grant update on table public\.vault_shopify_fulfillment_tracking_capture_observations\s+to service_role/i);
  assert.doesNotMatch(lockGrantMigration, /vault_shopify_fulfillment_tracking_observations/i);
  assert.doesNotMatch(lockGrantMigration, /\bto\s+(?:public|anon|authenticated)\b/i);
});

test("tracking capture is a pre-canonical admission gate for every order-sync mode", () => {
  const trackingCapture = orders.indexOf("await persistFulfillmentTrackingEvidence(supabase, options.trackingEvidence);");
  const canonicalUpsert = orders.indexOf('.from("vault_shopify_orders")', trackingCapture);
  assert.ok(trackingCapture >= 0);
  assert.ok(canonicalUpsert > trackingCapture);
  assert.doesNotMatch(orders, /runFulfillmentEvidenceProbe|probeFulfillmentTrackingEvidence/);
});

test("orchestration batches Shopify probes at five orders and supplies each order only its own evidence", async () => {
  const { fulfillmentTrackingBatches } = await api();
  assert.deepEqual(fulfillmentTrackingBatches(["1"]), [["1"]]);
  assert.deepEqual(fulfillmentTrackingBatches(["1", "2", "3", "4", "5"]), [["1", "2", "3", "4", "5"]]);
  assert.deepEqual(fulfillmentTrackingBatches(["1", "2", "3", "4", "5", "6"]), [["1", "2", "3", "4", "5"], ["6"]]);
  assert.deepEqual(fulfillmentTrackingBatches(Array.from({ length: 12 }, (_, index) => String(index + 1))).map((batch) => batch.length), [5, 5, 2]);
  assert.throws(() => fulfillmentTrackingBatches(["1"], 6), /INVALID_FULFILLMENT_TRACKING_BATCH_SIZE/);
  assert.match(orderSync, /fulfillmentTrackingBatches\(orders\.map\(\(order\) => order\.id\)\)/);
  assert.match(orderSync, /trackingEvidence: trackingEvidence\.get\(order\.id\)/);
  assert.ok(orderSync.indexOf("for (const batch of fulfillmentTrackingBatches") < orderSync.indexOf("for (const order of orders)"), "all batch probes run before canonical upserts");
  assert.match(webhook, /probeFulfillmentTrackingEvidence\(\[order\.id\], "prospective"\)/);
});
