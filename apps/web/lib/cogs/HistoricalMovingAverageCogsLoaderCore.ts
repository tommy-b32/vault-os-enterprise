import { createHash } from "node:crypto";
import { calculateHistoricalMovingAverageCogs, canonicalHistoricalMovingAverageOutput, europeLondonDate, type HistoricalMovingAverageResult, type HistoricalReceiptInput, type HistoricalRefundDispositionInput, type HistoricalSaleLineInput } from "./HistoricalMovingAverageCogs.ts";

type ReceiptKind = "legacy_supplier_batch" | "governed_historical_delivery";
export type HistoricalDraft = Readonly<{ id: string; status: string; merchandiseClassId: string; salePeriodFrom: string; salePeriodThrough: string }>;
export type CanonicalReceipt = HistoricalReceiptInput & Readonly<{ kind: ReceiptKind; supplierName: string; approvalRevision?: number; evidenceStatus: string; provenance: string }>;
export type CanonicalSaleLine = HistoricalSaleLineInput & Readonly<{ orderId: string; shopifyOrderId: string; shopifyLineItemId: string; productId: string; merchandiseClassId: string; membershipEffectiveFrom: string; membershipEffectiveThrough: string }>;
export type ExistingAttribution = Readonly<{ orderLineId: string; policyVersionId: string; totalPolicyDerivedCogsGbp: string | number }>;
export type RefundObservation = Readonly<{ id: string; shopifyOrderId: string; shopifyLineItemId: string | null; shopifyRefundId: string; shopifyRefundLineItemId: string; refundSourceUpdatedAt: string; quantity: number; restocked: boolean; source: string; evidenceMode: string; currency: string }>;
export type GovernedDisposition = Readonly<{ id: string; draftPolicyVersionId: string; subjectOrderLineId: string; disposition: "retained_sale" | "returned_restocked"; ownerAttestation: string; attestedByOperatorId: string; evidenceProvenance: string }>;
export type GovernedDispositionLink = Readonly<{ dispositionId: string; refundLineObservationId: string; shopifyOrderId: string; shopifyLineItemId: string | null; refundedQuantity: number; restocked: boolean; refundSourceUpdatedAt: string }>;
export type HistoricalMovingAverageCanonicalSnapshot = Readonly<{ draft: HistoricalDraft; receipts: readonly CanonicalReceipt[]; sales: readonly CanonicalSaleLine[]; attributions: readonly ExistingAttribution[]; refundObservations: readonly RefundObservation[]; dispositions: readonly GovernedDisposition[]; dispositionLinks: readonly GovernedDispositionLink[] }>;
export type HistoricalMovingAverageDataSource = Readonly<{ loadCanonicalSnapshot: (draftPolicyVersionId: string) => Promise<HistoricalMovingAverageCanonicalSnapshot> }>;
export type HistoricalMovingAverageLoadResult = Readonly<{ state: "complete" | "incomplete"; draftPolicyVersionId: string; result: HistoricalMovingAverageResult; hashes: Readonly<{ inputSha256: string; resultSha256: string; engineSha256: string; perLineSha256: string }>; sourceEvidence: HistoricalMovingAverageCanonicalSnapshot; missingDispositionSaleLineIds: readonly string[]; provenance: Readonly<{ legacyReceiptCount: number; governedReceiptCount: number; dispositionCount: number; observationLinkCount: number }> }>;

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const nonEmpty = (value: unknown, error: string): string => { if (typeof value !== "string" || !value.trim()) throw new Error(error); return value; };
const unique = <T extends { id: string }>(rows: readonly T[], label: string) => { const ids = new Set<string>(); for (const row of rows) { const id = nonEmpty(row.id, `Invalid ${label} identity`); if (ids.has(id)) throw new Error(`Duplicate ${label} identity: ${id}`); ids.add(id); } };

