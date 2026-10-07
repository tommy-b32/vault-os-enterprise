import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const proven = value => ({ value, status: "proven", source: "fixture" });
const unresolved = () => ({ value: null, status: "unresolved", source: "fixture" });
const line = (overrides = {}) => ({ product: proven("Product"), salePrice: proven(40), cost: proven(10), costAndShip: proven(12), postageFee: proven(3), cardFee: proven(1), tracking: { value: "", status: "not_applicable", source: "fixture" }, ...overrides });
const order = (overrides = {}) => ({ orderNumber: "1251", createdAt: "2026-07-05T12:00:00.000Z", refunded: false, cancelled: false, financiallyUnusual: false, fulfilmentStatus: "fulfilled", lines: [line()], ...overrides });

async function moduleUnderTest() {
  const source = await readFile(new URL("lib/sales-workbook/BackfillProposal.ts", root), "utf8");
  const executable = source.replace('import "server-only";', "").replace('import { normalizeWorkbookOrderNumber } from "./WorkbookParser";', 'const normalizeWorkbookOrderNumber=(value)=>{const text=String(value??"").trim().replace(/^#/,"");return /^\\d+$/.test(text)&&Number(text)>0?text.replace(/^0+(?=\\d)/,""):null;}');
  const javascript = ts.transpileModule(executable, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

test("one-line fully proven order is ready, preserves blank tracking, and keeps J blank", async () => {
  const { buildBackfillProposal } = await moduleUnderTest();
  const result = buildBackfillProposal([order()]);
  const proposal = result.proposals[0], row = proposal.proposedRows[0];
  assert.equal(proposal.classification, "ready");
  assert.equal(result.readyOrderCount, 1);
  assert.equal(row.profit.value, 24);
  assert.equal(row.tracking.value, "");
  assert.equal(row.blankColumnJ.value, "");
  assert.equal(row.dateOfSale.value, "5/7/26");
});

test("multi-line orders produce multiple rows, while unresolved financial fields fail closed", async () => {
  const { buildBackfillProposal } = await moduleUnderTest();
  const result = buildBackfillProposal([
    order({ orderNumber: "#1252", lines: [line(), line({ product: proven("Second") })] }),
    order({ orderNumber: "1253", lines: [line({ cost: unresolved() })] }),
    order({ orderNumber: "1254", lines: [line({ costAndShip: unresolved() })] }),
    order({ orderNumber: "1255", lines: [line({ cardFee: unresolved() })] }),
  ]);
  assert.equal(result.proposals[0].proposedRows.length, 2);
  for (const proposal of result.proposals.slice(1)) {
    assert.equal(proposal.classification, "requires_review");
    assert.equal(proposal.proposedRows[0].profit.status, "unresolved");
  }
});

test("Posted is fulfilment-only: fulfilled is Complete, unfulfilled is blank, and partial is unresolved",async()=>{const{buildBackfillProposal}=await moduleUnderTest();const result=buildBackfillProposal([order({orderNumber:"1251",fulfilmentStatus:"fulfilled"}),order({orderNumber:"1252",fulfilmentStatus:"unfulfilled"}),order({orderNumber:"1253",fulfilmentStatus:"partial"}),order({orderNumber:"1254",fulfilmentStatus:null})]);assert.equal(result.proposals[0].proposedRows[0].posted.value,"Complete");assert.equal(result.proposals[1].proposedRows[0].posted.value,"");assert.equal(result.proposals[2].proposedRows[0].posted.status,"unresolved");assert.equal(result.proposals[3].proposedRows[0].posted.status,"unresolved");});

test("refunded/cancelled orders are conservative and older exceptions are excluded", async () => {
  const { buildBackfillProposal } = await moduleUnderTest();
  const result = buildBackfillProposal([order({ orderNumber: "1001" }), order({ orderNumber: "1329", refunded: true }), order({ orderNumber: "1256", cancelled: true }), order({ orderNumber: "1330" })]);
  assert.deepEqual(result.proposals.map(proposal => proposal.orderNumber), ["1256", "1329"]);
  assert.ok(result.proposals.every(proposal => proposal.classification === "requires_review"));
  assert.equal(result.targetOrderRange, "1251-1329");
});

test("backfill proposal route is read-only and uses protected canonical evidence", async () => {
  const [source, route] = await Promise.all([readFile(new URL("lib/sales-workbook/BackfillProposal.ts", root), "utf8"), readFile(new URL("app/api/sales-workbook/backfill-proposal/route.ts", root), "utf8")]);
  for (const text of ["vault_shopify_order_lines", "vault_shopify_resolved_line_discount_evidence", "vault_shopify_verified_product_profitability_line_allocations", "requireOperatorRole(\"owner\", \"operator\")", "canonical_shopify_fulfilment_status"]) assert.ok(`${source}${route}`.includes(text));
  assert.doesNotMatch(`${source}${route}`, /\.insert\(|\.update\(|\.upsert\(|\.remove\(|storage\.from/i);
});
