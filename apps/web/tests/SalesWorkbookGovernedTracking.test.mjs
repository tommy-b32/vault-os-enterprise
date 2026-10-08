import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const root = new URL("../", import.meta.url);

async function trackingResolver() {
  const source = await readFile(new URL("lib/sales-workbook/GovernedTracking.ts", root), "utf8");
  const executable = source.replace('import "server-only";', "").replace('import type { ProposalField } from "./BackfillProposal";', "");
  const javascript = ts.transpileModule(executable, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

test("one governed tracking value is applied to every multi-line proposal row", async () => {
  const { governedTrackingFieldsByOrder } = await trackingResolver();
  const field = governedTrackingFieldsByOrder(["order-1329"], [
    { order_id: "order-1329", tracking_number: "VU733316090GB" },
    { order_id: "order-1329", tracking_number: "VU733316090GB" },
  ]).get("order-1329");
  assert.deepEqual(field, { value: "VU733316090GB", status: "proven", source: "governed_shopify_fulfillment_tracking" });
});

test("no governed tracking leaves the append field blank", async () => {
  const { governedTrackingFieldsByOrder } = await trackingResolver();
  assert.deepEqual(governedTrackingFieldsByOrder(["order-1"], []).get("order-1"), {
    value: "", status: "not_applicable", source: "governed_shopify_fulfillment_tracking_absent",
  });
});

test("multiple distinct governed tracking values fail closed", async () => {
  const { governedTrackingFieldsByOrder } = await trackingResolver();
  assert.deepEqual(governedTrackingFieldsByOrder(["order-1"], [
    { order_id: "order-1", tracking_number: "AA001" },
    { order_id: "order-1", tracking_number: "BB002" },
  ]).get("order-1"), {
    value: null, status: "unresolved", source: "governed_shopify_fulfillment_tracking_ambiguous",
  });
});

test("the backfill service uses only the bounded governed tracking RPC", async () => {
  const source = await readFile(new URL("lib/sales-workbook/BackfillProposalService.ts", root), "utf8");
  assert.match(source, /get_shopify_fulfillment_tracking_for_orders",\{p_order_ids:orderIds\}/);
  assert.match(source, /governedTrackingFieldsByOrder\(orderIds,trackingEvidence\)/);
  assert.doesNotMatch(source, /tracking_number.*shopifyGraphQL|fetch\(/);
});
