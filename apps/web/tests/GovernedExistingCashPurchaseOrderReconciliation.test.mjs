import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../../../supabase/migrations/20261070000000_governed_existing_cash_purchase_order_reconciliation.sql", import.meta.url), "utf8");
const ambiguityFix = await readFile(new URL("../../../supabase/migrations/20261071000000_fix_existing_cash_reconciliation_rpc_ambiguity.sql", import.meta.url), "utf8");
const rpc = sql.slice(sql.indexOf("create function public.reconcile_existing_cash_purchase_order_payment"), sql.indexOf("create view public.vault_purchase_order_governed_reconciled_payment_state"));
const view = sql.slice(sql.indexOf("create view public.vault_purchase_order_governed_reconciled_payment_state"));

test("governed liability, not legacy estimates or PO header totals, is settlement authority", () => {
  for (const item of ["vault_purchase_order_governed_liability", "liability_evidence_state <> 'available'", "liability_source <> 'governed_gbp_landed_cost_allocation'", "selected_gbp_minor_units", "governed_gbp_allocation_run_id"]) assert.match(rpc, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(rpc, /estimated_total_gbp|actual_total_gbp|paid_amount_gbp|819\.45/i);
});

test("supplier settlement and transfer fee are separate integer-pence components which conserve the existing debit", () => {
  assert.match(sql, /supplier_payment_minor_units bigint not null check \(supplier_payment_minor_units > 0\)/);
  assert.match(sql, /transfer_fee_minor_units bigint not null check \(transfer_fee_minor_units >= 0\)/);
  assert.match(rpc, /v_supplier_payment \+ v_transfer_fee <> v_cash_debit/);
  assert.match(rpc, /PO_CASH_RECONCILIATION_COMPONENTS_DO_NOT_CONSERVE_CASH_DEBIT/);
  assert.match(view, /supplier_payment_minor_units/);
  assert.match(view, /transfer_fee_minor_units/);
  assert.doesNotMatch(sql, /landed_cost_per|merchandise_pack_cost|freight_amount|vault_product_cost_versions/i);
});

test("the existing cash debit is linked, never replaced or duplicated", () => {
  assert.match(sql, /cash_transaction_id uuid not null references public\.vault_cash_transactions/);
  assert.match(sql, /unique \(cash_transaction_id\)/);
  assert.match(rpc, /from public\.vault_cash_transactions where id = v_cash for update/);
  assert.doesNotMatch(rpc, /insert into public\.vault_cash_transactions|update public\.vault_cash_transactions|delete from public\.vault_cash_transactions/i);
});

test("reconciliation rejects incompatible reuse, cross-account misuse, and overpayment", () => {
  for (const item of ["PO_CASH_RECONCILIATION_IDEMPOTENCY_CONFLICT", "PO_CASH_RECONCILIATION_CASH_TRANSACTION_ALREADY_RECONCILED", "PO_CASH_RECONCILIATION_CASH_ACCOUNT_INVALID", "PO_CASH_RECONCILIATION_CASH_TRANSACTION_INVALID", "PO_CASH_RECONCILIATION_SUPPLIER_PAYMENT_EXCEEDS_GOVERNED_LIABILITY"]) assert.match(rpc, new RegExp(item));
  assert.match(rpc, /v_account\.account_type <> 'business'/);
  assert.match(rpc, /v_account\.currency <> 'GBP'/);
  assert.match(rpc, /v_cash_row\.supplier_id is not null/);
});

test("idempotent replay returns existing immutable evidence", () => {
  assert.match(sql, /unique \(purchase_order_id, idempotency_key\)/);
  assert.match(rpc, /where purchase_order_id = v_po and idempotency_key = v_key for update/);
  assert.match(rpc, /return query select v_existing\.id[\s\S]*true/);
  assert.match(sql, /before update or delete on public\.vault_purchase_order_cash_payment_reconciliations/);
});

test("71000 qualifies reconciliation identifiers that collide with RETURNS TABLE variables", () => {
  assert.match(ambiguityFix, /create or replace function public\.reconcile_existing_cash_purchase_order_payment/);
  assert.match(ambiguityFix, /reconciliation\.purchase_order_id = v_po/);
  assert.match(ambiguityFix, /reconciliation\.cash_transaction_id = v_cash/);
  assert.match(ambiguityFix, /liability\.purchase_order_id = v_po/);
  assert.doesNotMatch(ambiguityFix, /where purchase_order_id = v_po/);
  assert.match(ambiguityFix, /security invoker set search_path = ''/);
  assert.doesNotMatch(ambiguityFix, /grant |revoke |create table|insert into public\.vault_cash_transactions|vault_purchase_order_payments/i);
});

test("reconciliation is payment-state evidence only: it does not transition or mutate the PO", () => {
  assert.match(view, /supplier_balance_minor_units/);
  assert.doesNotMatch(rpc, /update public\.vault_purchase_orders|insert into public\.vault_purchase_order_payments|status\s*=/i);
});

test("legacy payment path remains untouched", async () => {
  const legacy = await readFile(new URL("../../../supabase/migrations/20260822000000_purchase_order_payments.sql", import.meta.url), "utf8");
  assert.match(legacy, /create or replace function public\.record_vault_purchase_order_payment/);
  assert.match(legacy, /insert into public\.vault_cash_transactions/);
  assert.doesNotMatch(sql, /create or replace function public\.record_vault_purchase_order_payment/);
});

test("new evidence and read model have minimum service-only, invoker-safe access", () => {
  assert.match(sql, /alter table public\.vault_purchase_order_cash_payment_reconciliations enable row level security/);
  assert.match(sql, /revoke all on public\.vault_purchase_order_cash_payment_reconciliations from public, anon, authenticated, service_role/);
  assert.match(sql, /grant select, insert on public\.vault_purchase_order_cash_payment_reconciliations to service_role/);
  assert.match(rpc, /security invoker/);
  assert.match(view, /with \(security_invoker = true\)/);
  assert.match(sql, /revoke all on public\.vault_purchase_order_governed_reconciled_payment_state from public, anon, authenticated/);
  assert.match(sql, /grant select on public\.vault_purchase_order_governed_reconciled_payment_state to service_role/);
  assert.doesNotMatch(sql, /alter default privileges/i);
});
