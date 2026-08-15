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

test("approved purchase order transitions atomically to ordered with operator evidence", () => {
  assert.match(actions, /requireAuthenticatedOperator\(\)/);
  assert.match(repository, /status: "ordered"/);
  assert.match(repository, /ordered_by_operator_id: input\.operatorId/);
  assert.match(repository, /ordered_at: orderedAt/);
  assert.match(repository, /\.eq\("id", input\.purchaseOrderId\)/);
  assert.match(repository, /\.eq\("status", "approved"\)/);
});

test("draft cannot be ordered and an ordered retry is idempotent", () => {
  assert.match(repository, /current\.data\.status === "ordered"/);
  assert.match(repository, /transitioned: false/);
  assert.match(repository, /cannot be marked ordered from status/);
});

test("ordered transition changes only status and ordering audit fields", () => {
  const body = repository.match(/export async function markPurchaseOrderOrdered[\s\S]*?\.update\(\{([\s\S]*?)\}\)/)?.[1] ?? "";
  assert.match(body, /status: "ordered"/);
  assert.match(body, /ordered_by_operator_id/);
  assert.match(body, /ordered_at/);
  assert.doesNotMatch(body, /line|source_snapshot|supplier|total|paid_amount|actual_total|currency/i);
  const orderedFunction = repository.slice(
    repository.indexOf("export async function markPurchaseOrderOrdered"),
    repository.indexOf("export async function prepareApprovedPurchaseOrder"),
  );
  assert.doesNotMatch(orderedFunction, /vault_purchase_order_lines|vault_cash_transactions|\.insert\(|\.delete\(|\.upsert\(/);
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
