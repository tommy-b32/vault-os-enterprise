import assert from "node:assert/strict";
import test from "node:test";
import { createHistoricalCogsSimulationReviewApprovalHandler, createHistoricalCogsSimulationReviewHandler, dateOnlyReceiptRule } from "../lib/cogs/HistoricalCogsSimulationReviewHttp.ts";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (char) => char.repeat(64);
class AuthError extends Error { constructor(reason) { super(reason); this.reason = reason; } }
const snapshot = { simulationInputSha256:hash("a"), simulationResolutionSha256:hash("b"), simulatorCodeSha256:hash("c"), perLineReportSha256:hash("d") };
const review = { draftPolicyVersionId:id(1), policyRule:dateOnlyReceiptRule, snapshot, metrics:{ calculatedLineCount:388, returnedRestockedLineCount:14, sameDayReceiptWarningCount:22, simulatedCogsGbp:4463.111463, existingPolicyCogsGbp:4479.011216, simulatedClosingInventoryUnits:370, simulatedClosingInventoryLandedGbp:4097.838536 }, exceptionSummary:{ unresolved:0, sameDayWarnings:22 } };
const request = (body) => new Request("http://local.test", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify(body) });
const auth = async () => ({ id:id(9) });
const isAuth = (error) => error instanceof AuthError;

test("review requires operator authentication and exact, bounded snapshot input", async () => {
  let calls = 0;
  const denied = createHistoricalCogsSimulationReviewHandler({ requireOperator:async()=>{ throw new AuthError("unauthenticated"); }, isOperatorAuthorizationError:isAuth, createReview:async()=>{ calls++; return id(2); } });
  assert.equal((await denied(request(review))).status,401);
  const handler = createHistoricalCogsSimulationReviewHandler({ requireOperator:auth, isOperatorAuthorizationError:isAuth, createReview:async()=>{ calls++; return id(2); } });
  assert.equal((await handler(request({ ...review, snapshot:{ ...snapshot, unexpected:hash("e") } }))).status,400);
  assert.equal(calls,0);
});

test("review records server-derived operator identity and never activates policy", async () => {
  let received;
  const handler = createHistoricalCogsSimulationReviewHandler({ requireOperator:auth, isOperatorAuthorizationError:isAuth, createReview:async(input)=>{ received=input; return id(2); } });
  const response = await handler(request(review));
  assert.equal(response.status,201); assert.deepEqual(await response.json(),{ id:id(2), status:"reviewed", activation:"not_performed" });
  assert.equal(received.operatorId,id(9)); assert.equal(received.policyRule,dateOnlyReceiptRule);
});

test("owner-only approval sends exact snapshot and rejects mismatch without activation", async () => {
  const approval = { reviewId:id(2), policyRule:dateOnlyReceiptRule, snapshot, approvalNote:"Owner reviewed frozen simulation evidence." };
  let received;
  const handler = createHistoricalCogsSimulationReviewApprovalHandler({ requireOperator:auth, isOperatorAuthorizationError:isAuth, approveReview:async(input)=>{ received=input; return id(3); } });
  const invalid = await handler(request({ ...approval, snapshot:{ ...snapshot, perLineReportSha256:"bad" } }));
  assert.equal(invalid.status,400);
  const response = await handler(request(approval));
  assert.equal(response.status,201); assert.deepEqual(await response.json(),{ id:id(3), status:"approved_for_activation", activation:"not_performed" });
  assert.equal(received.operatorId,id(9));
  const rejected = createHistoricalCogsSimulationReviewApprovalHandler({ requireOperator:auth, isOperatorAuthorizationError:isAuth, approveReview:async()=>{ throw new Error("HISTORICAL_COGS_SIMULATION_SNAPSHOT_MISMATCH"); } });
  assert.equal((await rejected(request(approval))).status,422);
});

test("non-owner approval is rejected before the guarded RPC", async () => {
  let calls = 0;
  const handler = createHistoricalCogsSimulationReviewApprovalHandler({ requireOperator:async()=>{ throw new AuthError("forbidden"); }, isOperatorAuthorizationError:isAuth, approveReview:async()=>{ calls++; return id(3); } });
  const response = await handler(request({ reviewId:id(2), policyRule:dateOnlyReceiptRule, snapshot, approvalNote:"x" }));
  assert.equal(response.status,403); assert.equal(calls,0);
});
