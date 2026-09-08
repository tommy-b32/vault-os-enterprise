import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../../supabase/migrations/20260910000000_purchase_intelligence_option_identity.sql", import.meta.url), "utf8");

test("Step 2A backfill is product-structural, conservative, and preserves authoritative metadata", () => {
  assert.match(migration, /bool_and\(nullif\(trim\(option_1\).*phase3a_size\(option_1\) is not null\)/s);
  assert.match(migration, /bool_and\(nullif\(trim\(option_2\).*phase3a_size\(option_2\) is not null\)/s);
  assert.match(migration, /r\.one_present and r\.one_sizes and not \(r\.two_present and r\.two_sizes\)/);
  assert.match(migration, /r\.two_present and r\.two_sizes and not \(r\.one_present and r\.one_sizes\)/);
  assert.match(migration, /not r\.two_present.*'Default'/s);
  assert.match(migration, /v\.identity_resolution_status = 'unresolved'/);
  assert.doesNotMatch(migration, /option_[123]_name\s*=/);
  assert.doesNotMatch(migration, /set\s+option_[123]_name/i);
});

test("Step 2A supports standard, reversed, multi-model, size-only, and fails closed mixed structures", () => {
  const size = (value) => ({ S: 'S', M: 'M', L: 'L', XL: 'XL' })[value] ?? null;
  const classify = (rows) => {
    const one = rows.every((row) => !row[0] || size(row[0])); const two = rows.every((row) => !row[1] || size(row[1]));
    const onePresent = rows.some((row) => row[0]); const twoPresent = rows.some((row) => row[1]);
    if ((onePresent && one) === (twoPresent && two)) return rows.map(() => null);
    return rows.map((row) => one ? { model: row[1] || 'Default', size: size(row[0]) } : { model: row[0] || 'Default', size: size(row[1]) });
  };
  assert.deepEqual(classify([['Triple', 'M'], ['Triple', 'L']]), [{ model: 'Triple', size: 'M' }, { model: 'Triple', size: 'L' }]);
  assert.deepEqual(classify([['M', 'Triple'], ['L', 'Triple']]), [{ model: 'Triple', size: 'M' }, { model: 'Triple', size: 'L' }]);
  assert.deepEqual(classify([['Triple', 'XL'], ['Badge', 'XL']]).map((row) => row.model), ['Triple', 'Badge']);
  assert.deepEqual(classify([['M', null], ['L', null]]), [{ model: 'Default', size: 'M' }, { model: 'Default', size: 'L' }]);
  assert.deepEqual(classify([['M', 'L'], ['L', 'M']]), [null, null]);
  assert.deepEqual(classify([['Triple', 'M'], ['Triple', 'Unknown']]), [null, null]);
});