function validateReceipts(rows: readonly CanonicalReceipt[]): HistoricalReceiptInput[] {
  unique(rows, "receipt");
  const legacy = rows.filter((row) => row.kind === "legacy_supplier_batch"), governed = rows.filter((row) => row.kind === "governed_historical_delivery");
  if (rows.length !== 8 || legacy.length !== 6 || governed.length !== 2) throw new Error("HISTORICAL_COGS_PREVIEW_RECEIPT_MEMBERSHIP_INVALID");
  for (const row of rows) {
    if (row.supplierName !== "Exclusive" || row.evidenceStatus !== "valid_received" || !row.provenance.trim()) throw new Error("HISTORICAL_COGS_PREVIEW_RECEIPT_EVIDENCE_INVALID");
    if (row.kind === "governed_historical_delivery" && (!Number.isSafeInteger(row.approvalRevision) || (row.approvalRevision ?? 0) < 2)) throw new Error("HISTORICAL_COGS_PREVIEW_GOVERNED_RECEIPT_REVISION_INVALID");
  }
  return rows.map(({ id, receivedDate, quantity, landedGbp }) => ({ id, receivedDate, quantity, landedGbp }));
}

function deriveSales(snapshot: HistoricalMovingAverageCanonicalSnapshot): HistoricalSaleLineInput[] {
  unique(snapshot.sales, "sale line");
  const attribution = new Map<string, ExistingAttribution>();
  for (const row of snapshot.attributions) { if (attribution.has(row.orderLineId)) throw new Error(`Duplicate existing attribution: ${row.orderLineId}`); attribution.set(row.orderLineId, row); }
  return snapshot.sales.map((sale) => {
    const saleDate = europeLondonDate(sale.saleTimestamp);
    if (sale.merchandiseClassId !== "exclusive_tee" || !sale.productId || !sale.orderId || !sale.shopifyOrderId || !sale.shopifyLineItemId || sale.membershipEffectiveFrom > sale.membershipEffectiveThrough || saleDate < sale.membershipEffectiveFrom || saleDate > sale.membershipEffectiveThrough) throw new Error("HISTORICAL_COGS_PREVIEW_SALE_IDENTITY_INVALID");
    return { id: sale.id, saleTimestamp: sale.saleTimestamp, quantity: sale.quantity, mapped: true, refundedQuantity: sale.refundedQuantity ?? 0, orderRefundsGbp: sale.orderRefundsGbp ?? "0", existingPolicyCogsGbp: attribution.get(sale.id)?.totalPolicyDerivedCogsGbp ?? null };
  });
}

