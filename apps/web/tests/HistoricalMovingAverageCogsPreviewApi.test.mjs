import assert from "node:assert/strict";
import test from "node:test";
import { createHistoricalMovingAverageCogsPreviewHandler } from "../lib/cogs/HistoricalMovingAverageCogsPreviewHttp.ts";

const draftId = "8561c81d-03f0-4aea-a628-c9bd0e9a55c2";
const receipt = (id, kind, day) => ({ id, kind, receivedDate:day, quantity:1, landedGbp:"10.00", supplierName:"Exclusive", approvalRevision:kind === "governed_historical_delivery" ? 2 : undefined, evidenceStatus:"valid_received", provenance:"canonical test evidence" });
const snapshot = (refunded = 0) => ({
  draft:{ id:draftId, status:"draft", merchandiseClassId:"exclusive_tee", salePeriodFrom:"2026-05-01", salePeriodThrough:"2026-09-30" },
  receipts:[receipt("legacy-1","legacy_supplier_batch","2026-05-01"),receipt("legacy-2","legacy_supplier_batch","2026-05-02"),receipt("legacy-3","legacy_supplier_batch","2026-05-03"),receipt("legacy-4","legacy_supplier_batch","2026-05-04"),receipt("legacy-5","legacy_supplier_batch","2026-05-05"),receipt("legacy-6","legacy_supplier_batch","2026-05-06"),receipt("governed-1","governed_historical_delivery","2026-05-07"),receipt("governed-2","governed_historical_delivery","2026-05-08")],
  sales:[{ id:"sale-1", saleTimestamp:"2026-05-09T10:00:00Z", quantity:1, mapped:true, refundedQuantity:refunded, orderRefundsGbp:refunded ? "10.00" : "0", orderId:"order-1", shopifyOrderId:"shopify-order-1", shopifyLineItemId:"shopify-line-1", productId:"product-1", merchandiseClassId:"exclusive_tee", membershipEffectiveFrom:"2026-05-01", membershipEffectiveThrough:"2026-09-30" }],
  attributions:[{ orderLineId:"sale-1", policyVersionId:"active-policy", totalPolicyDerivedCogsGbp:"10.00" }], refundObservations:[], dispositions:[], dispositionLinks:[],
});
const authError = (reason) => Object.assign(new Error(reason), { reason });
const request = (id = draftId) => new Request(`http://local/api/cogs/historical-cogs-preview?draftId=${id}`);

test("rejects unauthenticated and malformed preview requests before a source read", async () => {
  let reads = 0;
  const handler = createHistoricalMovingAverageCogsPreviewHandler({ requireOperator:async () => { throw authError("unauthenticated"); }, isOperatorAuthorizationError:(error) => error?.reason === "unauthenticated", source:{ loadCanonicalSnapshot:async () => { reads += 1; return snapshot(); } } });
  assert.equal((await handler(request())).status, 401); assert.equal(reads, 0);
  const authorised = createHistoricalMovingAverageCogsPreviewHandler({ requireOperator:async () => ({ id:"operator" }), isOperatorAuthorizationError:() => false, source:{ loadCanonicalSnapshot:async () => { reads += 1; return snapshot(); } } });
  assert.equal((await authorised(request("bad"))).status, 400); assert.equal(reads, 0);
});

test("returns deterministic read-only complete summaries without rows or write operations", async () => {
  let reads = 0;
  const handler = createHistoricalMovingAverageCogsPreviewHandler({ requireOperator:async () => ({ id:"operator" }), isOperatorAuthorizationError:() => false, source:{ loadCanonicalSnapshot:async () => { reads += 1; return snapshot(); } } });
  const first = await (await handler(request())).json(), second = await (await handler(request())).json();
  assert.equal(first.status, "complete"); assert.deepEqual(first, second); assert.equal(first.counts.sales, 1); assert.equal(first.missingEvidence.dispositionSaleLineIds.length, 0); assert.equal("lines" in first, false); assert.equal(reads, 2);
});

test("reports an incomplete governed record without substituting an owner statement", async () => {
  const handler = createHistoricalMovingAverageCogsPreviewHandler({ requireOperator:async () => ({ id:"operator" }), isOperatorAuthorizationError:() => false, source:{ loadCanonicalSnapshot:async () => snapshot(1) } });
  const response = await handler(request()), body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.status, "incomplete"); assert.deepEqual(body.missingEvidence.dispositionSaleLineIds, ["sale-1"]);
});
