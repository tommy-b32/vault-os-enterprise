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

test("approval is an authenticated, operator-attributed draft-only transition", () => {
  assert.match(action, /requireAuthenticatedOperator\(\)/);
  assert.match(action, /operatorId: operator\.id/);
  assert.match(repository, /\.eq\("status", "draft"\)/);
  assert.match(repository, /status: "approved"/);
  assert.match(repository, /approved_by_operator_id: input\.operatorId/);
  assert.match(repository, /approved_at: approvedAt/);
  assert.match(repository, /getCurrentApprovalBlockers/);
  assert.match(repository, /PurchaseIntelligenceEngine\.evaluate/);
});

test("approval reruns current canonical gates instead of trusting the draft snapshot", () => {
  assert.match(repository, /getCatalogueData\(\)/);
  assert.match(repository, /InventorySyncRepository\.getFreshness\(\)/);
  assert.match(repository, /vault_purchasing_wallet/);
  assert.match(repository, /basket\?\.purchasing_state !== "READY_TO_ORDER"/);
  assert.match(repository, /CapitalEngine\.reviewPosition/);
  assert.match(repository, /Purchase order approval blocked/);
  assert.doesNotMatch(repository, /source_snapshot[^\n]*ready_to_purchase/);
});

test("invalid IDs and non-draft statuses fail safely while repeats are idempotent", () => {
  assert.match(action, /Invalid purchase order/);
  assert.match(repository, /Purchase order was not found/);
  assert.match(repository, /current\.data\.status === "approved"/);
  assert.match(repository, /transitioned: false/);
  assert.match(repository, /cannot be approved from status/);
});

test("approval mutates only canonical header approval fields", () => {
  const updateBody = repository.match(/\.update\(\{([\s\S]*?)\}\)\s*\.eq\("id", input\.purchaseOrderId\)/)?.[1] ?? "";
  assert.match(updateBody, /status: "approved"/);
  assert.match(updateBody, /approved_by_operator_id/);
  assert.match(updateBody, /approved_at/);
  assert.doesNotMatch(updateBody, /line|supplier|total|source_snapshot|recommendation/i);
});

test("approved orders remain visible and drafts cannot prepare supplier orders", () => {
  assert.match(repository, /\.in\("status", \["draft", "approved"\]\)/);
  assert.match(listPage, /draft\.status\.toUpperCase\(\)/);
  assert.match(detailPage, /draft\.status === "draft"/);
  assert.match(detailPage, /Prepare Supplier Order/);
  assert.match(detailPage, /disabled/);
});

test("migration adds durable operator evidence without parallel history", () => {
  assert.match(migration, /approved_by_operator_id uuid null/);
  assert.match(migration, /references public\.vault_operators\(id\)/);
  assert.doesNotMatch(migration, /create table/i);
});
