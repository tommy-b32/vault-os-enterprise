import assert from "node:assert/strict";
import test from "node:test";
import { createHistoricalDeliveryHandler, createHistoricalDeliveryReadHandler } from "../lib/cogs/HistoricalDeliveryHttp.ts";
import { HistoricalDeliveryService } from "../lib/cogs/HistoricalDeliveryService.ts";
import { InMemoryHistoricalDeliveryRepository } from "../lib/cogs/HistoricalDeliveryRepository.ts";

const operatorId = "00000000-0000-4000-8000-000000000001";
const supplierId = "00000000-0000-4000-8000-000000000002";
const receipt = { supplier:"Exclusive", costClass:"exclusive_tee", orderDate:"2026-04-05", receivedDate:"2026-04-09", quantity:90, goods:824.4, shipping:325, statedTotal:1149.4, status:"RECEIVED", reference:"api-test-receipt", sourceDocumentReference:"api-test-document" };
class AuthError extends Error { constructor(reason) { super(reason); this.reason=reason; } }
const request = (body) => new Request("http://local.test/api/cogs/historical-deliveries", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body) });
const handler = (service, authorize=async()=>({id:operatorId})) => createHistoricalDeliveryHandler({ requireOperator:authorize, isOperatorAuthorizationError:(error)=>error instanceof AuthError, loadClasses:async()=>new Set(["exclusive_tee"]), createService:()=>service });
const reader = (service, authorize=async()=>({id:operatorId})) => createHistoricalDeliveryReadHandler({ requireOperator:authorize, isOperatorAuthorizationError:(error)=>error instanceof AuthError, loadClasses:async()=>new Set(["exclusive_tee"]), createService:()=>service });
const getRequest = (query="") => new Request(`http://local.test/api/cogs/historical-deliveries${query}`, { method:"GET" });

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

test("read endpoint rejects unauthenticated and forbidden operators without reading batches", async () => {
  let reads=0; const service={list:async()=>{reads++;return []}};
  assert.equal((await reader(service,async()=>{throw new AuthError("unauthenticated");})(getRequest())).status,401);
  assert.equal((await reader(service,async()=>{throw new AuthError("forbidden");})(getRequest())).status,403);
  assert.equal(reads,0);
});

test("read endpoint returns bounded, deterministic pages and a receipt review record", async () => {
  const service=new HistoricalDeliveryService(new Set(["exclusive_tee"]),new InMemoryHistoricalDeliveryRepository());
  const write=handler(service);
  const ids=[];
  for (const reference of ["read-a","read-b","read-c"]) {
    const response=await write(request({action:"stage",supplierId,merchandiseClassId:"exclusive_tee",receipt:{...receipt,reference}}));
    ids.push((await response.json()).id);
  }
  const read=reader(service);
  const page=await read(getRequest("?limit=2&offset=0")); const body=await page.json();
  assert.equal(page.status,200); assert.equal(body.items.length,2); assert.equal(body.limit,2); assert.equal(body.offset,0);
  const detail=await read(getRequest(`?id=${ids[0]}`)); const detailBody=await detail.json();
  assert.equal(detail.status,200); assert.equal(detailBody.item.id,ids[0]); assert.equal(detailBody.item.revision,1); assert.deepEqual(detailBody.item.corrections,[]);
  assert.equal((await read(getRequest("?limit=51"))).status,400);
  assert.equal((await read(getRequest("?id=not-a-uuid"))).status,400);
});
