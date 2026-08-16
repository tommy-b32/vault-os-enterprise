import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("../../supabase/migrations/20260826000000_purchase_order_shipped_transition.sql", root), "utf8");
const paymentReceivingMigration = await readFile(new URL("../../supabase/migrations/20260823000000_purchase_order_receiving.sql", root), "utf8");
const receiptAllocationMigration = await readFile(new URL("../../supabase/migrations/20260824000000_purchase_order_receipt_variant_allocations.sql", root), "utf8");
const repository = await readFile(new URL("lib/purchase-orders/PurchaseOrderRepository.ts", root), "utf8");
const actions = await readFile(new URL("app/purchase-orders/actions.ts", root), "utf8");
const component = await readFile(new URL("components/purchase-orders/PurchaseOrderShipping.tsx", root), "utf8");
const detail = await readFile(new URL("app/purchase-orders/[id]/page.tsx", root), "utf8");

const shippedFunction = migration.slice(
  migration.indexOf("create function public.mark_vault_purchase_order_shipped"),
  migration.indexOf("revoke all on function public.mark_vault_purchase_order_shipped"),
);

test("ordered, part-paid and paid purchase orders can atomically become shipped", () => {
  assert.match(shippedFunction, /for update/);
  assert.match(shippedFunction, /status not in \('ordered', 'part_paid', 'paid'\)/);
  assert.match(shippedFunction, /set status = 'shipped'/);
  assert.match(repository, /\.rpc\(\s*"mark_vault_purchase_order_shipped"/);
});

test("draft and approved purchase orders cannot become shipped", () => {
  assert.doesNotMatch(shippedFunction.match(/status not in \([^)]+\)/)?.[0] ?? "", /draft|approved/);
  assert.match(shippedFunction, /Purchase order cannot be marked shipped from status/);
  assert.match(component, /status === "ordered" \|\| status === "part_paid" \|\| status === "paid"/);
});

test("dispatch evidence is durable, operator-attributed and idempotent", () => {
  assert.match(migration, /shipped_at timestamptz/);
  assert.match(migration, /dispatch_date date/);
  assert.match(migration, /carrier text/);
  assert.match(migration, /tracking_reference text/);
  assert.match(migration, /shipped_by_operator_id uuid/);
  assert.match(shippedFunction, /status in \('shipped', 'received'\)/);
  assert.match(shippedFunction, /purchase_order\.shipped_by_operator_id, false/);
  assert.match(actions, /requireAuthenticatedOperator\(\)[\s\S]*markPurchaseOrderShipped/);
});

test("shipping preserves payment and ledger truth", () => {
  assert.doesNotMatch(shippedFunction, /paid_amount_gbp\s*=|vault_purchase_order_payments|vault_cash_transactions/);
  assert.match(paymentReceivingMigration, /status not in \('ordered', 'part_paid', 'shipped', 'received'\)/);
  assert.match(paymentReceivingMigration, /when purchase_order\.status in \('shipped', 'received'\) then purchase_order\.status/);
});

test("receiving remains compatible with shipped orders", () => {
  assert.match(receiptAllocationMigration, /status not in \('ordered', 'part_paid', 'paid', 'shipped'\)/);
  assert.match(receiptAllocationMigration, /set status = 'received', received_at = next_received_at/);
  assert.doesNotMatch(shippedFunction, /received_at\s*=|record_vault_purchase_order_receipt/);
});

test("shipping UI shows evidence, refreshes state, and has no external effects", () => {
  assert.match(component, /Actual dispatch date/);
  assert.match(component, /Carrier \(optional\)/);
  assert.match(component, /Tracking reference \(optional\)/);
  assert.match(component, /router\.refresh\(\)/);
  assert.match(detail, /draft\.shipped_at/);
  const repositoryShipping = repository.slice(
    repository.indexOf("export async function markPurchaseOrderShipped"),
    repository.indexOf("export async function recordPurchaseOrderPayment"),
  );
  const actionShipping = actions.slice(
    actions.indexOf("export async function markPurchaseOrderAsShipped"),
    actions.indexOf("export async function markPurchaseOrderAsOrdered"),
  );
  assert.doesNotMatch(migration + repositoryShipping + actionShipping + component, /shopifyGraphQL|functions\.invoke|vault_inventory_levels|fetch\(|api\.whatsapp|sendMessage/i);
});

test("shipping remains isolated from purchasing intelligence and quantities", () => {
  assert.doesNotMatch(migration + actions + component, /DemandIntelligenceEngine|PurchaseIntelligenceEngine|SupplierBasketIntelligenceEngine/);
  assert.doesNotMatch(shippedFunction, /recommended_packs|recommended_units|supplier_minimum|wallet/);
});
