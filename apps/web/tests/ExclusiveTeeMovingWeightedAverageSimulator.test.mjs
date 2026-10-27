import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { londonDate, simulateMovingAverage } from "../../../scripts/local-analysis/ExclusiveTeeMovingWeightedAverageSimulator.mjs";
import { calculateHistoricalMovingAverageCogs, canonicalHistoricalMovingAverageOutput } from "../lib/cogs/HistoricalMovingAverageCogs.ts";

const receipt = (id, receivedDate, quantity, landedGbp) => ({ id, receivedDate, quantity, landedGbp });
const sale = (id, saleTimestamp, quantity, extra = {}) => ({ id, saleTimestamp, quantity, mapped: true, refundedQuantity: 0, orderRefundsGbp: 0, ...extra });

test("uses only earlier receipts and consumes their moving average exactly", () => {
  const result = simulateMovingAverage({ receipts:[receipt("r1","2026-04-09",10,"100.00"),receipt("r2","2026-09-10",10,"200.00")], sales:[sale("s1","2026-05-01T10:00:00Z",4),sale("s2","2026-09-05T10:00:00Z",2)] });
  assert.equal(result.simulatedCogsGbp,"60.000000"); assert.equal(result.closingInventoryUnits,14); assert.equal(result.closingInventoryLandedGbp,"240.000000");
});
test("does not use a same-day date-only receipt and fails closed on stock", () => {
  const result = simulateMovingAverage({ receipts:[receipt("r1","2026-05-01",5,"50.00")], sales:[sale("s1","2026-05-01T10:00:00Z",1)] });
  assert.equal(result.unresolvedLineCount,1); assert.deepEqual(result.exceptions[0].flags,["SAME_DAY_RECEIPT_ORDER_AMBIGUOUS","INSUFFICIENT_STOCK"]);
});
test("flags mapping and return uncertainty without inventing a cost", () => {
  const result = simulateMovingAverage({ receipts:[receipt("r1","2026-04-01",5,"50.00")], sales:[sale("missing","2026-05-01T10:00:00Z",1,{mapped:false}),sale("refund","2026-05-02T10:00:00Z",1,{refundedQuantity:1})] });
  assert.equal(result.calculatedLineCount,0); assert.equal(result.unresolvedLineCount,2); assert.equal(result.lines[0].simulatedCogsGbp,null); assert.equal(result.lines[1].simulatedCogsGbp,null);
});
test("retains fractional-pence value until reporting, without cumulative rounding", () => {
  const result = simulateMovingAverage({ receipts:[receipt("r1","2026-04-01",3,"1.00")], sales:[sale("s1","2026-05-01T10:00:00Z",1),sale("s2","2026-05-02T10:00:00Z",1),sale("s3","2026-05-03T10:00:00Z",1)] });
  assert.equal(result.simulatedCogsGbp,"1.000000"); assert.equal(result.closingInventoryUnits,0); assert.equal(result.closingInventoryLandedGbp,"0.000000");
});
test("uses London calendar dates across BST and GMT boundaries", () => {
  assert.equal(londonDate("2026-06-22T23:03:40Z"), "2026-06-23");
  assert.equal(londonDate("2026-03-29T00:30:00Z"), "2026-03-29");
  assert.equal(londonDate("2026-10-24T23:30:00Z"), "2026-10-25");
  assert.equal(londonDate("2026-10-25T23:30:00Z"), "2026-10-25");
});
test("flags a London same-day receipt without using it before the sale", () => {
  const result = simulateMovingAverage({ receipts:[receipt("r1","2026-06-23",1,"10.00")], sales:[sale("s1","2026-06-22T23:03:40Z",1)] });
  assert.equal(result.unresolvedLineCount,1); assert.deepEqual(result.exceptions[0].flags,["SAME_DAY_RECEIPT_ORDER_AMBIGUOUS","INSUFFICIENT_STOCK"]);
});
test("enforces next-London-day eligibility rather than accepting receipt-before-sale", () => {
  const input = { receipts:[receipt("r1","2026-05-01",1,"10.00")], sales:[sale("s1","2026-05-01T10:00:00Z",1)] };
  const failClosed = simulateMovingAverage(input);
  assert.equal(failClosed.unresolvedLineCount,1);
  assert.throws(() => simulateMovingAverage({ ...input, sameDayReceiptOrdering:"receipt_before_sale" }), /only permits next-London-day/);
});
test("accepts documented retained-sale resolution without treating an order refund as stock movement", () => {
  const sales = [sale("retained","2026-05-01T10:00:00Z",1,{orderRefundsGbp:"10.00"})];
  const result = simulateMovingAverage({ receipts:[receipt("r1","2026-04-01",1,"10.00")], sales, returnResolutions:{ retained:{ disposition:"retained_sale", shopifyRefundEvidence:"item-level screenshot identifies another line", ownerRestockEvidence:"owner confirms the other line was restocked" } } });
  assert.equal(result.calculatedLineCount,1); assert.equal(result.lines[0].returnDisposition,"retained_sale");
  assert.throws(() => simulateMovingAverage({ receipts:[receipt("r1","2026-04-01",1,"10.00")], sales:[sale("bad","2026-05-01T10:00:00Z",1,{refundedQuantity:1})], returnResolutions:{ bad:{ disposition:"retained_sale", shopifyRefundEvidence:"x", ownerRestockEvidence:"y" } } }), /contradicts refunded quantity/);
});
test("excludes a fully refunded and Shopify-restocked line without adding stock twice", () => {
  const result = simulateMovingAverage({ receipts:[receipt("r1","2026-04-01",1,"10.00")], sales:[sale("returned","2026-05-01T10:00:00Z",1,{refundedQuantity:1})], returnResolutions:{ returned:{ disposition:"returned_restocked", shopifyRefundEvidence:"immutable Shopify refund line: quantity 1, restocked true" } } });
  assert.equal(result.returnedRestockedLineCount,1); assert.equal(result.calculatedLineCount,0); assert.equal(result.closingInventoryUnits,1);
});

