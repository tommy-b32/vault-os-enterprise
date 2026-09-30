import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const baseMigration = await readFile(new URL("../../supabase/migrations/20260823000000_purchase_order_receiving.sql", root), "utf8");
const allocationMigration = await readFile(new URL("../../supabase/migrations/20260824000000_purchase_order_receipt_variant_allocations.sql", root), "utf8");
const fixedPackExactReceivingMigration = await readFile(new URL("../../supabase/migrations/20260920000000_fixed_pack_exact_size_receiving.sql", root), "utf8");
const physicalAccountingMigration = await readFile(new URL("../../supabase/migrations/20260829000000_purchase_order_receiving_physical_accounting.sql", root), "utf8");
const semanticReceivingMigration = await readFile(new URL("../../supabase/migrations/20260911000000_semantic_purchase_order_receiving.sql", root), "utf8");
const migration = [baseMigration, allocationMigration, physicalAccountingMigration, semanticReceivingMigration].join("\n");
const repository = await readFile(new URL("lib/purchase-orders/PurchaseOrderRepository.ts", root), "utf8");
const actions = await readFile(new URL("app/purchase-orders/actions.ts", root), "utf8");
const page = await readFile(new URL("app/purchase-orders/[id]/page.tsx", root), "utf8");
const component = await readFile(new URL("components/purchase-orders/PurchaseOrderReceiving.tsx", root), "utf8");
const receivingFunction = semanticReceivingMigration.slice(
  semanticReceivingMigration.indexOf("create or replace function public.record_vault_purchase_order_receipt"),
  semanticReceivingMigration.indexOf("revoke all on function public.record_vault_purchase_order_receipt"),
);

function applyReceipt(ordered, previousSellable, previousNonSellable, sellable, nonSellable) {
  const previousPhysical = previousSellable + previousNonSellable;
  const proposedPhysical = sellable + nonSellable;
  if (![sellable, nonSellable].every(Number.isInteger) || proposedPhysical <= 0) {
    throw new Error("invalid receipt");
  }
  if (previousPhysical + proposedPhysical > ordered) throw new Error("over receipt");
  const physicallyAccounted = previousPhysical + proposedPhysical;
  return { physicallyAccounted, remaining: ordered - physicallyAccounted };
}

function fixedPackSizeRows(packs) {
  const allocations = ["S", "M", "L", "XL", "2XL"].map((normalizedSize) => ({ normalizedSize, orderedUnits: packs }));
  return { allocations, total: allocations.reduce((sum, allocation) => sum + allocation.orderedUnits, 0) };
}

test("canonical fixed-pack receiving uses persisted exact size allocations, not the line total per size", () => {
  const twoPack = fixedPackSizeRows(2);
  assert.deepEqual(twoPack.allocations.map((allocation) => allocation.orderedUnits), [2, 2, 2, 2, 2]);
  assert.equal(twoPack.total, 10);
  assert.notDeepEqual(twoPack.allocations.map((allocation) => allocation.orderedUnits), [10, 10, 10, 10, 10]);

  const onePack = fixedPackSizeRows(1);
  assert.deepEqual(onePack.allocations.map((allocation) => allocation.orderedUnits), [1, 1, 1, 1, 1]);
  assert.equal(onePack.total, 5);

  assert.match(page, /canonicalAllocations:[\s\S]*orderedUnits: allocation\.ordered_units/);
  assert.match(component, /savedAllocation\?\.orderedUnits/);
  assert.match(component, /max=\{remainingForSize\}/);
});

test("canonical fixed-pack sellable and non-sellable quantities cannot exceed a saved size allocation", () => {
  assert.deepEqual(applyReceipt(2, 0, 0, 1, 1), { physicallyAccounted: 2, remaining: 0 });
  assert.throws(() => applyReceipt(2, 0, 0, 2, 1), /over receipt/);
  assert.throws(() => applyReceipt(2, 1, 0, 1, 1), /over receipt/);
  assert.match(component, /name={`size_allocation:\$\{line\.id\}:\$\{savedAllocation\?\.id \?\? ""\}`}/);
  assert.match(component, /name={`size_non_sellable:\$\{line\.id\}:\$\{savedAllocation\?\.id \?\? ""\}`}/);
  assert.match(actions, /key\.startsWith\("size_allocation:"\)/);
  assert.match(actions, /purchaseOrderLineSizeAllocationId: allocationId/);
  assert.match(fixedPackExactReceivingMigration, /prior_physical\+sellable\+nonsellable>saved\.ordered_units/);
});

test("partial and final receipts retain cumulative ordered, received and remaining quantities", () => {
  assert.deepEqual(applyReceipt(10, 0, 0, 6, 2), { physicallyAccounted: 8, remaining: 2 });
  assert.deepEqual(applyReceipt(10, 6, 2, 2, 0), { physicallyAccounted: 10, remaining: 0 });
  assert.throws(() => applyReceipt(10, 6, 2, 3, 0), /over receipt/);
  assert.match(receivingFunction, /already_physically_accounted \+ target_quantity \+ target_non_sellable_quantity > ordered_quantity/);
  assert.match(receivingFunction, /bool_and\(received\.physically_accounted_quantity = received\.ordered_quantity\)/);
});

