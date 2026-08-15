import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { purchasingPowerPence } from "../lib/business/CashLedgerRules.ts";

const migration = await readFile(
  new URL("../../../supabase/migrations/20260822000000_purchase_order_payments.sql", import.meta.url),
  "utf8",
);
const repository = await readFile(
  new URL("../lib/purchase-orders/PurchaseOrderRepository.ts", import.meta.url),
  "utf8",
);
const action = await readFile(
  new URL("../app/purchase-orders/actions.ts", import.meta.url),
  "utf8",
);
const component = await readFile(
  new URL("../components/purchase-orders/PurchaseOrderPayment.tsx", import.meta.url),
  "utf8",
);

test("payment RPC permits only ordered and part-paid states and derives the next status", () => {
  assert.match(migration, /purchase_order\.status not in \('ordered', 'part_paid'\)/);
  assert.match(migration, /next_status := case when next_paid = settlement_total then 'paid' else 'part_paid' end/);
  assert.match(migration, /set paid_amount_gbp = next_paid, status = next_status/);
  assert.doesNotMatch(migration, /status = 'ordered'/);
});

test("positive, exact GBP settlement rejects overpayment and unsupported totals", () => {
  assert.match(migration, /target_amount_gbp is null or target_amount_gbp <= 0/);
  assert.match(migration, /target_amount_gbp <> round\(target_amount_gbp, 2\)/);
  assert.match(migration, /target_amount_gbp > outstanding/);
  assert.match(migration, /coalesce\(purchase_order\.actual_total_gbp, purchase_order\.estimated_total_gbp\)/);
  assert.match(migration, /Canonical GBP settlement total is unavailable/);
  assert.doesNotMatch(migration, /set actual_total_gbp|exchange_rate|currency_code/);
});

test("payment, ledger entry and PO aggregate are one database transaction", () => {
  assert.match(repository, /\.rpc\(\s*"record_vault_purchase_order_payment"/);
  assert.match(migration, /for update/);
  assert.match(migration, /insert into public\.vault_cash_transactions/);
  assert.match(migration, /insert into public\.vault_purchase_order_payments/);
  assert.match(migration, /update public\.vault_purchase_orders/);
  assert.match(migration, /'supplier_payment', 'Stock purchase'/);
  assert.match(migration, /-target_amount_gbp/);
  assert.match(migration, /source[\s\S]*'purchase_order'/);
});

test("payment retries return existing evidence without duplicate rows", () => {
  assert.match(migration, /unique \(purchase_order_id, idempotency_key\)/);
  assert.match(migration, /unique \(cash_transaction_id\)/);
  assert.match(migration, /before update or delete[\s\S]*prevent_vault_purchase_order_payment_mutation/);
  assert.match(migration, /purchase-order-payment:/);
  assert.match(migration, /existing_payment\.id[\s\S]*existing_payment\.payment_date, false/);
});

test("wallet does not double-count a £200 payment", () => {
  const before = purchasingPowerPence(336090, 50000, 50000);
  const after = purchasingPowerPence(316090, 50000, 30000);
  assert.equal(before, 236090);
  assert.equal(after, 236090);
});

test("payment UI exposes totals, history, true date and explicit ledger effect", () => {
  assert.match(component, /Settlement total/);
  assert.match(component, /Already paid/);
  assert.match(component, /Outstanding/);
  assert.match(component, /payments\.map/);
  assert.match(component, /name="payment_date"/);
  assert.match(component, /name="amount_gbp"/);
  assert.match(component, /reduce the business cash ledger and the purchase order outstanding commitment/);
  assert.match(component, /status !== "paid"/);
});

test("payment action is authenticated, validated and has no external or inventory effects", () => {
  assert.match(action, /requireAuthenticatedOperator\(\)/);
  assert.match(action, /parsePositiveAmountToPence/);
  assert.match(action, /recordPurchaseOrderPayment/);
  assert.doesNotMatch(action + repository + component, /api\.whatsapp|wa\.me|sendMessage|inventory.*update|received_at\s*:/i);
});