function deriveDispositions(snapshot: HistoricalMovingAverageCanonicalSnapshot): { inputs: Record<string, HistoricalRefundDispositionInput>; missing: string[] } {
  unique(snapshot.dispositions, "refund disposition"); unique(snapshot.refundObservations, "refund observation");
  const sales = new Map(snapshot.sales.map((sale) => [sale.id, sale])), observations = new Map(snapshot.refundObservations.map((observation) => [observation.id, observation]));
  const links = new Map<string, GovernedDispositionLink[]>();
  for (const link of snapshot.dispositionLinks) links.set(link.dispositionId, [...(links.get(link.dispositionId) ?? []), link]);
  const inputs: Record<string, HistoricalRefundDispositionInput> = {};
  for (const disposition of snapshot.dispositions) {
    if (disposition.draftPolicyVersionId !== snapshot.draft.id || !disposition.ownerAttestation.trim() || !disposition.attestedByOperatorId || disposition.evidenceProvenance !== "shopify_refund_line_observation_with_owner_attestation") throw new Error("HISTORICAL_COGS_PREVIEW_DISPOSITION_INVALID");
    const subject = sales.get(disposition.subjectOrderLineId); if (!subject) throw new Error("HISTORICAL_COGS_PREVIEW_DISPOSITION_SUBJECT_INVALID");
    const selected = links.get(disposition.id) ?? [];
    if (!selected.length || new Set(selected.map((link) => link.refundLineObservationId)).size !== selected.length) throw new Error("HISTORICAL_COGS_PREVIEW_DISPOSITION_LINKS_INCOMPLETE");
    const expected = snapshot.refundObservations.filter((row) => row.shopifyOrderId === subject.shopifyOrderId && row.source === "shopify" && row.evidenceMode === "historical" && row.currency === "GBP" && row.quantity > 0).map((row) => row.id).sort();
    const actual = selected.map((link) => link.refundLineObservationId).sort();
    if (!expected.length || expected.join(",") !== actual.join(",")) throw new Error("HISTORICAL_COGS_PREVIEW_DISPOSITION_EVIDENCE_SET_INVALID");
    for (const link of selected) { const observation = observations.get(link.refundLineObservationId); if (!observation || observation.shopifyOrderId !== subject.shopifyOrderId || observation.shopifyOrderId !== link.shopifyOrderId || observation.shopifyLineItemId !== link.shopifyLineItemId || observation.quantity !== link.refundedQuantity || observation.refundSourceUpdatedAt !== link.refundSourceUpdatedAt || !observation.restocked || !link.restocked) throw new Error("HISTORICAL_COGS_PREVIEW_DISPOSITION_LINK_STALE_OR_CONFLICTING"); }
    if (disposition.disposition === "retained_sale") { if ((subject.refundedQuantity ?? 0) !== 0 || selected.some((link) => link.shopifyLineItemId === subject.shopifyLineItemId)) throw new Error("HISTORICAL_COGS_PREVIEW_RETAINED_DISPOSITION_INVALID"); }
    else if (selected.length !== 1 || selected[0].shopifyLineItemId !== subject.shopifyLineItemId || selected[0].refundedQuantity !== subject.refundedQuantity) throw new Error("HISTORICAL_COGS_PREVIEW_RETURNED_DISPOSITION_INVALID");
    inputs[subject.id] = { disposition: disposition.disposition, refundObservationIds: actual };
  }
  // A line-level, full-quantity Shopify return with a verified restock is already
  // canonical evidence of a zero-net sale. It needs no owner attestation; only
  // ambiguous order-level refunds (the six retained-sale cases) need one.
  for (const sale of snapshot.sales) {
    if (inputs[sale.id] || (sale.refundedQuantity ?? 0) <= 0 || sale.refundedQuantity !== sale.quantity) continue;
    const observationsForLine = snapshot.refundObservations.filter((row) => row.shopifyOrderId === sale.shopifyOrderId && row.shopifyLineItemId === sale.shopifyLineItemId && row.source === "shopify" && row.evidenceMode === "historical" && row.currency === "GBP" && row.restocked && row.quantity === sale.refundedQuantity);
    if (observationsForLine.length === 1) inputs[sale.id] = { disposition: "returned_restocked", refundObservationIds: [observationsForLine[0].id] };
  }
  const missing = snapshot.sales.filter((sale) => ((sale.refundedQuantity ?? 0) > 0 || Number(sale.orderRefundsGbp ?? 0) > 0) && !inputs[sale.id]).map((sale) => sale.id).sort();
  return { inputs, missing };
}

/** Pure validation/derivation core; server entrypoint exports this under a server-only boundary. */
export async function loadHistoricalMovingAverageCogs(source: HistoricalMovingAverageDataSource, draftPolicyVersionId: string): Promise<HistoricalMovingAverageLoadResult> {
  const snapshot = await source.loadCanonicalSnapshot(draftPolicyVersionId);
  if (snapshot.draft.id !== draftPolicyVersionId || snapshot.draft.status !== "draft" || snapshot.draft.merchandiseClassId !== "exclusive_tee") throw new Error("HISTORICAL_COGS_PREVIEW_DRAFT_INVALID");
  const receipts = validateReceipts(snapshot.receipts), sales = deriveSales(snapshot), { inputs: refundDispositions, missing } = deriveDispositions(snapshot);
  const result = calculateHistoricalMovingAverageCogs({ receipts, sales, refundDispositions });
  return { state: missing.length === 0 && result.unresolvedLineCount === 0 ? "complete" : "incomplete", draftPolicyVersionId, result, hashes:{ inputSha256:digest(JSON.stringify({ draft:snapshot.draft, receipts, sales, refundDispositions })), resultSha256:digest(canonicalHistoricalMovingAverageOutput(result)), engineSha256:digest("historical-moving-average-cogs-engine-v1"), perLineSha256:digest(JSON.stringify(result.lines)) }, sourceEvidence:snapshot, missingDispositionSaleLineIds:missing, provenance:{ legacyReceiptCount:snapshot.receipts.filter((row) => row.kind === "legacy_supplier_batch").length, governedReceiptCount:snapshot.receipts.filter((row) => row.kind === "governed_historical_delivery").length, dispositionCount:snapshot.dispositions.length, observationLinkCount:snapshot.dispositionLinks.length } };
}