test("eight sellable plus two damaged units fully account for a ten-unit order", () => {
  assert.deepEqual(applyReceipt(10, 0, 0, 8, 2), {
    physicallyAccounted: 10,
    remaining: 0,
  });
  assert.throws(() => applyReceipt(10, 8, 2, 2, 0), /over receipt/);
});

test("six sellable plus two damaged units leave two physically expected", () => {
  assert.deepEqual(applyReceipt(10, 0, 0, 6, 2), {
    physicallyAccounted: 8,
    remaining: 2,
  });
});

test("historical sellable and non-sellable evidence both prevent physical over-receipt", () => {
  assert.match(receivingFunction, /sum\(\s*receipt_line\.quantity_received \+ receipt_line\.non_sellable_quantity\s*\)/);
  assert.match(receivingFunction, /Physical receipt exceeds the ordered quantity/);
  assert.throws(() => applyReceipt(10, 5, 3, 2, 1), /over receipt/);
});

test("PO completion requires every line to be fully physically accounted", () => {
  assert.match(receivingFunction, /bool_and\(received\.physically_accounted_quantity = received\.ordered_quantity\)/);
  assert.match(receivingFunction, /set status = 'received', received_at = next_received_at/);
});

test("only persisted PO lines and eligible fulfillment states can be received", () => {
  assert.match(receivingFunction, /status not in \('ordered', 'part_paid', 'paid', 'shipped'\)/);
  assert.match(receivingFunction, /line\.id = target_line_id and line\.purchase_order_id = purchase_order\.id/);
  assert.doesNotMatch(receivingFunction, /'draft'|'approved'|'cancelled'/);
  assert.match(receivingFunction, /set status = 'received', received_at = next_received_at/);
});

test("receipt evidence is atomic, append-only and retry-safe", () => {
  assert.match(migration, /create table if not exists public\.vault_purchase_order_receipts/);
  assert.match(migration, /create table if not exists public\.vault_purchase_order_receipt_lines/);
  assert.match(migration, /unique \(purchase_order_id, idempotency_key\)/);
  assert.match(migration, /Purchase-order receipt evidence is append-only/);
  assert.match(migration, /before update or delete on public\.vault_purchase_order_receipts/);
  assert.match(migration, /before update or delete on public\.vault_purchase_order_receipt_lines/);
  assert.match(receivingFunction, /if found then[\s\S]*purchase_order\.status = 'received', false/);
  assert.match(receivingFunction, /insert into public\.vault_purchase_order_receipts[\s\S]*insert into public\.vault_purchase_order_receipt_lines/);
});

test("receiving records true dates, operator evidence and discrepancies", () => {
  assert.match(migration, /received_date date not null/);
  assert.match(migration, /created_by_operator_id uuid not null references public\.vault_operators/);
  assert.match(migration, /discrepancy_note text null/);
  assert.match(actions, /requireAuthenticatedOperator\(\)[\s\S]*recordPurchaseOrderReceipt/);
  assert.match(component, /Count only accepted sellable units/);
});

test("receiving never mutates cash, payments, Shopify inventory, or PO lines", () => {
  assert.doesNotMatch(receivingFunction, /vault_cash_transactions|vault_purchase_order_payments|vault_inventory_levels/);
  assert.doesNotMatch(receivingFunction, /update public\.vault_purchase_order_lines/);
  assert.match(component, /does not alter Shopify inventory automatically/);
  assert.doesNotMatch(actions + repository + component, /shopify-inventory|inventoryAdjust|cash_transaction.*insert/i);
});

test("received unpaid liability remains committed and payable without losing fulfillment truth", () => {
  assert.match(migration, /status in \('approved', 'ordered', 'part_paid', 'shipped', 'received'\)/);
  assert.match(migration, /purchase_order\.status not in \('ordered', 'part_paid', 'shipped', 'received'\)/);
  assert.match(migration, /when purchase_order\.status in \('shipped', 'received'\) then purchase_order\.status/);
  assert.doesNotMatch(receivingFunction, /paid_amount_gbp\s*=|vault_purchase_order_payments/);
});

test("receiving UI exposes totals, history, line inputs, receipt date and refresh", () => {
  assert.match(component, /Ordered[\s\S]*Physically accounted[\s\S]*Sellable received[\s\S]*Non-sellable[\s\S]*Remaining expected/);
  assert.match(component, /line\.orderedQuantity - physicallyAccounted/);
  assert.match(component, /line\.receivedQuantity \+ line\.nonSellableQuantity >= line\.orderedQuantity/);
  assert.match(component, /Previous receipts/);
  assert.match(component, /name={`size_allocation:\$\{line\.id\}:\$\{savedAllocation\?\.id \?\? ""\}`}/);
  assert.match(component, /name="received_date"/);
  assert.match(component, /router\.refresh\(\)/);
  assert.match(page, /draft\.received_at/);
});

test("receiving remains downstream of persisted orders and imports no intelligence engine", () => {
  assert.match(repository, /\.rpc\(\s*"record_vault_purchase_order_receipt"/);
  assert.doesNotMatch(actions + component + migration, /DemandIntelligenceEngine|SupplierBasketIntelligenceEngine|PurchaseIntelligenceEngine/);
  assert.doesNotMatch(receivingFunction, /recommended_packs\s*=|recommended_units\s*=/);
});
