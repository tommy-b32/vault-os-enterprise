import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../../../", import.meta.url);
const helper = await readFile(new URL("supabase/functions/_shared/shopify/fulfillment-evidence-probe.ts", root), "utf8");
const edge = await readFile(new URL("supabase/functions/shopify-inventory-scope-diagnostic/index.ts", root), "utf8");
const route = await readFile(new URL("apps/web/app/api/inventory/fulfillment-probe/route.ts", root), "utf8");
const panel = await readFile(new URL("apps/web/components/inventory/InventorySyncPanel.tsx", root), "utf8");
const gid = "gid://shopify/Order/1";

function load() {
  const output = ts.transpileModule(helper, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("require", "exports", output)((name) => {
    if (name.includes("graphql")) return { shopifyGraphQL: async () => { throw new Error("unexpected default client"); } };
    throw new Error(name);
  }, exports);
  return exports;
}

const rawFulfillment = (id = "gid://shopify/Fulfillment/1") => ({
  id, status: "SUCCESS", displayStatus: "FULFILLED", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:01:00Z", inTransitAt: null, deliveredAt: null, location: { id: "gid://shopify/Location/1" },
  trackingInfo: [{ number: "001234", company: "Carrier", url: "https://carrier.example/001234" }],
  fulfillmentLineItems: { nodes: [{ id: "gid://shopify/FulfillmentLineItem/1", createdAt: "2026-01-01T00:00:00Z", quantity: 1, lineItem: { id: "gid://shopify/LineItem/1", variant: { id: "gid://shopify/ProductVariant/1", inventoryItem: { id: "gid://shopify/InventoryItem/1" } } } }], pageInfo: { hasNextPage: false, endCursor: null } },
  events: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
});

test("probe accepts only its fixed bounded request contract", () => {
  const api = load();
  assert.deepEqual(api.parseFulfillmentEvidenceProbeRequest({ diagnostic: "fulfillment_evidence_probe_v1", orderIds: [gid] }), { orderIds: [gid] });
  for (const value of [{}, { diagnostic: "fulfillment_evidence_probe_v1", orderIds: [] }, { diagnostic: "x", orderIds: [gid] }, { diagnostic: "fulfillment_evidence_probe_v1", orderIds: ["1"] }, { diagnostic: "fulfillment_evidence_probe_v1", orderIds: [gid], query: "mutation" }, { diagnostic: "fulfillment_evidence_probe_v1", orderIds: Array(6).fill(gid).map((x, i) => x.replace("/1", `/${i + 1}`)) }]) assert.throws(() => api.parseFulfillmentEvidenceProbeRequest(value), /INVALID_FULFILLMENT_PROBE_REQUEST/);
});

test("probe uses collector-owned queries, sanitizes output, and writes nowhere", async () => {
  const api = load(); const calls = [];
  const graphql = async (query, variables) => { calls.push({ query, variables }); return { nodes: [{ id: gid, updatedAt: "2026-01-01T00:00:00Z", fulfillments: [rawFulfillment()] }] }; };
  const result = await api.runFulfillmentEvidenceProbe([gid], graphql);
  assert.equal(result.orders[0].fulfillments[0].lineItems[0].inventoryItemId, "gid://shopify/InventoryItem/1");
  assert.deepEqual(result.orders[0].fulfillments[0].trackingValues, [{ trackingNumber: "001234", trackingCompany: "Carrier", trackingUrl: "https://carrier.example/001234" }]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /^query VaultFulfillmentEvidenceProbe/);
  assert.deepEqual(calls[0].variables, { orderIds: [gid] });
  assert.doesNotMatch(helper, /\.from\(|\.rpc\(|insert\(|update\(|delete\(|mutation\s+/i);
  assert.doesNotMatch(JSON.stringify(result), /accessToken|clientSecret|serviceRole|address/i);
});

test("probe fails closed on pagination, duplicate identities, and missing required fields", async () => {
  const api = load();
  const initial = (fulfillment) => ({ nodes: [{ id: gid, updatedAt: "2026-01-01T00:00:00Z", fulfillments: [fulfillment] }] });
  await assert.rejects(api.runFulfillmentEvidenceProbe([gid], async () => initial({ ...rawFulfillment(), fulfillmentLineItems: { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } } })), /FULFILLMENT_PAGINATION_INCOMPLETE/);
  await assert.rejects(api.runFulfillmentEvidenceProbe([gid], async () => initial({ ...rawFulfillment(), fulfillmentLineItems: { nodes: [rawFulfillment().fulfillmentLineItems.nodes[0], rawFulfillment().fulfillmentLineItems.nodes[0]], pageInfo: { hasNextPage: false, endCursor: null } } })), /DUPLICATE_FULFILLMENT_IDENTITY/);
  await assert.rejects(api.runFulfillmentEvidenceProbe([gid], async () => initial({ ...rawFulfillment(), location: { id: "" } })), /REQUIRED_FULFILLMENT_FIELD_MISSING/);
  await assert.rejects(api.runFulfillmentEvidenceProbe([gid], async () => ({ nodes: [null] })), /ORDER_NOT_FOUND/);
});

test("probe completes nested line-item pages and rejects repeated cursors", async () => {
  const api = load();
  let call = 0;
  const graphql = async () => {
    call += 1;
    if (call === 1) return { nodes: [{ id: gid, updatedAt: "2026-01-01T00:00:00Z", fulfillments: [{ ...rawFulfillment(), fulfillmentLineItems: { nodes: [rawFulfillment().fulfillmentLineItems.nodes[0]], pageInfo: { hasNextPage: true, endCursor: "next" } } }] }] };
    return { node: { fulfillmentLineItems: { nodes: [{ ...rawFulfillment().fulfillmentLineItems.nodes[0], id: "gid://shopify/FulfillmentLineItem/2" }], pageInfo: { hasNextPage: false, endCursor: null } } } };
  };
  const result = await api.runFulfillmentEvidenceProbe([gid], graphql);
  assert.equal(result.orders[0].fulfillments[0].lineItemCount, 2);
  let repeated = 0;
  await assert.rejects(api.runFulfillmentEvidenceProbe([gid], async () => {
    repeated += 1;
    if (repeated === 1) return { nodes: [{ id: gid, updatedAt: "2026-01-01T00:00:00Z", fulfillments: [{ ...rawFulfillment(), fulfillmentLineItems: { nodes: [], pageInfo: { hasNextPage: true, endCursor: "same" } } }] }] };
    return { node: { fulfillmentLineItems: { nodes: [], pageInfo: { hasNextPage: true, endCursor: "same" } } } };
  }), /FULFILLMENT_PAGINATION_INCOMPLETE/);
});

test("probe uses Shopify's non-paginated Order.fulfillments list and rejects duplicates", async () => {
  const api = load();
  assert.doesNotMatch(api.FULFILLMENT_EVIDENCE_PROBE_QUERY, /fulfillments\(first:|fulfillments\s*\{\s*nodes|fulfillments\s*\{[^}]*pageInfo/);
  assert.match(api.FULFILLMENT_EVIDENCE_PROBE_QUERY, /trackingInfo \{ number company url \}/);
  assert.match(api.FULFILLMENT_EVIDENCE_PROBE_QUERY, /fulfillmentLineItems\(first: 50\)/);
  await assert.rejects(api.runFulfillmentEvidenceProbe([gid], async () => ({ nodes: [{ id: gid, updatedAt: "2026-01-01T00:00:00Z", fulfillments: [rawFulfillment(), rawFulfillment()] }] })), /DUPLICATE_FULFILLMENT_IDENTITY/);
});

test("edge remains server-only and route retains owner/operator authorization", () => {
  assert.match(edge, /isVaultServerInvocation/);
  assert.match(edge, /parseFulfillmentEvidenceProbeRequest/);
  assert.match(edge, /runFulfillmentEvidenceProbe/);
  assert.match(edge, /Object\.keys\(body\)\.length > 0/);
  assert.match(route, /authorizeApiRequest\(\["owner", "operator"\]\)/);
  assert.match(route, /Cache-Control.: .no-store/);
  assert.match(route, /NODE_ENV !== "development"/);
  assert.match(route, /functions\.invoke\("shopify-inventory-scope-diagnostic"/);
  assert.match(panel, /probeEnabled = process\.env\.NODE_ENV === "development"/);
  assert.match(panel, /\/api\/inventory\/fulfillment-probe/);
  assert.match(panel, /fulfillment_evidence_probe_v1/);
});
