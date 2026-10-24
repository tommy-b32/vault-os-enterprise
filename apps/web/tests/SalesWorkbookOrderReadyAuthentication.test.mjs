import assert from "node:assert/strict";
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const routePath = new URL("../app/api/internal/sales-workbook/order-ready/route.ts", import.meta.url);

async function handler() {
  const source = await readFile(routePath, "utf8");
  const compiled = ts.transpileModule(source.replace(/^import .*;\r?\n/gm, ""), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  class ConflictError extends Error {}
  new Function(
    "exports", "timingSafeEqual", "NextResponse", "runOrderReadyWorkbookWorker", "SalesWorkbookRepository", "SalesWorkbookConflictError", compiled,
  )(exports, timingSafeEqual, { json: (body, init) => new Response(JSON.stringify(body), init) }, async () => { throw new Error("must not run"); }, {}, ConflictError);
  let workerCalled = false;
  let auditCalled = false;
  return {
    handler: exports.createOrderReadyHandler({
      runWorker: async () => { workerCalled = true; throw new Error("must not run"); },
      repository: { recordAutomaticSyncOutcome: async () => { auditCalled = true; throw new Error("must not run"); } },
    }),
    workerCalled: () => workerCalled,
    auditCalled: () => auditCalled,
  };
}

async function responseFor(header) {
  const previous = process.env.SALES_WORKBOOK_AUTOMATION_SECRET;
  process.env.SALES_WORKBOOK_AUTOMATION_SECRET = "a".repeat(64);
  try {
    const loaded = await handler();
    const response = await loaded.handler(new Request("http://local.test/api/internal/sales-workbook/order-ready", {
      method: "POST",
      headers: header ? { "x-vault-sales-workbook-automation-secret": header } : {},
      body: JSON.stringify({ orderNumbers: ["test-order"] }),
    }));
    return { response, workerCalled: loaded.workerCalled(), auditCalled: loaded.auditCalled() };
  } finally {
    if (previous === undefined) delete process.env.SALES_WORKBOOK_AUTOMATION_SECRET;
    else process.env.SALES_WORKBOOK_AUTOMATION_SECRET = previous;
  }
}

test("order-ready rejects missing and incorrect automation secrets before worker or audit side effects", async () => {
  for (const header of [null, "b".repeat(64)]) {
    const result = await responseFor(header);
    assert.equal(result.response.status, 401);
    assert.deepEqual(await result.response.json(), { error: "Unauthorized" });
    assert.equal(result.workerCalled, false);
    assert.equal(result.auditCalled, false);
  }
});
