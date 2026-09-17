import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("missions rendering remains read-only and only shows the temporary control to an owner", async () => {
  const page = await read("app/missions/page.tsx");

  assert.match(page, /getCurrentOperator/);
  assert.match(page, /operator\?\.role === "owner"/);
  assert.match(page, /GovernedDecisionMemoryFirstCaptureControl/);
  assert.doesNotMatch(page, /runGovernedDecisionMemoryCapture|createFirstGovernedDecisionMemoryBaseline/);
});

test("temporary governed memory action is owner-guarded and only derives capture inputs on the server", async () => {
  const action = await read("app/missions/governed-memory-actions.ts");

  assert.match(action, /^"use server";/);
  assert.match(action, /requireOperatorRole\("owner"\)/);
  assert.match(action, /const observedAt = new Date\(\)\.toISOString\(\)/);
  assert.match(action, /runGovernedDecisionMemoryCapture\(observedAt\)/);
  assert.equal((action.match(/runGovernedDecisionMemoryCapture\(observedAt\)/g) ?? []).length, 1);
  assert.doesNotMatch(action, /FormData|formData|storeScope|captureKind:.*input|semanticHash|payload/i);
});

test("temporary control submits only the server action and exposes only safe capture results", async () => {
  const control = await read("components/brain/GovernedDecisionMemoryFirstCaptureControl.tsx");

  assert.match(control, /<form action=\{action\}>/);
  assert.match(control, /CREATE FIRST GOVERNED BASELINE/);
  assert.match(control, /pending \|\| state\.status === "success"/);
  for (const result of ["state.inserted", "state.captureKind", "state.observedAt"]) {
    assert.match(control, new RegExp(result.replace(".", "\\.")));
  }
  assert.doesNotMatch(control, /semanticHash|payload|storeScope|wallet|catalogue|customer/i);
});

test("the temporary capture control introduces no API route", async () => {
  const route = new URL("app/missions/route.ts", root);
  await assert.rejects(readFile(route, "utf8"));
});
