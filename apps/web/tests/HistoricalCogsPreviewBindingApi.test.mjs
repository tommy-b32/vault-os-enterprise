import assert from "node:assert/strict";
import test from "node:test";
import { createHistoricalMovingAverageCogsPreviewPersistenceHandler } from "../lib/cogs/HistoricalMovingAverageCogsPreviewHttp.ts";
import { createHistoricalCogsSimulationReviewApprovalFromPreviewHandler, createHistoricalCogsSimulationReviewFromPreviewHandler } from "../lib/cogs/HistoricalCogsSimulationReviewHttp.ts";

const draftId="8561c81d-03f0-4aea-a628-c9bd0e9a55c2", previewId="11111111-1111-4111-8111-111111111111", reviewId="22222222-2222-4222-8222-222222222222";
const complete={ draft:{id:draftId,status:"draft",merchandiseClassId:"exclusive_tee",salePeriodFrom:"2026-05-01",salePeriodThrough:"2026-09-30"}, receipts:Array.from({length:8},(_,i)=>({id:`r${i}`,kind:i<6?"legacy_supplier_batch":"governed_historical_delivery",receivedDate:"2026-05-01",quantity:1,landedGbp:"1.00",supplierName:"Exclusive",approvalRevision:i<6?undefined:2,evidenceStatus:"valid_received",provenance:"test"})), sales:[],attributions:[],refundObservations:[],dispositions:[],dispositionLinks:[] };
const request=(id=draftId)=>new Request(`http://local/api/cogs/historical-cogs-preview?draftId=${id}`,{method:"POST"});

test("preview persistence rejects incomplete data and does not invoke its guarded RPC",async()=>{
 let writes=0; const handler=createHistoricalMovingAverageCogsPreviewPersistenceHandler({requireOperator:async()=>({id:"operator"}),isOperatorAuthorizationError:()=>false,source:{loadCanonicalSnapshot:async()=>({...complete,sales:[{id:"sale",saleTimestamp:"2026-05-09T10:00:00Z",quantity:1,mapped:true,refundedQuantity:1,orderRefundsGbp:"1",orderId:"o",shopifyOrderId:"so",shopifyLineItemId:"sl",productId:"p",merchandiseClassId:"exclusive_tee",membershipEffectiveFrom:"2026-05-01",membershipEffectiveThrough:"2026-09-30"}]} )},persist:async()=>{writes++;return previewId;}});
 assert.equal((await handler(request())).status,422);assert.equal(writes,0);
});
test("review and approval accept only server-bound preview identifiers",async()=>{
 let reviewCalls=0,approvalCalls=0;const review=createHistoricalCogsSimulationReviewFromPreviewHandler({requireOperator:async()=>({id:"operator"}),isOperatorAuthorizationError:()=>false,createReviewFromPreview:async(id)=>{reviewCalls++;assert.equal(id,previewId);return reviewId;}});const approval=createHistoricalCogsSimulationReviewApprovalFromPreviewHandler({requireOperator:async()=>({id:"owner"}),isOperatorAuthorizationError:()=>false,approveReviewFromPreview:async(r,p,n)=>{approvalCalls++;assert.deepEqual([r,p,n],[reviewId,previewId,"approve"]);return "approval";}});
 assert.equal((await review(new Request("http://local",{method:"POST",body:JSON.stringify({previewId})}))).status,201);assert.equal((await approval(new Request("http://local",{method:"POST",body:JSON.stringify({reviewId,previewId,approvalNote:"approve"})}))).status,201);assert.equal(reviewCalls,1);assert.equal(approvalCalls,1);
});
