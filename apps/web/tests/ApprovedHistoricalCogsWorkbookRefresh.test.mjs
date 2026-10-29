import assert from "node:assert/strict";
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../../../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20261123000000_approval_cogs_workbook_refresh.sql", root), "utf8");
const routePath = new URL("../app/api/internal/sales-workbook/deferred-retry/route.ts", import.meta.url);

async function createHandler({ claims = [], worker }) {
  const source = await readFile(routePath, "utf8");
  const compiled = ts.transpileModule(source.replace(/^import .*;\r?\n/gm, ""), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const calls = [];
  const supabase = {
    rpc: async (name, payload) => {
      calls.push({ name, payload });
      if (name === "claim_sales_workbook_order_ready_requests") return { data: claims.splice(0, claims.length), error: null };
      return { data: null, error: null };
    },
    from: () => ({ select: () => ({ lte: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }),
  };
  new Function("exports", "timingSafeEqual", "NextResponse", "runOrderReadyWorkbookWorker", "SalesWorkbookRepository", "supabaseAdmin", compiled)(
    exports, timingSafeEqual, { json: (body, init) => new Response(JSON.stringify(body), init) }, worker, {}, supabase,
  );
  return {
    calls,
    handler: exports.createDeferredRetryHandler({ runWorker: worker, repository: { recordAutomaticSyncOutcome: async () => {} }, supabase }),
  };
}

async function invoke(loaded) {
  const previous = process.env.SALES_WORKBOOK_AUTOMATION_SECRET;
  process.env.SALES_WORKBOOK_AUTOMATION_SECRET = "approval-refresh-secret";
  try {
    return await loaded.handler(new Request("http://local.test/api/internal/sales-workbook/deferred-retry", {
      method: "POST", headers: { "x-vault-sales-workbook-automation-secret": "approval-refresh-secret" },
    }));
  } finally {
    if (previous === undefined) delete process.env.SALES_WORKBOOK_AUTOMATION_SECRET;
    else process.env.SALES_WORKBOOK_AUTOMATION_SECRET = previous;
  }
}

test("approval transaction invalidates profitability and creates one durable order request only for APPROVED", () => {
  assert.match(migration, /if p_decision = 'APPROVED' then[\s\S]*pg_advisory_xact_lock[\s\S]*read_model_state[\s\S]*vault_sales_workbook_order_ready_requests/);
  assert.match(migration, /order_id uuid not null unique/);
  assert.match(migration, /source_proposal_id uuid not null unique/);
  assert.match(migration, /on conflict \(order_id\) do nothing/);
  assert.doesNotMatch(migration, /if p_decision = 'REJECTED' then[\s\S]*vault_sales_workbook_order_ready_requests/);
});

test("approved request invokes the existing worker for exactly its order and completes once", async () => {
  const workerCalls = [];
  const loaded = await createHandler({
    claims: [{ id: "request-1", order_number: "1336", lease_token: "lease-1", attempt_count: 1 }],
    worker: async orderNumbers => {
      workerCalls.push([...orderNumbers]);
      return { ordersWritten: 1, writtenOrderNumbers: ["1336"], deferredOrderNumbers: [], deferredReasons: {} };
    },
  });
  assert.equal((await invoke(loaded)).status, 200);
  assert.deepEqual(workerCalls, [["1336"]]);
  assert.ok(loaded.calls.some(call => call.name === "complete_sales_workbook_order_ready_request"));
  assert.equal(loaded.calls.filter(call => call.name === "retry_sales_workbook_order_ready_request").length, 0);
});

test("an incomplete approved order is retried without publishing", async () => {
  const loaded = await createHandler({
    claims: [{ id: "request-2", order_number: "1336", lease_token: "lease-2", attempt_count: 1 }],
    worker: async () => ({ ordersWritten: 0, writtenOrderNumbers: [], deferredOrderNumbers: ["1336"], deferredReasons: { 1336: ["EVIDENCE_COGS"] } }),
  });
  assert.equal((await invoke(loaded)).status, 200);
  assert.ok(loaded.calls.some(call => call.name === "retry_sales_workbook_order_ready_request" && call.payload.p_error_code === "WORKBOOK_ORDER_NOT_READY"));
  assert.equal(loaded.calls.filter(call => call.name === "complete_sales_workbook_order_ready_request").length, 0);
});

test("duplicate delivery is idempotent: a completed request is not claimed or published again", async () => {
  let workerCalls = 0;
  const loaded = await createHandler({ claims: [], worker: async () => { workerCalls++; throw new Error("must not run"); } });
  assert.equal((await invoke(loaded)).status, 200);
  assert.equal(workerCalls, 0);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /SALES_WORKBOOK_ORDER_READY_REQUEST_LEASE_LOST/);
});
