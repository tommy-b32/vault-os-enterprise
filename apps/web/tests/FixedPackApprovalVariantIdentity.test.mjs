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
const { validateFixedPackCurrentVariantIdentity } = exports;

const allocations = (count = 5, over = {}) => Array.from({ length: count }, (_, index) => ({
  purchase_order_line_id: "line-1", variant_id: `variant-${index}`, parent_product_id: "product-1",
  model_design: "Blue", normalized_size: ["S", "M", "L", "XL", "2XL", "3XL"][index],
  shopify_variant_id_snapshot: `shopify-variant-${index}`,
  shopify_inventory_item_id_snapshot: `shopify-inventory-${index}`,
  units_per_pack: 1, ordered_units: 1, ...over,
}));
const variants = (rows = allocations(), over = {}) => rows.map((allocation) => ({
  id: allocation.variant_id, product_id: allocation.parent_product_id, model_design: allocation.model_design,
  normalized_size: allocation.normalized_size, source: "shopify", source_active: true,
  identity_resolution_status: "resolved", source_variant_id: allocation.shopify_variant_id_snapshot,
  source_inventory_item_id: allocation.shopify_inventory_item_id_snapshot, ...over,
}));
const changed = (rows, current) => assert.throws(() => validateFixedPackCurrentVariantIdentity(rows, current), /VARIANT_IDENTITY_CHANGED/);

test("matches standard, Exclusive, non-uniform, and reordered canonical variants", () => {
  validateFixedPackCurrentVariantIdentity(allocations(), variants());
  validateFixedPackCurrentVariantIdentity(allocations(6), variants(allocations(6)).reverse());
  const nonUniform = allocations(3).map((row, index) => ({ ...row, units_per_pack: [2, 1, 3][index] }));
  validateFixedPackCurrentVariantIdentity(nonUniform, variants(nonUniform));
});

test("fails closed on missing, inactive, unresolved, and changed current identity", () => {
  const rows = allocations();
  changed(rows, variants(rows).slice(1));
  changed(rows, variants(rows, { source_active: false }));
  changed(rows, variants(rows, { identity_resolution_status: "unresolved" }));
  changed(rows, variants(rows, { product_id: "product-2" }));
  changed(rows, variants(rows, { model_design: "Red" }));
  changed(rows, variants(rows, { normalized_size: "3XL" }));
  changed(rows, variants(rows, { source_variant_id: "changed" }));
  changed(rows, variants(rows, { source_inventory_item_id: "changed" }));
});

test("fails closed on malformed snapshots, unknown IDs, and incomplete one-to-one coverage", () => {
  const rows = allocations();
  changed([{ ...rows[0], shopify_variant_id_snapshot: "" }, ...rows.slice(1)], variants(rows));
  changed([{ ...rows[0], shopify_inventory_item_id_snapshot: null }, ...rows.slice(1)], variants(rows));
  changed([{ ...rows[0], variant_id: "unknown" }, ...rows.slice(1)], variants(rows));
  changed(rows, [...variants(rows), { ...variants(rows)[0] }]);
});

test("ignores image metadata and applies identically to recommendation and manual sources", () => {
  const rows = allocations();
  validateFixedPackCurrentVariantIdentity(rows, variants(rows, { shopify_image_url: "changed-image" }));
  assert.match(source, /fixed_pack_purchase_recommendation/);
  assert.match(source, /manual_fixed_pack_purchase/);
});

test("variant identity validation follows contract validation before unsupported approval and legacy PI", () => {
  const branch = source.indexOf('if (sourceFamily === "fixed_pack")');
  const contract = source.indexOf("validateFixedPackCurrentPackContract(", branch);
  const identity = source.indexOf("validateFixedPackCurrentVariantIdentity(", contract + 1);
  const unsupported = source.indexOf('throw new Error("FIXED_PACK_APPROVAL_NOT_IMPLEMENTED")', identity);
  const legacy = source.indexOf("PurchaseIntelligenceEngine.evaluate(", branch);
  assert.ok(identity > contract); assert.ok(unsupported > identity); assert.ok(legacy > unsupported);
  assert.match(source, /source_active/); assert.match(source, /identity_resolution_status/);
});
