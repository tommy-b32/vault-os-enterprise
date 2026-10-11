import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("order-ready automation is bounded, authenticated, and reuses the governed workbook path", async () => {
  const [worker, route, scope, proposal, webhook, sync, trigger] = await Promise.all([
    read("lib/sales-workbook/OrderReadyWorkbookWorker.ts"),
    read("app/api/internal/sales-workbook/order-ready/route.ts"),
    read("lib/sales-workbook/BackfillProposalScope.ts"),
    read("lib/sales-workbook/BackfillProposal.ts"),
    read("../../supabase/functions/shopify-order-webhook/index.ts"),
    read("../../supabase/functions/shopify-order-sync/index.ts"),
    read("../../supabase/functions/_shared/shopify/sales-workbook-automation.ts"),
  ]);
  for (const text of ["MAX_AFFECTED_ORDERS = 25", "getBackfillProposal({ affectedOrderNumbers", "prepareSalesWorkbookBackfill", "writePendingBackfillWorkbook", "activatePendingWorkbookVersion", "uploaded_by_operator_id", "!prepared.ordersWritten"]) assert.ok(worker.includes(text));
  for (const text of ["timingSafeEqual", "SALES_WORKBOOK_AUTOMATION_SECRET", "runOrderReadyWorkbookWorker", "x-vault-sales-workbook-automation-secret"]) assert.ok(route.includes(text));
  for (const text of ["affectedOrderCandidateScope", "requested.size > maxOrders", "existing.has(orderNumber)"]) assert.ok(scope.includes(text));
  assert.match(proposal, /allowedOrderNumbers/);
  assert.match(proposal, /allowed \? allowed\.has/);
  for (const source of [webhook, sync]) {
    assert.match(source, /triggerSalesWorkbookOrderReady/);
    assert.match(source, /Sales workbook automation failed/);
  }
  for (const text of ["VAULT_WEB_APP_URL", "SALES_WORKBOOK_AUTOMATION_SECRET", "MAX_AFFECTED_ORDERS = 25", "/api/internal/sales-workbook/order-ready"]) assert.ok(trigger.includes(text));
});

test("the worker preserves the existing ready-only and no-version-on-no-change contracts", async () => {
  const [worker, writer] = await Promise.all([read("lib/sales-workbook/OrderReadyWorkbookWorker.ts"), read("lib/sales-workbook/BackfillWriter.ts")]);
  assert.match(worker, /parseSalesWorkbook/);
  assert.match(worker, /sha256\(new Uint8Array\(bytes\)\)/);
  assert.match(writer, /classification!=="ready"/);
  assert.match(writer, /existing\.has\(orderNumber\)/);
  assert.match(writer, /if\(!rows\.length\)return/);
});
