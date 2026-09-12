import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("../lib/purchase-orders/PurchaseOrderRepository.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
new Function("require", "exports", output)((name) => ({
  "server-only": {}, "@/lib/supabase-admin": {}, "@/lib/brain/CapitalEngine": {},
  "@/lib/brain/PurchaseIntelligenceEngine": {}, "@/lib/catalogue": {},
  "@/lib/inventory/InventorySyncRepository": {}, "@/lib/supplier-style-pack-composition": {},
  "@/lib/purchase-orders/SupplierOrderPreparation": {},
}[name] ?? require(name)), exports);
const { validateFixedPackCurrentPackContract } = exports;

const line = (over = {}) => ({ id: "line-1", supplier_id: "supplier-1", style_id: "style-1", units_per_pack: 5, source_recommendation_type: "fixed_pack_purchase_recommendation", source_snapshot: { pack_definition_id: "definition-1" }, ...over });
const allocations = (composition = [1, 1, 1, 1, 1]) => composition.map((units_per_pack, index) => ({ purchase_order_line_id: "line-1", normalized_size: ["S", "M", "L", "XL", "2XL", "3XL"][index], units_per_pack, ordered_units: units_per_pack }));
const contracts = (composition = [1, 1, 1, 1, 1], over = {}) => composition.map((units_per_pack, index) => ({ id: "definition-1", supplier_id: "supplier-1", style_id: "style-1", normalized_size: ["S", "M", "L", "XL", "2XL", "3XL"][index], units_per_pack, declared_units_per_pack: composition.reduce((sum, value) => sum + value, 0), composition_units_per_pack: composition.reduce((sum, value) => sum + value, 0), composition_complete: true, composition_valid: true, commercial_pack_consistent: true, active: true, ...over }));
const changed = (lines, rows, current) => assert.throws(() => validateFixedPackCurrentPackContract(lines, rows, current), /PACK_CONTRACT_CHANGED/);

test("matches standard, Exclusive, non-uniform, and reordered explicit contracts", () => {
  validateFixedPackCurrentPackContract([line()], allocations(), contracts());
  validateFixedPackCurrentPackContract([line({ units_per_pack: 6 })], allocations([1, 1, 1, 1, 1, 1]), contracts([1, 1, 1, 1, 1, 1]));
  validateFixedPackCurrentPackContract([line({ units_per_pack: 6 })], allocations([2, 1, 3]), contracts([2, 1, 3]).reverse());
});

test("rejects absent, ambiguous, inactive, invalid, and incomplete contracts", () => {
  changed([line()], allocations(), []);
  changed([line()], allocations(), [...contracts(), ...contracts().map((row) => ({ ...row, id: "definition-2" }))]);
  changed([line()], allocations(), contracts([1, 1, 1, 1, 1], { active: false }));
  changed([line()], allocations(), contracts([1, 1, 1, 1, 1], { composition_valid: false }));
  changed([line()], allocations(), contracts([1, 1, 1, 1, 1], { composition_complete: false }));
});

test("rejects changed composition and exact ownership", () => {
  changed([line()], allocations(), contracts([1, 1, 1, 1, 1, 1]));
  changed([line()], allocations(), contracts([1, 1, 1, 1]));
  changed([line()], allocations(), contracts([2, 1, 1, 1, 1]));
  changed([line()], allocations(), contracts([1, 1, 1, 1, 1], { declared_units_per_pack: 6, composition_units_per_pack: 6 }));
  changed([line()], allocations(), contracts([1, 1, 1, 1, 1], { supplier_id: "supplier-2" }));
  changed([line()], allocations(), contracts([1, 1, 1, 1, 1], { style_id: "style-2" }));
});

test("validates recommendation and manual fixed-pack lines with no demand input", () => {
  validateFixedPackCurrentPackContract([line()], allocations(), contracts());
  validateFixedPackCurrentPackContract([line({ source_recommendation_type: "manual_fixed_pack_purchase" })], allocations(), contracts());
});

test("fixed-pack contract validation precedes unsupported approval and legacy PI", () => {
  const branch = source.indexOf('if (sourceFamily === "fixed_pack")');
  const conservation = source.indexOf("validateFixedPackAllocationConservation(", branch);
  const contract = source.indexOf("validateFixedPackCurrentPackContract(", conservation + 1);
  const unsupported = source.indexOf('throw new Error("FIXED_PACK_APPROVAL_NOT_IMPLEMENTED")', contract);
  const legacy = source.indexOf("PurchaseIntelligenceEngine.evaluate(", branch);
  assert.ok(contract > conservation); assert.ok(unsupported > contract); assert.ok(legacy > unsupported);
  assert.match(source, /loadSupplierStylePackCompositionIntelligence/);
});
