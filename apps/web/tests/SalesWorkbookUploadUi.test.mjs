import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const componentUrl = new URL("components/operations/SalesWorkbookUpload.tsx", root);

async function viewerHelpers() {
  const source = await readFile(componentUrl, "utf8");
  const start = source.indexOf("type Stored");
  const end = source.indexOf("export function SalesWorkbookUpload");
  const helpers = source.slice(start, end);
  const javascript = ts.transpileModule(helpers, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

function row({
  orderNumber = null,
  rowNumber,
  product = "Product",
  salePrice = "£35",
  cost = "£10",
  unitCogs = "£12",
  postage = "£3",
  cardFee = "£1",
  profit = "£19",
  posted = "Complete",
  tracking = "TRACK-1",
  date = "7/10/26",
} = {}) {
  return {
    orderNumber,
    rowNumber,
    dateOfSale: date,
    values: [product, salePrice, cost, unitCogs, postage, cardFee, profit, posted, tracking, "", date, orderNumber ?? ""],
  };
}

test("four workbook lines for one order become one aggregated read-only viewer row", async () => {
  const { groupSalesRows } = await viewerHelpers();
  const source = [
    row({ orderNumber: "1325", rowNumber: 100, product: "Product A", tracking: "TRACK-1" }),
    row({ orderNumber: "1325", rowNumber: 101, product: "Product B", tracking: "TRACK-1" }),
    row({ orderNumber: "1325", rowNumber: 102, product: "Product C", tracking: "TRACK-1" }),
    row({ orderNumber: "1325", rowNumber: 103, product: "Product D", tracking: "TRACK-1" }),
  ];

  const [grouped] = groupSalesRows(source);
  assert.equal(groupSalesRows(source).length, 1);
  assert.equal(grouped.products, "Product A / Product B / Product C / Product D");
  assert.equal(grouped.salePrice, "£140.00");
  assert.equal(grouped.cost, "£40.00");
  assert.equal(grouped.unitCogs, "£48.00");
  assert.equal(grouped.postage, "£12.00");
  assert.equal(grouped.cardFee, "£4.00");
  assert.equal(grouped.profit, "£76.00");
  assert.equal(grouped.tracking, "TRACK-1");
  assert.equal(grouped.orderNumber, "1325");
});

test("repeated products retain quantity, blank-order rows stay independent, and unresolved money is not invented", async () => {
  const { groupSalesRows } = await viewerHelpers();
  const source = [
    row({ orderNumber: "1325", rowNumber: 100, product: "Mnclr 1952" }),
    row({ orderNumber: "1325", rowNumber: 101, product: "Mnclr 1952", tracking: "TRACK-2", salePrice: "" }),
    row({ rowNumber: 102, product: "Manual row 1" }),
    row({ rowNumber: 103, product: "Manual row 2" }),
  ];

  const grouped = groupSalesRows(source);
  assert.equal(grouped.length, 3);
  assert.equal(grouped[0].products, "Mnclr 1952 x2");
  assert.equal(grouped[0].salePrice, "");
  assert.equal(grouped[0].tracking, "TRACK-1 / TRACK-2");
  assert.deepEqual(grouped.slice(1).map((item) => item.products), ["Manual row 1", "Manual row 2"]);
});

test("numbered Shopify orders sort numerically descending before manual rows without changing source rows", async () => {
  const { groupSalesRows, sortViewerRows } = await viewerHelpers();
  const source = [
    row({ orderNumber: "1163", rowNumber: 10, date: "30/12/26" }),
    row({ orderNumber: "1325", rowNumber: 20, date: "7/10/26" }),
    row({ orderNumber: "1326", rowNumber: 21, date: "5/9/26" }),
    row({ orderNumber: "1327", rowNumber: 22, date: "1/1/26" }),
    row({ rowNumber: 23, date: "8/10/26" }),
    row({ rowNumber: 24, date: "not a date" }),
  ];
  const before = structuredClone(source);

  const sorted = sortViewerRows(groupSalesRows(source));
  assert.deepEqual(sorted.map((item) => item.orderNumber), ["1327", "1326", "1325", "1163", null, null]);
  assert.equal(sorted.slice(0, 1)[0].orderNumber, "1327");
  assert.deepEqual(source, before);
});

test("numeric comparison does not use string order and manual rows use date then source-row tie breaking", async () => {
  const { groupSalesRows, sortViewerRows } = await viewerHelpers();
  const sorted = sortViewerRows(groupSalesRows([
    row({ orderNumber: "99", rowNumber: 1, date: "1/1/26" }),
    row({ orderNumber: "100", rowNumber: 2, date: "1/1/26" }),
    row({ rowNumber: 3, date: "5/10/26" }),
    row({ rowNumber: 4, date: "5/10/26" }),
    row({ rowNumber: 5, date: "invalid" }),
  ]));

  assert.deepEqual(sorted.map((item) => item.orderNumber), ["100", "99", null, null, null]);
  assert.deepEqual(sorted.slice(2).map((item) => item.rowNumber), [4, 3, 5]);
});

test("search finds any product, tracking value, or grouped order number", async () => {
  const { filterViewerRows, groupSalesRows } = await viewerHelpers();
  const grouped = groupSalesRows([
    row({ orderNumber: "1325", rowNumber: 10, product: "First item", tracking: "TRACK-A" }),
    row({ orderNumber: "1325", rowNumber: 11, product: "Second item", tracking: "TRACK-B" }),
    row({ orderNumber: "1326", rowNumber: 12, product: "Other item", tracking: "TRACK-C" }),
  ]);

  assert.deepEqual(filterViewerRows(grouped, "second item", "All").map((item) => item.orderNumber), ["1325"]);
  assert.deepEqual(filterViewerRows(grouped, "track-b", "All").map((item) => item.orderNumber), ["1325"]);
  assert.deepEqual(filterViewerRows(grouped, "1326", "All").map((item) => item.orderNumber), ["1326"]);
});

test("viewer source applies grouped search/filter, sort, pagination, governed actions, and correction confirmation", async () => {
  const ui = await readFile(componentUrl, "utf8");
  for (const text of [
    "fetch(\"/api/sales-workbook\")",
    "fetch(\"/api/sales-workbook/view\")",
    "body.append(\"workbook\", file)",
    "accept=\".xlsx",
    "groupSalesRows(rows ?? [])",
    "sortViewerRows(filterViewerRows(groupedRows, query, payout))",
    "visibleRows.slice((page - 1) * size, page * size)",
    "row.products, row.tracking, row.orderNumber",
    "[25, 50, 100]",
    "orders · {rows.length} underlying sales rows",
    "sales-workbook-table-wrap{overflow-x:auto",
    "min-width:1760px",
    "sales-workbook-product{width:380px",
    "sales-workbook-tracking{width:180px",
    "sales-workbook-money{width:100px;text-align:right;font-variant-numeric:tabular-nums",
    "text-overflow:ellipsis",
    "index === 0 || index === 8 ? value : undefined",
    "PROFIT THIS",
    "Europe/London",
    "View in Shopify ↗",
    "Confirm and save",
    "fetch(\"/api/sales-workbook/corrections\"",
    "setInterval(() => { void view(true); }, 30_000)",
  ]) assert.ok(ui.includes(text), `missing ${text}`);

  assert.doesNotMatch(ui, /storage\.from|createSignedUrl|contentEditable|\bdelete\b|\bupdate\b/iu);
});

test("profit summaries retain an explicit incomplete-order count", async () => {
  const { groupSalesRows, profitSummary } = await viewerHelpers();
  const rows = groupSalesRows([row({ orderNumber: "1325", rowNumber: 1, profit: "£20", date: "13/10/26" }), row({ orderNumber: "1326", rowNumber: 2, profit: "", date: "13/10/26" })]);
  const result = profitSummary(rows, "week", new Date("2026-10-13T12:00:00Z"));
  assert.equal(result.total, 20);
  assert.equal(result.incomplete, 1);
});

test("financial cells use the existing correction proposal flow and tracking cells retain trusted new-tab links", async () => {
  const ui = await readFile(componentUrl, "utf8");
  for (const type of ["sale_price", "cogs", "postage", "card_fee"]) assert.match(ui, new RegExp(`inlineFinancialTypes[\\s\\S]*${type}`));
  assert.match(ui, /event\.key === "Enter"/);
  assert.match(ui, /event\.key === "Escape"/);
  assert.match(ui, /Reason for correction \(required\)/);
  assert.match(ui, /createCorrectionProposal/);
  assert.match(ui, /trustedTracking\.map/);
  assert.match(ui, /target="_blank" rel="noopener noreferrer"/);
  assert.match(ui, /sales-workbook-inline-cell--missing/);
  assert.doesNotMatch(ui, /contentEditable/);
});

test("inline financial editing uses a spinner-free text field with normal keyboard controls", async () => {
  const ui = await readFile(componentUrl, "utf8");
  assert.match(ui, /className="sales-workbook-inline-value"/);
  assert.match(ui, /type="text" value=\{inlineEdit\.value\}/);
  assert.match(ui, /inputMode="decimal"/);
  assert.match(ui, /event\.currentTarget\.select\(\)/);
  assert.match(ui, /appearance:textfield/);
  assert.match(ui, /::-webkit-inner-spin-button/);
  assert.match(ui, /Tab moves between the value, reason and review controls/);
});

test("inline review keeps the governed proposal and application workflow visible", async () => {
  const ui = await readFile(componentUrl, "utf8");
  assert.match(ui, /Reviewing change/);
  assert.match(ui, /Review change/);
  assert.match(ui, /Confirm and save/);
  assert.match(ui, /role="status"/);
  assert.match(ui, /await createCorrectionProposal\(inlineEdit\.row, inlineEdit\.type, inlineEdit\.value, inlineEdit\.reason\)/);
  assert.doesNotMatch(ui, /setInlineEdit\(null\);\s*}\s*async function applyCorrection/);
  assert.doesNotMatch(ui, /className="sales-workbook-edit"/);
});
