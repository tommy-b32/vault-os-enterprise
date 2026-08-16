import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("../../supabase/migrations/20260827000000_purchase_order_cancellation.sql", root), "utf8");
const walletMigration = await readFile(new URL("../../supabase/migrations/20260823000000_purchase_order_receiving.sql", root), "utf8");
const repository = await readFile(new URL("lib/purchase-orders/PurchaseOrderRepository.ts", root), "utf8");
const actions = await readFile(new URL("app/purchase-orders/actions.ts", root), "utf8");
const component = await readFile(new URL("components/purchase-orders/PurchaseOrderCancellation.tsx", root), "utf8");
const detail = await readFile(new URL("app/purchase-orders/[id]/page.tsx", root), "utf8");

const cancellationFunction = migration.slice(
  migration.indexOf("create function public.cancel_vault_purchase_order"),
  migration.indexOf("revoke all on function public.cancel_vault_purchase_order"),
);

test("draft, approved and evidence-free ordered purchase orders can be cancelled", () => {
  assert.match(cancellationFunction, /status not in \('draft', 'approved', 'ordered'\)/);
  assert.match(cancellationFunction, /for update/);
  assert.match(cancellationFunction, /set status = 'cancelled'/);
  assert.match(repository, /\.rpc\(\s*"cancel_vault_purchase_order"/);
});

test("payment, shipping, receiving and posting evidence block cancellation", () => {
  assert.match(cancellationFunction, /paid_amount_gbp <> 0/);
  assert.match(cancellationFunction, /vault_purchase_order_payments/);
  assert.match(cancellationFunction, /shipped_at is not null/);
  assert.match(cancellationFunction, /vault_purchase_order_receipts/);
  assert.match(cancellationFunction, /vault_purchase_order_inventory_postings/);
  assert.doesNotMatch(cancellationFunction.match(/status not in \([^)]+\)/)?.[0] ?? "", /part_paid|paid|shipped|received/);
});

test("cancellation evidence is required, bounded, operator-attributed and retry-safe", () => {
  assert.match(migration, /cancelled_at timestamptz/);
  assert.match(migration, /cancelled_by_operator_id uuid/);
  assert.match(migration, /cancellation_reason text/);
  assert.match(cancellationFunction, /Cancellation reason is required/);
  assert.match(cancellationFunction, /1000 characters or fewer/);
  assert.match(cancellationFunction, /purchase_order\.status = 'cancelled'/);
  assert.match(cancellationFunction, /purchase_order\.cancellation_reason, false/);
  assert.match(actions, /requireAuthenticatedOperator\(\)[\s\S]*cancelPurchaseOrder/);
});

test("cancelled purchase orders leave wallet commitments naturally", () => {
  assert.match(walletMigration, /status in \('approved', 'ordered', 'part_paid', 'shipped', 'received'\)/);
  assert.doesNotMatch(walletMigration.match(/filter \(where status in \([^)]+\)\)/)?.[0] ?? "", /cancelled/);
  assert.doesNotMatch(cancellationFunction, /vault_purchasing_wallet|vault_cash_transactions|committed_orders_gbp/);
});

test("cancellation mutates no downstream evidence or purchasing inputs", () => {
  assert.doesNotMatch(cancellationFunction, /update public\.vault_purchase_order_lines|delete from|insert into/);
  assert.doesNotMatch(cancellationFunction, /paid_amount_gbp\s*=|received_at\s*=|vault_inventory_levels/);
  assert.doesNotMatch(migration + actions + component, /DemandIntelligenceEngine|PurchaseIntelligenceEngine|SupplierBasketIntelligenceEngine/);
  assert.doesNotMatch(cancellationFunction, /shopifyGraphQL|inventoryAdjustQuantities/);
});

test("eligible UI requires reason and confirmation then hides downstream actions", () => {
  assert.match(component, /Cancel Purchase Order/);
  assert.match(component, /name="cancellation_reason" required/);
  assert.match(component, /name="cancellation_confirmed" required/);
  assert.match(component, /router\.refresh\(\)/);
  assert.match(detail, /draft\.cancelled_at/);
  assert.match(detail, /\["draft", "approved", "ordered", "cancelled"\]/);
  assert.doesNotMatch(detail.match(/\["approved", "ordered", "part_paid", "paid", "shipped", "received"\]/)?.[0] ?? "", /cancelled/);
});
