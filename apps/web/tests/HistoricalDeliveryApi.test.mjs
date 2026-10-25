import assert from "node:assert/strict";
import test from "node:test";
import { createHistoricalDeliveryHandler } from "../lib/cogs/HistoricalDeliveryHttp.ts";
import { HistoricalDeliveryService } from "../lib/cogs/HistoricalDeliveryService.ts";
import { InMemoryHistoricalDeliveryRepository } from "../lib/cogs/HistoricalDeliveryRepository.ts";

const operatorId = "00000000-0000-4000-8000-000000000001";
const supplierId = "00000000-0000-4000-8000-000000000002";
const receipt = { supplier:"Exclusive", costClass:"exclusive_tee", orderDate:"2026-04-05", receivedDate:"2026-04-09", quantity:90, goods:824.4, shipping:325, statedTotal:1149.4, status:"RECEIVED", reference:"api-test-receipt", sourceDocumentReference:"api-test-document" };
class AuthError extends Error { constructor(reason) { super(reason); this.reason=reason; } }
const request = (body) => new Request("http://local.test/api/cogs/historical-deliveries", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body) });
const handler = (service, authorize=async()=>({id:operatorId})) => createHistoricalDeliveryHandler({ requireOperator:authorize, isOperatorAuthorizationError:(error)=>error instanceof AuthError, loadClasses:async()=>new Set(["exclusive_tee"]), createService:()=>service });

test("unauthenticated historical receipt requests do not invoke a service", async () => {
  let created=false; const response=await handler({persist:async()=>{created=true;}},async()=>{throw new AuthError("unauthenticated");})(request({action:"stage"}));
  assert.equal(response.status,401); assert.equal(created,false);
});

test("the handler derives the actor and rejects client operator impersonation", async () => {
  let context=null; const service={persist:async(_input, value)=>{context=value;return "00000000-0000-4000-8000-000000000003";}};
  const body={action:"stage",supplierId,merchandiseClassId:"exclusive_tee",receipt};
  const accepted=await handler(service)(request(body)); assert.equal(accepted.status,201); assert.equal(context.enteredByOperatorId,operatorId);
  const rejected=await handler(service)(request({...body,operatorId:"00000000-0000-4000-8000-000000000099"})); assert.equal(rejected.status,400);
});

test("invalid evidence remains unapprovable and stale revisions fail closed", async () => {
  const service=new HistoricalDeliveryService(new Set(["exclusive_tee"]),new InMemoryHistoricalDeliveryRepository()); const h=handler(service);
  const invalid=await h(request({action:"stage",supplierId,merchandiseClassId:"exclusive_tee",receipt:{...receipt,reference:"invalid",statedTotal:1}})); const {id:invalidId}=await invalid.json();
  assert.equal((await h(request({action:"approve",batchId:invalidId,expectedRevision:1,note:"reviewed"}))).status,422);
  const valid=await h(request({action:"stage",supplierId,merchandiseClassId:"exclusive_tee",receipt:{...receipt,reference:"stale"}})); const {id}=await valid.json();
  assert.equal((await h(request({action:"correct",batchId:id,expectedRevision:2,field:"note",value:"x",reason:"source clarification"}))).status,409);
});

test("valid evidence stages and approves through the authenticated service", async () => {
  const service=new HistoricalDeliveryService(new Set(["exclusive_tee"]),new InMemoryHistoricalDeliveryRepository()); const h=handler(service);
  const staged=await h(request({action:"stage",supplierId,merchandiseClassId:"exclusive_tee",receipt:{...receipt,reference:"approved"}})); const {id}=await staged.json();
  const approved=await h(request({action:"approve",batchId:id,expectedRevision:1,note:"document reviewed"}));
  assert.equal(approved.status,200); assert.deepEqual(await approved.json(),{status:"approved",revision:2});
});
