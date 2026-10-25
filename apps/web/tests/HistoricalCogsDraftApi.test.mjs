import assert from "node:assert/strict";
import test from "node:test";
import { createHistoricalCogsDraftHandler } from "../lib/cogs/HistoricalCogsDraftHttp.ts";

const ids = Array.from({ length: 8 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
class AuthError extends Error { constructor(reason) { super(reason); this.reason = reason; } }
const request = (body) => new Request("http://local.test/api/cogs/historical-cogs-drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const handler = (createDraft, authorise = async () => ({ id: ids[0] })) => createHistoricalCogsDraftHandler({ requireOperator: authorise, isOperatorAuthorizationError: (error) => error instanceof AuthError, createDraft });
const payload = { legacyBatchIds: ids.slice(0, 6), governedDeliveryBatchIds: ids.slice(6) };

test("unauthenticated and forbidden requests cannot invoke the draft RPC", async () => {
  let calls = 0;
  const createDraft = async () => { calls++; return ids[0]; };
  assert.equal((await handler(createDraft, async () => { throw new AuthError("unauthenticated"); })(request(payload))).status, 401);
  assert.equal((await handler(createDraft, async () => { throw new AuthError("forbidden"); })(request(payload))).status, 403);
  assert.equal(calls, 0);
});

test("invalid and impersonating requests are rejected before the draft RPC", async () => {
  let calls = 0; const createDraft = async () => { calls++; return ids[0]; };
  assert.equal((await handler(createDraft)(request({ ...payload, legacyBatchIds: payload.legacyBatchIds.slice(0, 5) }))).status, 400);
  assert.equal((await handler(createDraft)(request({ ...payload, operatorId: ids[7] }))).status, 400);
  assert.equal(calls, 0);
});

test("an authorised request derives its actor and returns compact draft evidence", async () => {
  let input;
  const response = await handler(async (value) => { input = value; return ids[7]; })(request(payload));
  assert.equal(response.status, 201); assert.equal(input.operatorId, ids[0]);
  assert.deepEqual(await response.json(), { id: ids[7], status: "draft", evidence: { legacyBatchCount: 6, governedDeliveryBatchCount: 2 } });
});

test("repeated requests return the RPC's existing draft identifier", async () => {
  const createDraft = async () => ids[7];
  const first = await handler(createDraft)(request(payload)); const repeat = await handler(createDraft)(request({ legacyBatchIds: [...payload.legacyBatchIds].reverse(), governedDeliveryBatchIds: [...payload.governedDeliveryBatchIds].reverse() }));
  assert.equal((await first.json()).id, ids[7]); assert.equal((await repeat.json()).id, ids[7]);
});
