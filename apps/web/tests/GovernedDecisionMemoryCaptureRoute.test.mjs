import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createGovernedDecisionMemoryCaptureHandler } from "../lib/governed-decision-memory/createGovernedDecisionMemoryCaptureHandler.ts";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const authorizedRequest = (body) => new Request("http://localhost/api/internal/governed-decision-memory/capture", {
  method: "POST",
  headers: { Authorization: "Bearer scheduler-secret", "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

test("internal capture route is Node-only, POST-only, and delegates only to the existing capture boundary", async () => {
  const route = await read("app/api/internal/governed-decision-memory/capture/route.ts");

  assert.match(route, /import "server-only"/);
  assert.match(route, /export const runtime = "nodejs"/);
  assert.match(route, /export async function POST/);
  assert.doesNotMatch(route, /export async function (?:GET|HEAD|OPTIONS)/);
  assert.match(route, /runGovernedDecisionMemoryCapture/);
  assert.doesNotMatch(route, /supabaseAdmin|\.rpc\(|GovernedDecisionMemoryRepository|recordGovernedDecisionMemory/);
});

test("capture handler fails closed before invoking capture when scheduler authentication is unavailable or invalid", async () => {
  let calls = 0;
  const capture = async () => { calls += 1; return { inserted: true, captureKind: "daily_baseline" }; };

  for (const request of [
    new Request("http://localhost", { method: "POST" }),
    new Request("http://localhost", { method: "POST", headers: { Authorization: "Bearer wrong-secret" } }),
  ]) {
    const response = await createGovernedDecisionMemoryCaptureHandler({ capture, getSchedulerSecret: () => "scheduler-secret" })(request);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: "Unauthorized" });
  }

  const missingSecret = await createGovernedDecisionMemoryCaptureHandler({ capture, getSchedulerSecret: () => undefined })(authorizedRequest());
  assert.equal(missingSecret.status, 401);
  assert.deepEqual(await missingSecret.json(), { ok: false, error: "Unauthorized" });
  assert.equal(calls, 0);
});

test("authorized capture is server-timestamped, ignores caller body data, and returns only safe results", async () => {
  const observedAtValues = [];
  const response = await createGovernedDecisionMemoryCaptureHandler({
    capture: async (observedAt) => {
      observedAtValues.push(observedAt);
      return { inserted: false, captureKind: null };
    },
    getSchedulerSecret: () => "scheduler-secret",
  })(authorizedRequest({ observedAt: "1900-01-01T00:00:00.000Z", captureKind: "change", semantic_hash: "forged", payload: { style_states: [] } }));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ["captureKind", "inserted", "observedAt", "ok"]);
  assert.deepEqual(body, { ok: true, inserted: false, captureKind: null, observedAt: observedAtValues[0] });
  assert.equal(observedAtValues.length, 1);
  assert.notEqual(observedAtValues[0], "1900-01-01T00:00:00.000Z");
});

test("capture failure is sanitized", async () => {
  const response = await createGovernedDecisionMemoryCaptureHandler({
    capture: async () => { throw new Error("secret database detail"); },
    getSchedulerSecret: () => "scheduler-secret",
  })(authorizedRequest());

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { ok: false, error: "Governed decision memory capture failed." });
});
