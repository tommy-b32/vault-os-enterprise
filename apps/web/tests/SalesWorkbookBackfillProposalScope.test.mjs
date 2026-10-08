import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const root = new URL("../", import.meta.url);

async function scopeModule() {
  const source = await readFile(new URL("lib/sales-workbook/BackfillProposalScope.ts", root), "utf8");
  const executable = source
    .replace('import "server-only";', "")
    .replace('import { normalizeWorkbookOrderNumber } from "./WorkbookParser";', 'const normalizeWorkbookOrderNumber=(value)=>{const text=String(value??"").trim().replace(/^#/,"");return /^\\d+$/.test(text)&&Number(text)>0?text.replace(/^0+(?=\\d)/,""):null;};');
  const javascript = ts.transpileModule(executable, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

test("existing workbook order groups are excluded before expensive canonical evidence lookup", async () => {
  const { backfillCandidateScope } = await scopeModule();
  const existing = Array.from({ length: 43 }, (_, index) => String(1251 + index));
  const result = backfillCandidateScope(existing);
  assert.equal(result.excludedExistingOrderCount, 43);
  assert.equal(result.candidateOrderNumbers.length, 36);
  assert.equal(result.candidateOrderNumbers.includes("1251"), false);
  assert.equal(result.candidateOrderNumbers.includes("1329"), true);
});

test("scope normalizes workbook order display values without excluding unrelated target orders", async () => {
  const { backfillCandidateScope } = await scopeModule();
  const result = backfillCandidateScope(["#1329", "001251", "manual"]);
  assert.equal(result.excludedExistingOrderCount, 2);
  assert.equal(result.candidateOrderNumbers.includes("1251"), false);
  assert.equal(result.candidateOrderNumbers.includes("1329"), false);
  assert.equal(result.candidateOrderNumbers.includes("1252"), true);
});
