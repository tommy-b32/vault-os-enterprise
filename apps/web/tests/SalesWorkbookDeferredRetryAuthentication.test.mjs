import assert from "node:assert/strict";
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const routePath = new URL("../app/api/internal/sales-workbook/deferred-retry/route.ts", import.meta.url);

async function handler() {
  const source = await readFile(routePath, "utf8");
  const compiled = ts.transpileModule(source.replace(/^import .*;\r?\n/gm, ""), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function(
    "exports", "timingSafeEqual", "NextResponse", "runOrderReadyWorkbookWorker", "SalesWorkbookRepository", "supabaseAdmin", compiled,
  )(exports, timingSafeEqual, { json: (body, init) => new Response(JSON.stringify(body), init) }, async () => { throw new Error("must not run"); }, {}, {});
  let queried = false;
  return {
    handler: exports.createDeferredRetryHandler({
      runWorker: async () => { throw new Error("must not run"); },
      repository: { recordAutomaticSyncOutcome: async () => { throw new Error("must not run"); } },
      supabase: { from: () => { queried = true; throw new Error("must not query"); } },
    }),
    queried: () => queried,
  };
}

async function responseFor(header) {
  const previous = process.env.SALES_WORKBOOK_AUTOMATION_SECRET;
  process.env.SALES_WORKBOOK_AUTOMATION_SECRET = "a".repeat(64);
  try {
    const loaded = await handler();
    const response = await loaded.handler(new Request("http://local.test/api/internal/sales-workbook/deferred-retry", {
      method: "POST",
      headers: header ? { "x-vault-sales-workbook-automation-secret": header } : {},
    }));
    return { response, queried: loaded.queried() };
  } finally {
    if (previous === undefined) delete process.env.SALES_WORKBOOK_AUTOMATION_SECRET;
    else process.env.SALES_WORKBOOK_AUTOMATION_SECRET = previous;
  }
}

test("deferred retry rejects missing and incorrect automation secrets before any work", async () => {
  for (const header of [null, "b".repeat(64)]) {
    const result = await responseFor(header);
    assert.equal(result.response.status, 401);
    assert.equal(result.queried, false);
  }
});
