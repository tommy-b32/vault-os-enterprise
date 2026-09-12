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
  "server-only": {}, "@/lib/supabase-admin": {}, "@/lib/brain/CapitalEngine": {}, "@/lib/brain/PurchaseIntelligenceEngine": {},
  "@/lib/catalogue": {}, "@/lib/inventory/InventorySyncRepository": {}, "@/lib/supplier-style-pack-composition": {},
  "@/lib/purchase-orders/SupplierOrderPreparation": {},
}[name] ?? require(name)), exports);
const { validateFixedPackCurrentCommercialPolicy, validateFixedPackBasketCommercialPolicy } = exports;

const line = (over = {}) => ({ id: "line-1", supplier_id: "supplier-1", style_id: "style-1", recommended_packs: 2, recommended_units: 10, units_per_pack: 5, pack_cost_gbp: 12.5, line_cost_gbp: 25, source_recommendation_type: "fixed_pack_purchase_recommendation", ...over });
const product = (over = {}) => ({ style_id: "style-1", supplier_id: "supplier-1", supplier_moq_packs: 2, restock_enabled: true, inventory_strategy: "continue", commercial_cost: { landed_cost_per_pack_gbp: 12.5 }, ...over });
const order = (over = {}) => ({ supplier_id: "supplier-1", currency: "GBP", total_packs: 2, estimated_total_gbp: 25, ...over });
const supplier = (over = {}) => ({ id: "supplier-1", currency_code: "GBP", minimum_order_value: 25, ...over });
const rule = (over = {}) => ({ supplier_id: "supplier-1", minimum_order_packs: 2, ...over });
const fails = (code, fn) => assert.throws(fn, new RegExp(code));

test("accepts recommendation, manual, exact costs, and valid basket policy", () => {
  validateFixedPackCurrentCommercialPolicy([line()], [product()], "supplier-1");
  validateFixedPackCurrentCommercialPolicy([line({ source_recommendation_type: "manual_fixed_pack_purchase" })], [product()], "supplier-1");
  validateFixedPackBasketCommercialPolicy(order(), [line()], supplier(), rule());
  validateFixedPackCurrentCommercialPolicy([line({ recommended_packs: 3, line_cost_gbp: 37.5 })], [product({ supplier_moq_packs: 2 })], "supplier-1");
  validateFixedPackBasketCommercialPolicy(order({ total_packs: 3, estimated_total_gbp: 37.5 }), [line({ recommended_packs: 3, line_cost_gbp: 37.5 })], supplier({ minimum_order_value: null }), rule({ minimum_order_packs: 2 }));
});

test("fails closed on changed or malformed commercial facts, MOQ, restock, and supplier mismatch", () => {
  fails("COMMERCIAL_COST_CHANGED", () => validateFixedPackCurrentCommercialPolicy([line()], [product({ commercial_cost: { landed_cost_per_pack_gbp: 13 } })], "supplier-1"));
  fails("COMMERCIAL_COST_CHANGED", () => validateFixedPackCurrentCommercialPolicy([line({ line_cost_gbp: 24 })], [product()], "supplier-1"));
  fails("COMMERCIAL_COST_CHANGED", () => validateFixedPackCurrentCommercialPolicy([line()], [product({ commercial_cost: { landed_cost_per_pack_gbp: 0 } })], "supplier-1"));
  fails("PRODUCT_MOQ_NOT_MET", () => validateFixedPackCurrentCommercialPolicy([line()], [product({ supplier_moq_packs: 3 })], "supplier-1"));
  fails("RESTOCK_DISABLED", () => validateFixedPackCurrentCommercialPolicy([line()], [product({ restock_enabled: false })], "supplier-1"));
  fails("RESTOCK_DISABLED", () => validateFixedPackCurrentCommercialPolicy([line()], [product({ inventory_strategy: "do_not_restock" })], "supplier-1"));
  fails("SOURCE_PROVENANCE_INVALID", () => validateFixedPackCurrentCommercialPolicy([line({ supplier_id: "supplier-2" })], [product()], "supplier-1"));
});

test("enforces GBP, supplier basket thresholds, and actual authoritative headers", () => {
  validateFixedPackBasketCommercialPolicy(order(), [line()], supplier(), rule());
  validateFixedPackBasketCommercialPolicy(order({ total_packs: 3, estimated_total_gbp: 37.5 }), [line({ recommended_packs: 3, line_cost_gbp: 37.5 })], supplier({ minimum_order_value: 20 }), rule({ minimum_order_packs: 2 }));
  fails("SUPPLIER_PACK_MOQ_NOT_MET", () => validateFixedPackBasketCommercialPolicy(order(), [line()], supplier(), rule({ minimum_order_packs: 3 })));
  fails("SUPPLIER_MIN_VALUE_NOT_MET", () => validateFixedPackBasketCommercialPolicy(order(), [line()], supplier({ minimum_order_value: 26 }), rule()));
  fails("CURRENCY_NOT_GBP", () => validateFixedPackBasketCommercialPolicy(order({ currency: "EUR" }), [line()], supplier(), rule()));
  fails("CURRENCY_NOT_GBP", () => validateFixedPackBasketCommercialPolicy(order(), [line()], supplier({ currency_code: "EUR" }), rule()));
  fails("HEADER_TOTAL_MISMATCH", () => validateFixedPackBasketCommercialPolicy(order({ total_packs: 3 }), [line()], supplier(), rule()));
  fails("HEADER_TOTAL_MISMATCH", () => validateFixedPackBasketCommercialPolicy(order({ estimated_total_gbp: 24 }), [line()], supplier(), rule()));
});

test("commercial policy is after identity and before unsupported approval without demand checks", () => {
  const branch = source.indexOf('if (sourceFamily === "fixed_pack")');
  const identity = source.indexOf("validateFixedPackCurrentVariantIdentity(", branch);
  const commercial = source.indexOf("validateFixedPackCurrentCommercialPolicy(", identity + 1);
  const basket = source.indexOf("validateFixedPackBasketCommercialPolicy(", commercial + 1);
  const unsupported = source.indexOf('throw new Error("FIXED_PACK_APPROVAL_NOT_IMPLEMENTED")', basket);
  const legacy = source.indexOf("PurchaseIntelligenceEngine.evaluate(", branch);
  assert.ok(commercial > identity); assert.ok(basket > commercial); assert.ok(unsupported > basket); assert.ok(legacy > unsupported);
});
