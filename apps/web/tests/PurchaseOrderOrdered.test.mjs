import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repository = await readFile(
  new URL("../lib/purchase-orders/PurchaseOrderRepository.ts", import.meta.url),
  "utf8",
);
const actions = await readFile(
  new URL("../app/purchase-orders/actions.ts", import.meta.url),
  "utf8",
);
const component = await readFile(
  new URL("../components/purchase-orders/SupplierOrderPreparation.tsx", import.meta.url),
  "utf8",
);
const detail = await readFile(
  new URL("../app/purchase-orders/[id]/page.tsx", import.meta.url),
  "utf8",
);
const walletMigration = await readFile(
  new URL("../../../supabase/migrations/20260820000000_canonical_purchasing_wallet_freshness_policy.sql", import.meta.url),
  "utf8",
);
const orderedMigration = await readFile(
  new URL("../../../supabase/migrations/20260821000000_purchase_order_ordered_transition.sql", import.meta.url),
  "utf8",
);
const leadTimeMigration = await readFile(
  new URL("../../../supabase/migrations/20261050000000_governed_purchase_order_lead_time_evidence.sql", import.meta.url),
  "utf8",
);

test("approved purchase order transitions atomically to ordered with operator evidence", () => {
  assert.match(actions, /requireAuthenticatedOperator\(\)/);
  assert.match(repository, /rpc\("mark_vault_purchase_order_ordered"/);
  assert.match(repository, /target_purchase_order_id: input\.purchaseOrderId/);
  assert.match(repository, /target_operator_id: input\.operatorId/);
});

test("draft cannot be ordered and an ordered retry is idempotent", () => {
  assert.match(leadTimeMigration, /if purchase_order\.status = 'ordered'/);
  assert.match(leadTimeMigration, /return query select purchase_order\.id, purchase_order\.status, purchase_order\.ordered_by_operator_id, purchase_order\.ordered_at, false/);
  assert.match(leadTimeMigration, /Purchase order cannot be marked ordered from status/);
});

test("ordered transition is guarded by immutable supplier lead-time evidence", () => {
  assert.match(leadTimeMigration, /create table public\.vault_purchase_order_expected_lead_time_evidence/);
  assert.match(leadTimeMigration, /source_field = 'vault_suppliers\.default_lead_time_days'/);
  assert.match(leadTimeMigration, /purchase_order_ordered_requires_lead_time_evidence/);
  assert.match(leadTimeMigration, /insert into public\.vault_purchase_order_expected_lead_time_evidence/);
  assert.match(leadTimeMigration, /update public\.vault_purchase_orders[\s\S]*status = 'ordered'/);
  assert.match(leadTimeMigration, /before update or delete on public\.vault_purchase_order_expected_lead_time_evidence/);
});

test("wallet includes ordered unpaid commitment without creating cash or payment", () => {
  assert.match(walletMigration, /status in \('approved', 'ordered', 'part_paid', 'shipped'\)/);
  assert.match(walletMigration, /actual_total_gbp, estimated_total_gbp, 0\) - paid_amount_gbp/);
  assert.doesNotMatch(repository.slice(repository.indexOf("export async function markPurchaseOrderOrdered")), /paid_amount_gbp\s*:/);
  assert.doesNotMatch(actions, /vault_cash_transactions|cash transaction/i);
});

test("mark ordered is explicit only after preparation and never sends externally", () => {
  assert.match(component, /state\.preparedOrder/);
  assert.match(component, /The operator confirms this purchase order has actually been placed with the supplier/);
  assert.match(component, /Vault OS has not sent or placed this order automatically/);
  assert.match(component, /Mark as Ordered/);
  assert.match(component, /purchaseOrderStatus === "approved"/);
  assert.match(detail, /draft\.ordered_at/);
  assert.doesNotMatch(component + actions, /wa\.me|api\.whatsapp|fetch\(|sendMessage|placeOrder/);
});

test("migration adds only ordered operator attribution", () => {
  assert.match(orderedMigration, /ordered_by_operator_id uuid null/);
  assert.match(orderedMigration, /references public\.vault_operators\(id\)/);
  assert.doesNotMatch(orderedMigration, /create table|ordered_at|paid_amount_gbp/i);
});