test("rejects duplicate identities and never permits duplicate stock consumption", () => {
  const input = { receipts:[receipt("r1","2026-04-01",2,"20.00")], sales:[sale("s1","2026-05-01T10:00:00Z",1), sale("s1","2026-05-02T10:00:00Z",1)] };
  assert.throws(() => calculateHistoricalMovingAverageCogs(input), /Duplicate sale line identity/);
});

test("rejects malformed quantities and inconsistent disposition identities", () => {
  const base = { receipts:[receipt("r1","2026-04-01",2,"20.00")], sales:[sale("s1","2026-05-01T10:00:00Z",1)] };
  assert.throws(() => calculateHistoricalMovingAverageCogs({ ...base, sales:[sale("s1","2026-05-01T10:00:00Z",1.5)] }), /Invalid sale quantity/);
  assert.throws(() => calculateHistoricalMovingAverageCogs({ ...base, refundDispositions:{ unknown:{ disposition:"retained_sale", refundObservationIds:["o1"] } } }), /unknown sale line/);
});

test("is deterministic and preserves the frozen Exclusive Tee regression", async () => {
  const fixture = JSON.parse(await readFile(new URL("../../../supabase/.temp/exclusive-tee-moving-average-input.json", import.meta.url), "utf8"));
  const dispositions = JSON.parse(await readFile(new URL("../../../supabase/.temp/exclusive-tee-moving-average-return-resolutions.json", import.meta.url), "utf8"));
  const first = calculateHistoricalMovingAverageCogs({ ...fixture, refundDispositions: dispositions });
  const second = calculateHistoricalMovingAverageCogs({ ...fixture, refundDispositions: dispositions });
  assert.equal(canonicalHistoricalMovingAverageOutput(first), canonicalHistoricalMovingAverageOutput(second));
  assert.equal(first.saleLineCount, 402);
  assert.equal(first.calculatedLineCount, 388);
  assert.equal(first.returnedRestockedLineCount, 14);
  assert.equal(first.unresolvedLineCount, 0);
  assert.equal(first.flagCounts.SAME_DAY_RECEIPT_ORDER_AMBIGUOUS, 22);
  assert.equal(first.simulatedCogsGbp, "4463.111463");
  assert.equal(first.closingInventoryUnits, 370);
});
