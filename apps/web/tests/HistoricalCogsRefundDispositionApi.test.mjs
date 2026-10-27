import assert from "node:assert/strict";
import test from "node:test";
import { createHistoricalCogsRefundDispositionHandler } from "../lib/cogs/HistoricalCogsRefundDispositionHttp.ts";

const id=(n)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
class AuthError extends Error { constructor(reason){super(reason);this.reason=reason;} }
const body={draftPolicyVersionId:id(1),subjectOrderLineId:id(2),refundLineObservationIds:[id(3),id(4)],disposition:"retained_sale",ownerAttestation:"Owner attests the observed refunds were different returned and restocked items."};
const request=(value)=>new Request("http://local.test",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(value)});

test("requires owner session before invoking disposition RPC",async()=>{
  let calls=0; const handler=createHistoricalCogsRefundDispositionHandler({requireOwner:async()=>{throw new AuthError("forbidden");},isOperatorAuthorizationError:(e)=>e instanceof AuthError,record:async()=>{calls++;return id(4);}});
  assert.equal((await handler(request(body))).status,403); assert.equal(calls,0);
});
test("derives owner identity and rejects malformed or impersonating input",async()=>{
  let received; const handler=createHistoricalCogsRefundDispositionHandler({requireOwner:async()=>({id:id(9)}),isOperatorAuthorizationError:()=>false,record:async(input)=>{received=input;return id(4);}});
  assert.equal((await handler(request({...body,operatorId:id(8)}))).status,400);
  const response=await handler(request(body)); assert.equal(response.status,201); assert.equal(received.operatorId,id(9));
  assert.deepEqual(await response.json(),{id:id(4),status:"attested",attribution:"not_changed",inventory:"not_changed"});
});
test("conflicts and invalid dispositions return no success",async()=>{
  const handler=createHistoricalCogsRefundDispositionHandler({requireOwner:async()=>({id:id(9)}),isOperatorAuthorizationError:()=>false,record:async()=>{throw new Error("HISTORICAL_COGS_REFUND_DISPOSITION_CONFLICT");}});
  assert.equal((await handler(request({...body,disposition:"other"}))).status,400);
  assert.equal((await handler(request(body))).status,422);
});
