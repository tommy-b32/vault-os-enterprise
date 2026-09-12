import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../../../scripts/b22-fixed-pack-receiving-preflight.sql", import.meta.url), "utf8");

test("B22D preflight is read-only and audits fixed-pack receiving integrity", () => {
  assert.match(sql, /^begin read only;/m);
  assert.match(sql, /rollback;/);
  assert.doesNotMatch(sql, /\b(?:insert|update|delete|alter|create|drop|grant|revoke)\b/i);
  for (const code of ["FIXED_LINE_MISSING_SIZE_ALLOCATIONS", "RECEIVABLE_LEGACY_SOURCE_UNSUPPORTED_BY_B22C", "FIXED_LINE_ALLOCATION_TOTAL_MISMATCH", "FIXED_RECEIPT_LINK_MISSING", "LEGACY_RECEIPT_UNEXPECTED_LINK", "RECEIPT_LINK_WRONG_LINE", "FIXED_SIZE_PHYSICAL_OVER_RECEIVED", "FIXED_SIZE_CURRENT_IDENTITY_MISMATCH", "RECEIVED_FIXED_PO_INCOMPLETE", "IMPOSSIBLE_RECEIPT_PHYSICAL_QUANTITY"]) assert.match(sql, new RegExp(code));
  assert.match(sql, /'FAIL'/);
  assert.match(sql, /'PASS'/);
});
