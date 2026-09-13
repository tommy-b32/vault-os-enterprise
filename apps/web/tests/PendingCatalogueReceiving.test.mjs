import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const receiving=await readFile(new URL("../components/purchase-orders/PurchaseOrderReceiving.tsx",import.meta.url),"utf8");
const actions=await readFile(new URL("../app/purchase-orders/actions.ts",import.meta.url),"utf8");
const repository=await readFile(new URL("../lib/purchase-orders/PurchaseOrderRepository.ts",import.meta.url),"utf8");
test("pending receiving uses immutable saved allocations with physical accounting and no Shopify identity",()=>{assert.match(receiving,/pendingAllocations/);assert.match(receiving,/pending_allocation:\$\{line\.id\}:\$\{allocation\.id\}/);assert.match(receiving,/supplierSizeLabel/);assert.match(receiving,/normalizedSize/);assert.match(receiving,/orderedUnits - allocation\.sellableReceived - allocation\.nonSellableReceived/);assert.match(actions,/purchaseOrderLineSizeAllocationId/);assert.match(repository,/purchase_order_line_size_allocation_id/);assert.doesNotMatch(receiving,/pending_allocation:[\s\S]{0,120}sourceVariantId/);});
test("pending receipt action rejects zero physical totals and preserves Shopify-backed allocation parsing",()=>{assert.match(actions,/quantityReceived \+ nonSellable <= 0/);assert.match(actions,/key\.startsWith\("allocation:"\)/);assert.match(actions,/variantId, quantityReceived/);assert.match(repository,/purchase_order_line_size_allocation_id: allocation\.purchaseOrderLineSizeAllocationId/);});
