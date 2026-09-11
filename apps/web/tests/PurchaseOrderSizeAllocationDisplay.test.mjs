import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("../app/purchase-orders/[id]/page.tsx", import.meta.url), "utf8");
const repositorySource = await readFile(new URL("../lib/purchase-orders/PurchaseOrderRepository.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const exports = {};
new Function("require", "exports", output)((name) => ({
  "next/link": () => null,
  "next/navigation": { notFound() {} },
  "@/components/layout/VaultAppShell": () => null,
  "@/components/purchase-orders/PurchaseOrderApprovalButton": { PurchaseOrderApprovalButton: () => null },
  "@/components/purchase-orders/PurchaseOrderCancellation": { PurchaseOrderCancellation: () => null },
  "@/components/purchase-orders/SupplierOrderPreparation": { SupplierOrderPreparation: () => null },
  "@/components/purchase-orders/PurchaseOrderPayment": { PurchaseOrderPayment: () => null },
  "@/components/purchase-orders/PurchaseOrderReceiving": { PurchaseOrderReceiving: () => null },
  "@/components/purchase-orders/PurchaseOrderShipping": { PurchaseOrderShipping: () => null },
  "@/components/purchase-orders/ManualFixedPackAddPanel": { ManualFixedPackAddPanel: () => null },
  "@/components/purchase-orders/PurchaseOrderProductImage": { PurchaseOrderProductImage: () => null },
  "@/lib/auth/operators": { requireAuthenticatedOperator: async () => ({}) },
  "@/lib/purchase-orders/PurchaseOrderRepository": { getPurchaseOrder: async () => null },
  "@/lib/purchase-orders/ManualFixedPackCandidates": { loadManualFixedPackCandidates: async () => ({ status: "incompatible", reason: "po_not_found" }) },
}[name] ?? require(name)), exports);

const fixedLine = (allocations) => ({ source_recommendation_type: "fixed_pack_purchase_recommendation", vault_purchase_order_line_size_allocations: allocations });
const allocation = (normalized_size, ordered_units) => ({ normalized_size, ordered_units });

test("displays the persisted ordered quantities in deterministic apparel order", () => {
  assert.equal(exports.savedSizeAllocationDisplay(fixedLine([allocation("XL", 1), allocation("M", 1), allocation("2XL", 1), allocation("S", 1), allocation("L", 1)])), "S ×1 · M ×1 · L ×1 · XL ×1 · 2XL ×1");
  assert.equal(exports.savedSizeAllocationDisplay(fixedLine([allocation("S", 2), allocation("M", 2), allocation("L", 2), allocation("XL", 2), allocation("2XL", 2)])), "S ×2 · M ×2 · L ×2 · XL ×2 · 2XL ×2");
  assert.equal(exports.savedSizeAllocationDisplay(fixedLine([allocation("3XL", 1), allocation("S", 1)])), "S ×1 · 3XL ×1");
});

test("keeps legacy lines unchanged and retains unknown persisted sizes", () => {
  assert.equal(exports.savedSizeAllocationDisplay(fixedLine([])), null);
  assert.equal(exports.savedSizeAllocationDisplay({ source_recommendation_type: "advisor", vault_purchase_order_line_size_allocations: [allocation("S", 1)] }), null);
  assert.equal(exports.savedSizeAllocationDisplay(fixedLine([allocation("One Size", 3), allocation("XS", 1)])), "One Size ×3 · XS ×1");
});

test("fails closed for malformed persisted allocation rows", () => {
  for (const allocations of [[allocation(null, 1)], [allocation("S", 0)], [allocation("S", 1), allocation("S", 1)], [allocation("M", 1.5)]]) {
    assert.equal(exports.savedSizeAllocationDisplay(fixedLine(allocations)), "Size allocation unavailable");
  }
});

test("detail loader uses only the persisted allocation relation", () => {
  assert.match(repositorySource, /vault_purchase_order_line_size_allocations \(/);
  assert.match(source, /ordered_units/);
  assert.doesNotMatch(source, /loadFixedPackPurchaseRecommendations|packDefinition|addFixedPackRecommendationToDraft/);
});
