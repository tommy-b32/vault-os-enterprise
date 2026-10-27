import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadHistoricalMovingAverageCogs } from "../lib/cogs/HistoricalMovingAverageCogsLoaderCore.ts";

const DRAFT = "8561c81d-03f0-4aea-a628-c9bd0e9a55c2";
const retained1074 = ["33f389d2-b140-43f7-a879-1aad5af900d3", "48dc6642-ea27-4719-b513-6a5e93ebc262"];
const retained1173 = ["04744b86-e3e4-44ba-826a-13f16b369c75", "42c5c80f-f5ce-46f8-bc61-4b25e116c465", "512cd290-2e0f-490e-8435-0dd147c82ef7", "64cb6ba9-9fe9-4e90-b6cd-6649895f42f5"];

async function canonicalSnapshot() {
  const input = JSON.parse(await readFile(new URL("../../../supabase/.temp/exclusive-tee-moving-average-input.json", import.meta.url), "utf8"));
  const resolutions = JSON.parse(await readFile(new URL("../../../supabase/.temp/exclusive-tee-moving-average-return-resolutions.json", import.meta.url), "utf8"));
  const orderFor = (id) => retained1074.includes(id) ? "order-1074" : retained1173.includes(id) ? "order-1173" : `order-${id}`;
  const sales = input.sales.map((sale) => ({ ...sale, quantity:sale.quantity || sale.refundedQuantity, orderId:`canonical-${sale.id}`, shopifyOrderId:orderFor(sale.id), shopifyLineItemId:`line-${sale.id}`, productId:"exclusive-tee-product", merchandiseClassId:"exclusive_tee", membershipEffectiveFrom:"2026-05-04", membershipEffectiveThrough:"2026-09-05" }));
  const observations = [], dispositions = [], links = [];
  for (const [subjectOrderLineId, resolution] of Object.entries(resolutions)) {
    const sale = sales.find((row) => row.id === subjectOrderLineId);
    const order = orderFor(subjectOrderLineId);
    const observationIds = retained1074.includes(subjectOrderLineId) ? ["obs-bberry"] : retained1173.includes(subjectOrderLineId) ? ["obs-monc", "obs-cd"] : [`obs-${subjectOrderLineId}`];
    for (const observationId of observationIds) {
      if (!observations.some((row) => row.id === observationId)) observations.push({ id:observationId, shopifyOrderId:order, shopifyLineItemId:resolution.disposition === "returned_restocked" ? sale.shopifyLineItemId : `${observationId}-other-line`, shopifyRefundId:`refund-${observationId}`, shopifyRefundLineItemId:`refund-line-${observationId}`, refundSourceUpdatedAt:"2026-09-22T18:16:45.468Z", quantity:resolution.disposition === "returned_restocked" ? sale.refundedQuantity : 1, restocked:true, source:"shopify", evidenceMode:"historical", currency:"GBP" });
    }
    const id = `disposition-${subjectOrderLineId}`;
    dispositions.push({ id, draftPolicyVersionId:DRAFT, subjectOrderLineId, disposition:resolution.disposition, ownerAttestation:"Test-only owner attestation", attestedByOperatorId:"operator-test", evidenceProvenance:"shopify_refund_line_observation_with_owner_attestation" });
    for (const observationId of observationIds) { const observation = observations.find((row) => row.id === observationId); links.push({ dispositionId:id, refundLineObservationId:observationId, shopifyOrderId:observation.shopifyOrderId, shopifyLineItemId:observation.shopifyLineItemId, refundedQuantity:observation.quantity, restocked:true, refundSourceUpdatedAt:observation.refundSourceUpdatedAt }); }
  }
  return {
    draft:{ id:DRAFT, status:"draft", merchandiseClassId:"exclusive_tee", salePeriodFrom:"2026-05-04", salePeriodThrough:"2026-09-05" },
    receipts:input.receipts.map((row, index) => ({ ...row, kind:index === 0 || index === 7 ? "governed_historical_delivery" : "legacy_supplier_batch", supplierName:"Exclusive", approvalRevision:index === 0 || index === 7 ? 2 : undefined, evidenceStatus:"valid_received", provenance:"Test-only canonical evidence fixture" })),
    sales,
    attributions:sales.filter((row) => row.existingPolicyCogsGbp !== null && row.existingPolicyCogsGbp !== undefined).map((row) => ({ orderLineId:row.id, policyVersionId:"existing-policy", totalPolicyDerivedCogsGbp:row.existingPolicyCogsGbp })),
    refundObservations:observations, dispositions, dispositionLinks:links,
  };
}

test("derives the frozen 402-line calculation exclusively from canonical snapshot rows", async () => {
  const snapshot = await canonicalSnapshot();
  const source = { loadCanonicalSnapshot: async () => snapshot };
  const result = await loadHistoricalMovingAverageCogs(source, DRAFT);
  assert.equal(result.state, "complete", result.missingDispositionSaleLineIds.join(","));
  assert.equal(result.result.saleLineCount, 402);
  assert.equal(result.result.calculatedLineCount, 388);
  assert.equal(result.result.returnedRestockedLineCount, 14);
  assert.equal(result.result.unresolvedLineCount, 0);
  assert.equal(result.result.simulatedCogsGbp, "4463.111463");
  assert.equal(result.result.closingInventoryUnits, 370);
  assert.equal(result.provenance.observationLinkCount, 24);
  assert.match(result.hashes.inputSha256, /^[a-f0-9]{64}$/);
  assert.match(result.hashes.resultSha256, /^[a-f0-9]{64}$/);
});

test("fails closed as incomplete when a governed retained-sale disposition is absent", async () => {
  const snapshot = await canonicalSnapshot();
  const missing = retained1074[0];
  const source = { loadCanonicalSnapshot: async () => ({ ...snapshot, dispositions:snapshot.dispositions.filter((row) => row.subjectOrderLineId !== missing), dispositionLinks:snapshot.dispositionLinks.filter((row) => row.dispositionId !== `disposition-${missing}`) }) };
  const result = await loadHistoricalMovingAverageCogs(source, DRAFT);
  assert.equal(result.state, "incomplete");
  assert.deepEqual(result.missingDispositionSaleLineIds, [missing]);
  assert.ok(result.result.exceptions.some((row) => row.id === missing && row.flags.includes("UNVERIFIED_RETURN_OR_ADJUSTMENT")));
});

test("derives unequivocal full returns from their exact canonical Shopify restock observations", async () => {
  const snapshot = await canonicalSnapshot();
  const returned = new Set(snapshot.dispositions.filter((row) => row.disposition === "returned_restocked").map((row) => row.id));
  const source = { loadCanonicalSnapshot: async () => ({ ...snapshot, dispositions:snapshot.dispositions.filter((row) => !returned.has(row.id)), dispositionLinks:snapshot.dispositionLinks.filter((row) => !returned.has(row.dispositionId)) }) };
  const result = await loadHistoricalMovingAverageCogs(source, DRAFT);
  assert.equal(result.state, "complete", result.missingDispositionSaleLineIds.join(","));
  assert.equal(result.provenance.dispositionCount, 6);
  assert.equal(result.result.returnedRestockedLineCount, 14);
});

test("rejects incomplete or stale child observation evidence", async () => {
  const snapshot = await canonicalSnapshot();
  const source = { loadCanonicalSnapshot: async () => ({ ...snapshot, dispositionLinks:snapshot.dispositionLinks.filter((row) => row.refundLineObservationId !== "obs-cd") }) };
  await assert.rejects(() => loadHistoricalMovingAverageCogs(source, DRAFT), /EVIDENCE_SET_INVALID/);
});
