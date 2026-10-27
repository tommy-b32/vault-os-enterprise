import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

async function loadWorker() {
  const source = await read("lib/sales-workbook/OrderReadyWorkbookWorker.ts");
  const compiled = ts.transpileModule(source.replace(/^import .*;\r?\n/gm, ""), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  class ConflictError extends Error {}
  new Function(
    "exports", "getBackfillProposal", "prepareSalesWorkbookBackfill", "parseSalesWorkbook", "SalesWorkbookRepository", "sha256", "SalesWorkbookConflictError", "SalesWorkbookSizeLimitError", compiled,
  )(exports, async () => ({}), () => ({}), () => ({ valid: true, rows: [] }), {}, () => "hash", ConflictError, class SalesWorkbookSizeLimitError extends Error {});
  return exports.runOrderReadyWorkbookWorker;
}

const current = { id: "workbook", current_version: 21, content_hash: "hash", uploaded_by_operator_id: "operator" };

function repository(overrides = {}) {
  return {
    getCurrentWorkbook: async () => current,
    findPendingWorkbookVersion: async () => null,
    readCurrentWorkbookBytes: async () => ({ workbook: current, bytes: new Uint8Array([1]).buffer }),
    readWorkbookBytes: async () => new Uint8Array([1]),
    writePendingBackfillWorkbook: async () => { throw new Error("not reached"); },
    activatePendingWorkbookVersion: async () => { throw new Error("not reached"); },
    ...overrides,
  };
}

test("worker emits stable stages for real read and proposal failures", async () => {
  const worker = await loadWorker();
  await assert.rejects(
    () => worker(["1337"], { repository: repository({ getCurrentWorkbook: async () => { throw new Error("fixture"); } }), getBackfillProposal: async () => ({}), parseSalesWorkbook: () => ({ valid: true, rows: [] }), prepareSalesWorkbookBackfill: () => ({ ordersWritten: 0 }) }),
    error => error?.stage === "WORKBOOK_READ" && error?.name === "SalesWorkbookWorkerFailure",
  );
  await assert.rejects(
    () => worker(["1337"], { repository: repository(), getBackfillProposal: async () => { throw new Error("fixture"); }, parseSalesWorkbook: () => ({ valid: true, rows: [] }), prepareSalesWorkbookBackfill: () => ({ ordersWritten: 0 }) }),
    error => error?.stage === "PROPOSAL_RPC" && error?.name === "SalesWorkbookWorkerFailure",
  );
});

test("worker classifies only allowlisted non-sensitive failure stages", async () => {
  const worker = await read("lib/sales-workbook/OrderReadyWorkbookWorker.ts");
  for (const stage of ["WORKBOOK_READ", "PROPOSAL_RPC", "XLSX_PROCESSING", "PENDING_WRITE", "VERIFICATION", "ACTIVATION"]) assert.match(worker, new RegExp(`"${stage}"`));
  assert.match(worker, /throw new SalesWorkbookWorkerFailure\(stage\)/);
  assert.doesNotMatch(worker, /error\.message/);
});

test("failed automatic outcomes retain allowlisted codes and stages only", async () => {
  const [route, repository] = await Promise.all([
    read("app/api/internal/sales-workbook/order-ready/route.ts"),
    read("lib/sales-workbook/SalesWorkbookRepository.ts"),
  ]);
  assert.match(route, /errorCode:error instanceof SalesWorkbookConflictError\?"WORKBOOK_CONFLICT":error instanceof SalesWorkbookSizeLimitError\?"WORKBOOK_SIZE_LIMIT":"WORKBOOK_WORKER_FAILED"/);
  assert.match(route, /failureStage:error instanceof SalesWorkbookWorkerFailure\?error\.stage:undefined/);
  assert.match(repository, /failure_stage:failureStage/);
  assert.match(repository, /\["WORKBOOK_READ","PROPOSAL_RPC","XLSX_PROCESSING","PENDING_WRITE","VERIFICATION","ACTIVATION"\]/);
  assert.doesNotMatch(repository, /failure_stage:.*error\.message/);
});

test("success and deferred outcome contracts remain unchanged", async () => {
  const route = await read("app/api/internal/sales-workbook/order-ready/route.ts");
  assert.match(route, /status=result\.ordersWritten>0\?"published":"deferred"/);
  assert.match(route, /return NextResponse\.json\(compactWorkerResponse\(result,status\)\)/);
  assert.doesNotMatch(route, /NextResponse\.json\(\{\.\.\.result,status\}\)/);
});
