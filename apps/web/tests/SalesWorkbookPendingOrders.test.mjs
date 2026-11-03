import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const componentUrl = new URL("components/operations/SalesWorkbookUpload.tsx", root);
const endpointUrl = new URL("app/api/sales-workbook/pending/route.ts", root);

async function helpers() {
  const source = await readFile(componentUrl, "utf8");
  const start = source.indexOf("type Stored");
  const end = source.indexOf("export function SalesWorkbookUpload");
  const js = ts.transpileModule(source.slice(start, end), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}

test("pending Shopify orders are displayed once and existing workbook orders excluded", async () => {
  const { excludeWorkbookOrdersFromPending } = await helpers();
  const pending = [
    { orderNumber: "1343", date: "2026-10-28", products: ["Item A"], reasons: ["EVIDENCE_COST_UNRESOLVED"] },
    { orderNumber: "1344", date: "2026-10-29", products: ["Item B"], reasons: [] },
  ];
  const rows = [{ orderNumber: "1343" }, { orderNumber: null }];
  assert.deepEqual(excludeWorkbookOrdersFromPending(pending, rows), [pending[1]]);
  assert.equal(pending.length, 2);
});

test("pending entries do not affect workbook week, month or year profit", async () => {
  const { excludeWorkbookOrdersFromPending, profitSummary } = await helpers();
  const rows = [{ orderNumber: "1348", date: "1/11/26", profit: "£43.76" }];
  const pending = [{ orderNumber: "1349", date: "2026-11-03", products: ["Item"], reasons: ["EVIDENCE_PROFIT_UNRESOLVED"] }];
  assert.equal(excludeWorkbookOrdersFromPending(pending, rows).length, 1);
  for (const period of ["week", "month", "year"]) {
    const before = profitSummary(rows, period, new Date("2026-11-03T12:00:00Z"));
    const after = profitSummary(rows, period, new Date("2026-11-03T12:00:00Z"));
    assert.deepEqual(after, before);
  }
  assert.equal(profitSummary(rows, "month", new Date("2026-11-03T12:00:00Z")).total, 43.76);
});

test("pending endpoint requires operator authentication and never writes financial data", async () => {
  const source = await readFile(endpointUrl, "utf8");
  assert.match(source, /await requireAuthenticatedOperator\(\)/);
  assert.match(source, /vault_sales_workbook_deferred_orders/);
  assert.match(source, /vault_shopify_order_lines/);
  assert.doesNotMatch(source, /\.(insert|update|upsert|delete)\(/);
});

test("viewer reports pending refresh failures rather than silently reporting zero", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /setPendingError\(true\)/);
  assert.match(source, /Pending orders could not be refreshed/);
});
