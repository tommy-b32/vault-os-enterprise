import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("../lib/purchase-orders/PurchaseOrderRepository.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function("require", "exports", output)(
  (name) => ({
    "server-only": {},
    "@/lib/supabase-admin": {},
    "@/lib/brain/CapitalEngine": {},
    "@/lib/brain/PurchaseIntelligenceEngine": {},
    "@/lib/catalogue": {},
    "@/lib/inventory/InventorySyncRepository": {},
    "@/lib/supplier-style-pack-composition": {},
    "@/lib/purchase-orders/SupplierOrderPreparation": {},
  }[name] ?? require(name)),
  exports,
);
const { validateFixedPackAllocationConservation } = exports;

const line = (over = {}) => ({
  id: "line-1", recommended_packs: 1, recommended_units: 5, units_per_pack: 5,
  source_recommendation_type: "fixed_pack_purchase_recommendation", ...over,
});
const allocations = (packs = 1, composition = [1, 1, 1, 1, 1]) => composition.map((units_per_pack, index) => ({
  purchase_order_line_id: "line-1", normalized_size: ["S", "M", "L", "XL", "2XL", "3XL"][index],
  units_per_pack, ordered_units: packs * units_per_pack,
}));
const invalid = (lines, rows) => assert.throws(
  () => validateFixedPackAllocationConservation(lines, rows),
  /FIXED_PACK_ALLOCATION_INVALID/,
);

test("conserves standard and explicit fixed-pack compositions", () => {
  validateFixedPackAllocationConservation([line()], allocations());
  validateFixedPackAllocationConservation([line({ recommended_packs: 2, recommended_units: 10 })], allocations(2));
  validateFixedPackAllocationConservation([line({ recommended_units: 6, units_per_pack: 6 })], allocations(1, [1, 1, 1, 1, 1, 1]));
  validateFixedPackAllocationConservation([line({ recommended_units: 6, units_per_pack: 6 })], allocations(1, [2, 1, 3]));
});

test("rejects missing allocations separately", () => {
  assert.throws(() => validateFixedPackAllocationConservation([line()], []), /FIXED_PACK_ALLOCATION_MISSING/);
});

test("fails closed on parent, child, and aggregate conservation defects", () => {
  invalid([line({ recommended_units: 4 })], allocations());
  invalid([line()], [{ ...allocations()[0], ordered_units: 2 }, ...allocations().slice(1)]);
  invalid([line()], allocations(1, [1, 1, 1, 1]));
  invalid([line()], [{ ...allocations()[0], ordered_units: 2 }, ...allocations().slice(1)]);
  invalid([line({ recommended_packs: 0 })], allocations());
  invalid([line({ recommended_packs: 1.5 })], allocations());
});

test("fails closed on malformed persisted allocation data and unknown lines", () => {
  for (const row of [
    { ...allocations()[0], units_per_pack: 0 },
    { ...allocations()[0], units_per_pack: -1 },
    { ...allocations()[0], normalized_size: "  " },
    { ...allocations()[0], ordered_units: Number.NaN },
  ]) invalid([line()], [row, ...allocations().slice(1)]);
  invalid([line()], [{ ...allocations()[0], purchase_order_line_id: "not-loaded" }, ...allocations().slice(1)]);
});

test("fixed-pack validation runs before unsupported approval and never enters legacy PI", () => {
  const branch = source.indexOf('if (sourceFamily === "fixed_pack")');
  const linesQuery = source.indexOf('.select("id, supplier_id, style_id, recommended_packs, recommended_units, units_per_pack, pack_cost_gbp, line_cost_gbp, source_recommendation_type, source_snapshot")', branch);
  const allocationQuery = source.indexOf('vault_purchase_order_line_size_allocations', linesQuery);
  const validation = source.indexOf("validateFixedPackAllocationConservation(", allocationQuery);
  const unsupported = source.indexOf('throw new Error("FIXED_PACK_APPROVAL_NOT_IMPLEMENTED")', validation);
  const legacyEvaluation = source.indexOf("PurchaseIntelligenceEngine.evaluate(", branch);
  assert.ok(linesQuery > branch); assert.ok(allocationQuery > linesQuery); assert.ok(validation > allocationQuery);
  assert.ok(unsupported > validation); assert.ok(legacyEvaluation > unsupported);
});
