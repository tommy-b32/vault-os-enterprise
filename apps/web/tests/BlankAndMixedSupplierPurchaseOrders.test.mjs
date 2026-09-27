import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("./", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("blank supplier drafts are server-created and fail closed for inactive suppliers", async () => {
  const [migration, repository, actions, panel] = await Promise.all([
    read("../../../supabase/migrations/20261052000000_blank_and_mixed_supplier_purchase_orders.sql"),
    read("../lib/purchase-orders/PurchaseOrderRepository.ts"),
    read("../app/purchase-orders/actions.ts"),
    read("../components/purchase-orders/BlankSupplierPurchaseOrderPanel.tsx"),
  ]);
  assert.match(migration, /create_blank_supplier_purchase_order/);
  assert.match(migration, /vault_suppliers s where s\.id=target_supplier_id and s\.is_active/);
  assert.match(migration, /values\(target_supplier_id,'draft','GBP',0,0,false/);
  assert.match(repository, /createBlankSupplierPurchaseOrder/);
  assert.match(actions, /createBlankSupplierPurchaseOrderAction/);
  assert.match(panel, /Create blank supplier PO/);
});

test("mixed drafts preserve governed server-side fixed-pack and pending-catalogue paths", async () => {
  const [migration, manual, candidates, detail] = await Promise.all([
    read("../../../supabase/migrations/20261052000000_blank_and_mixed_supplier_purchase_orders.sql"),
    read("../lib/purchase-orders/ManualFixedPackDraftRepository.ts"),
    read("../lib/purchase-orders/ManualFixedPackCandidates.ts"),
    read("../app/purchase-orders/[id]/page.tsx"),
  ]);
  assert.match(migration, /pending_catalogue_purchase''\s*,''fixed_pack_purchase_recommendation''\s*,''manual_fixed_pack_purchase/);
  assert.match(manual, /"pending_catalogue_purchase"/);
  assert.match(candidates, /"pending_catalogue_purchase"/);
  assert.match(detail, /mixedIntakeCompatible/);
  assert.match(detail, /PendingCatalogueAddPanel/);
});

test("mixed approval reconciles durable saved lines and retains Stage 4B.1 ordering", async () => {
  const [migration, repository] = await Promise.all([
    read("../../../supabase/migrations/20261052000000_blank_and_mixed_supplier_purchase_orders.sql"),
    read("../lib/purchase-orders/PurchaseOrderRepository.ts"),
  ]);
  assert.match(migration, /approve_mixed_supplier_purchase_order/);
  assert.match(migration, /HEADER_TOTAL_MISMATCH/);
  assert.match(migration, /MIXED_PO_ALLOCATION_INVALID/);
  assert.match(migration, /PENDING_CATALOGUE_PRODUCT_INVALID/);
  assert.match(migration, /PENDING_CATALOGUE_ALLOCATION_INVALID/);
  assert.match(repository, /sourceFamily === "mixed"/);
  assert.match(repository, /mark_vault_purchase_order_ordered/);
});

test("canonical styles cannot duplicate in a mixed draft", async () => {
  const [manualSql, manualRepository] = await Promise.all([
    read("../../../supabase/migrations/20260916000000_manual_fixed_pack_add_to_draft.sql"),
    read("../lib/purchase-orders/ManualFixedPackDraftRepository.ts"),
  ]);
  assert.match(manualSql, /Manual fixed-pack style already exists in draft/);
  assert.match(manualRepository, /style_already_in_draft/);
});
