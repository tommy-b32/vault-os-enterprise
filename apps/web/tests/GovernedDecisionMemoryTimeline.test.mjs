import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../lib/brain/getGovernedDecisionMemoryTimeline.ts", import.meta.url), "utf8");

test("governed memory timeline is a bounded read-only stored-history model", () => {
  assert.match(source, /listRecent\(\{ limit: HISTORY_LIMIT \}\)/);
  assert.match(source, /const HISTORY_LIMIT = 20/);
  assert.match(source, /const VISIBLE_LIMIT = 8/);
  assert.match(source, /\[\.\.\.newestFirst\]\.reverse\(\)/);
  assert.match(source, /compareGovernedDecisionMemoryRecords\(previous, record\)/);
  assert.doesNotMatch(source, /runGovernedDecisionEvaluation|runGovernedDecisionMemoryCapture|recordGovernedDecisionMemory|vault_operational_snapshots|getLiveInventorySnapshot|createOperationalSnapshot/);
});

test("governed memory timeline fails closed and preserves safe presentation boundaries", () => {
  for (const text of ["No governed memory has been recorded yet.", "No earlier governed record is available for comparison.", "Daily baseline captured", "Governed evidence refreshed", "Governed evaluation version changed", "Comparison unavailable for this record.", "Governed memory history is currently unavailable.", "No meaningful governed change recorded in recent history."]) assert.match(source, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(source, /interpretGovernedDecisionMemoryChange/);
  assert.doesNotMatch(source, /runGovernedDecisionEvaluation|runGovernedDecisionMemoryCapture|recordGovernedDecisionMemory/);
});
