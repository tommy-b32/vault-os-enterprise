import assert from "node:assert/strict";
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const routePath = new URL("../app/api/internal/sales-workbook/order-ready/route.ts", import.meta.url);

async function loadHandler({ makeRunWorker, recordAutomaticSyncOutcome = async () => {} }) {
  const source = await readFile(routePath, "utf8");
  const compiled = ts.transpileModule(source.replace(/^import .*;\r?\n/gm, ""), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  class ConflictError extends Error {}
  class WorkerFailure extends Error { constructor(stage) { super(stage); this.stage = stage; } }
  const runWorker = makeRunWorker({ ConflictError, WorkerFailure });
  new Function(
    "exports", "timingSafeEqual", "NextResponse", "runOrderReadyWorkbookWorker", "SalesWorkbookRepository", "SalesWorkbookConflictError", "SalesWorkbookWorkerFailure", compiled,
  )(exports, timingSafeEqual, { json: (body, init) => new Response(JSON.stringify(body), init) }, runWorker, {}, ConflictError, WorkerFailure);
  return { handler: exports.createOrderReadyHandler({ runWorker, repository: { recordAutomaticSyncOutcome } }) };
}

async function post(handler) {
  const previous = process.env.SALES_WORKBOOK_AUTOMATION_SECRET;
  process.env.SALES_WORKBOOK_AUTOMATION_SECRET = "a".repeat(64);
  try {
    return await handler(new Request("http://local.test/api/internal/sales-workbook/order-ready", {
      method: "POST",
      headers: { "x-vault-sales-workbook-automation-secret": "a".repeat(64) },
      body: JSON.stringify({ orderNumbers: ["1337"] }),
    }));
  } finally {
    if (previous === undefined) delete process.env.SALES_WORKBOOK_AUTOMATION_SECRET;
    else process.env.SALES_WORKBOOK_AUTOMATION_SECRET = previous;
  }
}

const complete = overrides => ({
  workbookAvailable: true,
  sourceWorkbookVersion: 21,
  newWorkbookVersion: 22,
  ordersWritten: 1,
  rowsWritten: 1,
  skippedExistingOrders: 0,
  skippedReviewOrders: 0,
  writtenOrderNumbers: ["1337"],
  deferredOrderNumbers: [],
  deferredReasons: {},
  ...overrides,
});

test("success, deferred, and pending-activation responses exclude a 24 MiB workbook buffer", async () => {
  const workbookBytes = new Uint8Array(24 * 1024 * 1024).fill(17);
  for (const [scenario, result] of [
    ["success", complete({ bytes: workbookBytes })],
    ["deferred", complete({ ordersWritten: 0, rowsWritten: 0, newWorkbookVersion: 21, writtenOrderNumbers: [], deferredOrderNumbers: ["1337"], deferredReasons: { "1337": ["EVIDENCE_MISSING_SHIPPING"] }, bytes: workbookBytes })],
    ["pending activation", complete({ sourceWorkbookVersion: 22, newWorkbookVersion: 23, bytes: workbookBytes })],
  ]) {
    const { handler } = await loadHandler({ makeRunWorker: () => async () => result });
    const response = await post(handler);
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.ok(Buffer.byteLength(text) < 2048, `${scenario} response unexpectedly large: ${Buffer.byteLength(text)} bytes`);
    assert.doesNotMatch(text, /"bytes"|"0":17/);
  }
});

test("conflicts and failures retain their status, compact bodies, and audit behaviour", async () => {
  const outcomes = [];
  const conflict = await loadHandler({
    makeRunWorker: ({ ConflictError }) => async () => { throw new ConflictError(); },
    recordAutomaticSyncOutcome: async outcome => { outcomes.push(outcome); },
  });
  const conflictResponse = await post(conflict.handler);
  assert.equal(conflictResponse.status, 409);
  assert.deepEqual(await conflictResponse.json(), { error: "Sales workbook changed; event may be retried" });
  assert.equal(outcomes.at(-1).errorCode, "WORKBOOK_CONFLICT");

  const failure = await loadHandler({
    makeRunWorker: ({ WorkerFailure }) => async () => { throw new WorkerFailure("PENDING_WRITE"); },
    recordAutomaticSyncOutcome: async outcome => { outcomes.push(outcome); },
  });
  const failureResponse = await post(failure.handler);
  assert.equal(failureResponse.status, 500);
  assert.deepEqual(await failureResponse.json(), { error: "Sales workbook order-ready worker failed" });
  assert.equal(outcomes.at(-1).failureStage, "PENDING_WRITE");
});
