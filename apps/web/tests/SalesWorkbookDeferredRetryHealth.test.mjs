import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { timingSafeEqual } from "node:crypto";
import ts from "typescript";

const routePath = new URL("../app/api/internal/sales-workbook/deferred-retry/health/route.ts", import.meta.url);
const testSecret = "a".repeat(64);

async function loadHandler() {
  const source = await readFile(routePath, "utf8");
  const compiled = ts.transpileModule(source.replace(/^import .*;\r?\n/gm, ""), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("exports", "timingSafeEqual", "NextResponse", compiled)(exports, timingSafeEqual, { json: (body, init) => new Response(JSON.stringify(body), init) });
  return exports.GET;
}

async function responseFor(header, configured = testSecret) {
  const previous = process.env.SALES_WORKBOOK_AUTOMATION_SECRET;
  if (configured === null) delete process.env.SALES_WORKBOOK_AUTOMATION_SECRET;
  else process.env.SALES_WORKBOOK_AUTOMATION_SECRET = configured;
  try {
    const handler = await loadHandler();
    return await handler(new Request("http://local.test/api/internal/sales-workbook/deferred-retry/health", { headers: header ? { "x-vault-sales-workbook-automation-secret": header } : {} }));
  } finally {
    if (previous === undefined) delete process.env.SALES_WORKBOOK_AUTOMATION_SECRET;
    else process.env.SALES_WORKBOOK_AUTOMATION_SECRET = previous;
  }
}

test("health accepts the configured automation secret without touching recovery dependencies", async () => {
  const response = await responseFor(testSecret);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("health rejects a missing automation secret", async () => {
  const response = await responseFor(null);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    configured_secret_present: true,
    configured_secret_length_matches_64: true,
    provided_secret_length_matches_64: false,
  });
});

test("health rejects an incorrect automation secret", async () => {
  const response = await responseFor("b".repeat(64));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    configured_secret_present: true,
    configured_secret_length_matches_64: true,
    provided_secret_length_matches_64: true,
  });
});

test("health diagnostics report an unavailable configured secret without exposing it", async () => {
  const response = await responseFor(testSecret, null);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    configured_secret_present: false,
    configured_secret_length_matches_64: false,
    provided_secret_length_matches_64: true,
  });
});
