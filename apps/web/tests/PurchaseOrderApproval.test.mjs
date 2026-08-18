import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repository = await readFile(
  new URL("../lib/purchase-orders/PurchaseOrderRepository.ts", import.meta.url),
  "utf8",
);
const action = await readFile(
  new URL("../app/purchase-orders/actions.ts", import.meta.url),
  "utf8",
);
const detailPage = await readFile(
  new URL("../app/purchase-orders/[id]/page.tsx", import.meta.url),
  "utf8",
);
const listPage = await readFile(
  new URL("../app/purchase-orders/page.tsx", import.meta.url),
  "utf8",
);
const migration = await readFile(
  new URL("../../../supabase/migrations/20260818000000_purchase_order_draft_approval.sql", import.meta.url),
  "utf8",
);
const serializedApprovalMigration = await readFile(
  new URL("../../../supabase/migrations/20260828000000_purchase_order_serialized_approval.sql", import.meta.url),
  "utf8",
);
const approvalFunction = serializedApprovalMigration.slice(
  serializedApprovalMigration.indexOf("create function public.approve_vault_purchase_order"),
  serializedApprovalMigration.indexOf("revoke all on function public.approve_vault_purchase_order"),
);

test("approval is an authenticated, operator-attributed draft-only transition", () => {
  assert.match(action, /requireAuthenticatedOperator\(\)/);
  assert.match(action, /operatorId: operator\.id/);
  assert.match(approvalFunction, /purchase_order\.status <> 'draft'/);
  assert.match(approvalFunction, /set status = 'approved'/);
  assert.match(approvalFunction, /approved_by_operator_id = target_operator_id/);
  assert.match(approvalFunction, /approved_at = next_approved_at/);
  assert.match(repository, /getCurrentApprovalQualification/);
  assert.match(repository, /PurchaseIntelligenceEngine\.evaluate/);
  assert.match(repository, /\.rpc\(\s*"approve_vault_purchase_order"/);
});

test("approval reruns current canonical gates instead of trusting the draft snapshot", () => {
  assert.match(repository, /getCatalogueData\(\)/);
  assert.match(repository, /InventorySyncRepository\.getFreshness\(\)/);
  assert.match(repository, /vault_purchasing_wallet/);
  assert.match(repository, /basket\?\.purchasing_state !== "READY_TO_ORDER"/);
  assert.match(repository, /CapitalEngine\.reviewPosition/);
  assert.match(repository, /Purchase order approval blocked/);
  assert.match(repository, /evaluated_at: new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(repository, /source_snapshot[^\n]*ready_to_purchase/);
});

test("invalid IDs and non-draft statuses fail safely while repeats are idempotent", () => {
  assert.match(action, /Invalid purchase order/);
  assert.match(approvalFunction, /Purchase order was not found/);
  assert.match(approvalFunction, /purchase_order\.status = 'approved'/);
  assert.match(approvalFunction, /purchase_order\.approved_by_operator_id, purchase_order\.approved_at, false/);
  assert.match(approvalFunction, /cannot be approved from status/);
});

test("approval mutates only canonical header approval fields", () => {
  const updateBody = approvalFunction.match(/update public\.vault_purchase_orders po\s+set([\s\S]*?)where po\.id/)?.[1] ?? "";
  assert.match(updateBody, /status = 'approved'/);
  assert.match(updateBody, /approved_by_operator_id/);
  assert.match(updateBody, /approved_at/);
  assert.doesNotMatch(updateBody, /line|supplier|total|source_snapshot|recommendation/i);
  assert.doesNotMatch(approvalFunction, /vault_cash_transactions|vault_purchase_order_payments/);
});

test("approval requires exact canonical supplier, line set, classifications, quantities and costs", () => {
  assert.match(approvalFunction, /expected_supplier_id is distinct from purchase_order\.supplier_id/);
  assert.match(approvalFunction, /full join/);
  assert.match(approvalFunction, /expected\.style_id is null/);
  assert.match(approvalFunction, /persisted\.id is null/);
  assert.match(approvalFunction, /persisted\.recommended_packs is distinct from expected\.recommended_packs/);
  assert.match(approvalFunction, /persisted\.recommended_units is distinct from expected\.recommended_units/);
  assert.match(approvalFunction, /persisted\.units_per_pack is distinct from expected\.units_per_pack/);
  assert.match(approvalFunction, /persisted\.pack_cost_gbp is distinct from expected\.pack_cost_gbp/);
  assert.match(approvalFunction, /persisted\.line_cost_gbp is distinct from expected\.line_cost_gbp/);
  assert.match(approvalFunction, /persisted\.source_recommendation_type is distinct from expected\.source_recommendation_type/);
});

test("an exact current canonical basket is the only basket eligible for approval", () => {
  assert.match(repository, /qualification_state: qualification\.state/);
  assert.match(repository, /basket_state: basket\.purchasing_state/);
  assert.match(approvalFunction, /qualification_state' <> 'ready_to_purchase'/);
  assert.match(approvalFunction, /basket_state' <> 'READY_TO_ORDER'/);
  assert.match(approvalFunction, /set status = 'approved'/);
});

test("omitted required and qualified bring-forward lines are both rejected", () => {
  assert.match(repository, /sourceRecommendationType: "purchase_intelligence_required"/);
  assert.match(repository, /sourceRecommendationType: "purchase_intelligence_bring_forward"/);
  assert.match(approvalFunction, /persisted\.id is null/);
  assert.match(approvalFunction, /persisted\.source_recommendation_type is distinct from expected\.source_recommendation_type/);
});

test("extra persisted lines are rejected", () => {
  assert.match(approvalFunction, /full join/);
  assert.match(approvalFunction, /expected\.style_id is null/);
});

test("approval rejects changed aggregate packs, units and canonical total", () => {
  assert.match(approvalFunction, /purchase_order\.total_packs is distinct from expected_total_packs/);
  assert.match(approvalFunction, /purchase_order\.estimated_total_gbp is distinct from expected_total_gbp/);
  assert.match(approvalFunction, /sum\(line\.recommended_packs\)/);
  assert.match(approvalFunction, /sum\(line\.recommended_units\)/);
  assert.match(approvalFunction, /sum\(line\.line_cost_gbp\)/);
});

test("approval serializes wallet capacity and rereads it inside the protected transition", () => {
  const advisoryLock = approvalFunction.indexOf("pg_advisory_xact_lock");
  const walletRead = approvalFunction.indexOf("from public.vault_purchasing_wallet");
  const approvalUpdate = approvalFunction.indexOf("set status = 'approved'");
  assert.ok(advisoryLock > 0);
  assert.ok(walletRead > advisoryLock);
  assert.ok(approvalUpdate > walletRead);
  assert.match(approvalFunction, /expected_total_gbp > wallet\.available_purchasing_power_gbp/);
  assert.match(approvalFunction, /wallet\.committed_orders_gbp - expected_total_gbp < 0/);
});

test("stale qualification, changed supplier policy and insufficient capacity fail closed", () => {
  assert.match(approvalFunction, /qualification_evaluated_at < now\(\) - interval '5 minutes'/);
  assert.match(approvalFunction, /qualification_state' <> 'ready_to_purchase'/);
  assert.match(approvalFunction, /supplier\.minimum_order_value is distinct from expected_minimum_value/);
  assert.match(approvalFunction, /current_minimum_packs is distinct from expected_minimum_packs/);
  assert.match(approvalFunction, /exceeds current reserve-safe purchasing capacity/);
});

test("approved and ordered orders remain visible and drafts cannot prepare supplier orders", () => {
  assert.match(repository, /\.in\("status", \["draft", "approved", "ordered", "part_paid", "paid", "shipped", "received", "cancelled"\]\)/);
  assert.match(listPage, /draft\.status\.toUpperCase\(\)/);
  assert.match(detailPage, /draft\.status === "draft"/);
  assert.match(detailPage, /Prepare Supplier Order/);
  assert.match(detailPage, /disabled/);
});

test("migration adds durable operator evidence without parallel history", () => {
  assert.match(migration, /approved_by_operator_id uuid null/);
  assert.match(migration, /references public\.vault_operators\(id\)/);
  assert.doesNotMatch(migration, /create table/i);
  assert.match(serializedApprovalMigration, /grant execute on function public\.approve_vault_purchase_order[\s\S]*to service_role/);
  assert.doesNotMatch(serializedApprovalMigration, /DemandIntelligenceEngine|SupplierBasketIntelligenceEngine/);
});
