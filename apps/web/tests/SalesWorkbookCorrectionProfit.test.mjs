import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as XLSX from "xlsx";
import * as CFB from "cfb";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../lib/sales-workbook");
const cache = new Map();
function load(name) {
  const file = resolve(root, name); if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const js = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = specifier => specifier === "server-only" ? {} : specifier.startsWith(".") ? load(`${specifier}.ts`) : require(specifier);
  runInNewContext(`(function(require,module,exports){${js}\n})`, { Array, ArrayBuffer, Buffer, Date, JSON, Map, Number, Object, Set, Uint8Array, XLSX })(localRequire, module, module.exports);
  return module.exports;
}
const { prepareSalesOrderCorrection } = load("SalesOrderCorrectionWriter.ts");
const { validateSalesOrderCorrection } = load("SalesOrderCorrection.ts");
const headers = ["Product", "Sale Price", "Cost", "Unit COGS", "Postage fee", "Card Fee", "Profit", "Posted", "Tracking", "", "date of sale", "order number"];
function workbook(cardFee = 1) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["SALES"], headers, ["Product", 40, 10, 12, 3, cardFee, 24, "Complete", "", "", "13/10/26", "1251"]]), "Sales");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Costings"]]), "Costings");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Dashboard"]]), "Dashboard");
  return new Uint8Array(XLSX.write(book, { bookType: "xlsx", type: "array" }));
}
const correction = (type, value) => ({ orderNumber: "1251", type, value, reason: "verified correction", mappedRowNumber: 3 });
const sales = bytes => XLSX.utils.sheet_to_json(XLSX.read(bytes, { type: "array" }).Sheets.Sales, { header: 1, defval: "" })[2];
const u16 = (bytes, offset) => bytes[offset] | bytes[offset + 1] << 8;
const u32 = (bytes, offset) => (bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16 | bytes[offset + 3] << 24) >>> 0;
function compressedZipEntries(bytes) {
  let footer = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) if (u32(bytes, offset) === 0x06054b50) { footer = offset; break; }
  assert.notEqual(footer, -1, "ZIP footer");
  const entries = new Map(); let offset = u32(bytes, footer + 16);
  for (let index = 0; index < u16(bytes, footer + 10); index++) {
    assert.equal(u32(bytes, offset), 0x02014b50, "central directory entry");
    const compressedSize = u32(bytes, offset + 20), nameLength = u16(bytes, offset + 28), extraLength = u16(bytes, offset + 30), commentLength = u16(bytes, offset + 32), local = u32(bytes, offset + 42);
    const name = Buffer.from(bytes.slice(offset + 46, offset + 46 + nameLength)).toString("utf8"), localNameLength = u16(bytes, local + 26), localExtraLength = u16(bytes, local + 28), start = local + 30 + localNameLength + localExtraLength;
    entries.set(name, bytes.slice(start, start + compressedSize)); offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

test("financial corrections recalculate profit from Unit COGS only and compose across versions", () => {
  const first = prepareSalesOrderCorrection(workbook(), correction("postage", 5));
  assert.equal(sales(first.bytes)[6], 22);
  const second = prepareSalesOrderCorrection(first.bytes, correction("cogs", 15));
  assert.equal(sales(second.bytes)[6], 19);
});
test("missing required values keep profit incomplete while explicit zero remains valid", () => {
  const missing = prepareSalesOrderCorrection(workbook(""), correction("postage", 5));
  assert.equal(sales(missing.bytes)[6], "");
  const zero = prepareSalesOrderCorrection(workbook(0), correction("postage", 3));
  assert.equal(sales(zero.bytes)[6], 25);
});
test("correction writer preserves hash-bound version safeguards in the existing route", () => {
  const route = readFileSync(resolve(root, "../../app/api/sales-workbook/corrections/route.ts"), "utf8");
  assert.match(route, /workbook_hash_before/); assert.match(route, /Workbook hash verification failed/); assert.match(route, /already been applied/);
});
test("financial validation rejects a blank value, preserves decimals, and permits intentional zero", () => {
  assert.throws(() => validateSalesOrderCorrection({ orderNumber: "1251", type: "cogs", value: "", reason: "verified" }), /require a value/);
  assert.equal(validateSalesOrderCorrection({ orderNumber: "1251", type: "cogs", value: "34.82", reason: "verified" }).value, 34.82);
  assert.equal(validateSalesOrderCorrection({ orderNumber: "1251", type: "cogs", value: "0", reason: "verified" }).value, 0);
});
test("single-cell OOXML patches remain bounded and preserve non-Sales package parts", () => {
  const source = workbook(); let current = source; const sizes = [];
  for (const value of [34.82, 0, 12.5]) { current = prepareSalesOrderCorrection(current, correction("cogs", value)).bytes; sizes.push(current.byteLength); }
  assert.ok(Math.max(...sizes) < source.byteLength * 1.2, `unexpected sizes: ${[source.byteLength, ...sizes].join(", ")}`);
  const contents = bytes => { const archive = CFB.read(bytes, { type: "buffer" }); return new Map(archive.FullPaths.map((path, index) => [path.replace(/^Root Entry\//, ""), archive.FileIndex[index].content]).filter(([, content]) => content !== undefined).map(([path, content]) => [path, Buffer.from(content)])); };
  const before = contents(source), after = contents(current);
  for (const path of ["xl/styles.xml", "xl/worksheets/sheet2.xml", "xl/worksheets/sheet3.xml"]) assert.deepEqual(after.get(path), before.get(path), path);
  const compressedBefore = compressedZipEntries(source), compressedAfter = compressedZipEntries(current);
  assert.equal(compressedAfter.size, compressedBefore.size, "no ZIP members added or removed");
  for (const [path, compressed] of compressedBefore) if (path !== "xl/worksheets/sheet1.xml") assert.deepEqual(compressedAfter.get(path), compressed, `${path} compressed bytes`);
});
