import "server-only";

import type { CanonicalReceipt, CanonicalSaleLine, ExistingAttribution, GovernedDisposition, GovernedDispositionLink, HistoricalMovingAverageCanonicalSnapshot, HistoricalMovingAverageDataSource, RefundObservation } from "./HistoricalMovingAverageCogsLoader.ts";

type Result = { data: unknown[] | null; error: { message: string } | null };
type Query = { eq(column: string, value: unknown): Query; in(column: string, values: readonly unknown[]): Query; gte(column: string, value: unknown): Query; lte(column: string, value: unknown): Query } & PromiseLike<Result>;
type ReadClient = { from(table: string): { select(columns: string): Query } };
const rows = async (query: Query, failure: string): Promise<Record<string, unknown>[]> => { const { data, error } = await query; if (error) throw new Error(failure); if (!Array.isArray(data)) throw new Error(failure); return data.filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row)); };
const chunkedRows = async (values: readonly string[], query: (chunk: readonly string[]) => Query, failure: string): Promise<Record<string, unknown>[]> => {
  const result: Record<string, unknown>[] = [];
  for (let index = 0; index < values.length; index += 75) result.push(...await rows(query(values.slice(index, index + 75)), failure));
  return result;
};
const text = (row: Record<string, unknown>, field: string): string => { const value = row[field]; if (typeof value !== "string" || !value.trim()) throw new Error(`HISTORICAL_COGS_PREVIEW_${field.toUpperCase()}_INVALID`); return value; };
const positiveInteger = (row: Record<string, unknown>, field: string): number => { const value = Number(row[field]); if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`HISTORICAL_COGS_PREVIEW_${field.toUpperCase()}_INVALID`); return value; };
const ids = (items: readonly Record<string, unknown>[]): string[] => items.map((row) => text(row, "id"));

/**
 * Bounded server-side reader. It only issues SELECTs and never accepts
 * financial inputs from an HTTP request.
 */
export class SupabaseHistoricalMovingAverageCogsPreviewRepository implements HistoricalMovingAverageDataSource {
  #client: ReadClient;
  constructor(client: object) { this.#client = client as ReadClient; }

  async loadCanonicalSnapshot(draftId: string): Promise<HistoricalMovingAverageCanonicalSnapshot> {
    const version = (await rows(this.#client.from("vault_historical_cogs_policy_versions").select("id,policy_id,status,sale_period_from,sale_period_through").eq("id", draftId), "HISTORICAL_COGS_PREVIEW_DRAFT_READ_FAILED"))[0];
    if (!version) throw new Error("HISTORICAL_COGS_PREVIEW_DRAFT_NOT_FOUND");
    const policy = (await rows(this.#client.from("vault_historical_cogs_policies").select("id,merchandise_class_id").eq("id", text(version, "policy_id")), "HISTORICAL_COGS_PREVIEW_POLICY_READ_FAILED"))[0];
    if (!policy) throw new Error("HISTORICAL_COGS_PREVIEW_POLICY_NOT_FOUND");
    const draft = { id:text(version,"id"), status:text(version,"status"), merchandiseClassId:text(policy,"merchandise_class_id"), salePeriodFrom:text(version,"sale_period_from"), salePeriodThrough:text(version,"sale_period_through") };

    const legacyLinks = await rows(this.#client.from("vault_historical_cogs_policy_batch_evidence").select("batch_evidence_id").eq("policy_version_id", draftId), "HISTORICAL_COGS_PREVIEW_LEGACY_LINK_READ_FAILED");
    const governedLinks = await rows(this.#client.from("vault_historical_cogs_policy_governed_delivery_evidence").select("delivery_batch_id,approval_revision").eq("policy_version_id", draftId), "HISTORICAL_COGS_PREVIEW_GOVERNED_LINK_READ_FAILED");
    const legacyIds = legacyLinks.map((row) => text(row,"batch_evidence_id")), governedIds = governedLinks.map((row) => text(row,"delivery_batch_id"));
    const legacy = legacyIds.length ? await rows(this.#client.from("vault_historical_supplier_batch_evidence").select("id,received_date,quantity,landed_total_gbp,merchandise_class_id,evidence_status,documentary_provenance,supplier_id").in("id", legacyIds), "HISTORICAL_COGS_PREVIEW_LEGACY_RECEIPT_READ_FAILED") : [];
    const governed = governedIds.length ? await rows(this.#client.from("vault_historical_delivery_cost_batches").select("id,received_at,received_quantity,landed_cost_gbp,merchandise_class_id,validation_status,approval_status,receipt_status,revision,source_document_reference,supplier_id").in("id", governedIds), "HISTORICAL_COGS_PREVIEW_GOVERNED_RECEIPT_READ_FAILED") : [];
    const supplierIds = [...new Set([...legacy, ...governed].map((row) => text(row,"supplier_id")))];
    const suppliers = supplierIds.length ? await rows(this.#client.from("vault_suppliers").select("id,supplier_name").in("id", supplierIds), "HISTORICAL_COGS_PREVIEW_SUPPLIER_READ_FAILED") : [];
    const supplierName = new Map(suppliers.map((row) => [text(row,"id"), text(row,"supplier_name")]));
    const governedLinkById = new Map(governedLinks.map((row) => [text(row,"delivery_batch_id"), positiveInteger(row,"approval_revision")]));
    const receipts: CanonicalReceipt[] = [
      ...legacy.map((row) => ({ id:text(row,"id"), receivedDate:text(row,"received_date"), quantity:positiveInteger(row,"quantity"), landedGbp:String(row.landed_total_gbp), kind:"legacy_supplier_batch" as const, supplierName:supplierName.get(text(row,"supplier_id")) ?? "", evidenceStatus:text(row,"evidence_status"), provenance:text(row,"documentary_provenance") })),
      ...governed.map((row) => ({ id:text(row,"id"), receivedDate:text(row,"received_at").slice(0,10), quantity:positiveInteger(row,"received_quantity"), landedGbp:String(row.landed_cost_gbp), kind:"governed_historical_delivery" as const, supplierName:supplierName.get(text(row,"supplier_id")) ?? "", approvalRevision:governedLinkById.get(text(row,"id")), evidenceStatus:row.validation_status === "VALID" && row.approval_status === "APPROVED" && row.receipt_status === "RECEIVED" ? "valid_received" : "invalid", provenance:text(row,"source_document_reference") })),
    ];

    const memberships = await rows(this.#client.from("vault_historical_merchandise_class_memberships").select("product_id,merchandise_class_id,effective_from,effective_through").eq("merchandise_class_id", "exclusive_tee"), "HISTORICAL_COGS_PREVIEW_MEMBERSHIP_READ_FAILED");
    const orders = await rows(this.#client.from("vault_shopify_orders").select("id,shopify_order_id,shopify_created_at,refunds,cancelled_at,metadata").gte("shopify_created_at", `${draft.salePeriodFrom}T00:00:00Z`).lte("shopify_created_at", `${draft.salePeriodThrough}T23:59:59Z`), "HISTORICAL_COGS_PREVIEW_ORDER_READ_FAILED");
    const validOrders = orders.filter((row) => row.cancelled_at === null && (row.metadata as Record<string, unknown> | null)?.test === "false");
    const orderIds = ids(validOrders);
    const orderById = new Map(validOrders.map((row) => [text(row,"id"), row]));
    const lines = orderIds.length ? await chunkedRows(orderIds, (ids) => this.#client.from("vault_shopify_order_lines").select("id,order_id,shopify_variant_id,shopify_line_item_id,quantity,refunded_quantity,source").in("order_id", ids).eq("source", "shopify"), "HISTORICAL_COGS_PREVIEW_LINE_READ_FAILED") : [];
    const variantIds = [...new Set(lines.map((row) => text(row,"shopify_variant_id")))];
    const variants = variantIds.length ? await chunkedRows(variantIds, (ids) => this.#client.from("vault_variants").select("source_variant_id,product_id,source").in("source_variant_id", ids).eq("source", "shopify"), "HISTORICAL_COGS_PREVIEW_VARIANT_READ_FAILED") : [];
    const productByVariant = new Map(variants.map((row) => [text(row,"source_variant_id"), text(row,"product_id")]));
    const membershipByProduct = new Map(memberships.map((row) => [text(row,"product_id"), row]));
    const sales: CanonicalSaleLine[] = lines.flatMap((line) => { const order = orderById.get(text(line,"order_id")), productId = productByVariant.get(text(line,"shopify_variant_id")); if (!order || !productId) return []; const membership = membershipByProduct.get(productId); if (!membership) return []; return [{ id:text(line,"id"), saleTimestamp:text(order,"shopify_created_at"), quantity:positiveInteger(line,"quantity"), mapped:true, refundedQuantity:Number(line.refunded_quantity ?? 0), orderRefundsGbp:String(order.refunds ?? 0), orderId:text(line,"order_id"), shopifyOrderId:text(order,"shopify_order_id"), shopifyLineItemId:text(line,"shopify_line_item_id"), productId, merchandiseClassId:text(membership,"merchandise_class_id"), membershipEffectiveFrom:text(membership,"effective_from"), membershipEffectiveThrough:text(membership,"effective_through") }]; });
    const lineIds = sales.map((row) => row.id), shopifyOrderIds = [...new Set(sales.map((row) => row.shopifyOrderId))];
    const attributionRows = lineIds.length ? await chunkedRows(lineIds, (ids) => this.#client.from("vault_historical_policy_derived_cogs_line_attributions").select("order_line_id,policy_version_id,total_policy_derived_cogs_gbp").in("order_line_id", ids), "HISTORICAL_COGS_PREVIEW_ATTRIBUTION_READ_FAILED") : [];
    const attributions: ExistingAttribution[] = attributionRows.map((row) => ({ orderLineId:text(row,"order_line_id"), policyVersionId:text(row,"policy_version_id"), totalPolicyDerivedCogsGbp:String(row.total_policy_derived_cogs_gbp) }));
    const observationsRows = shopifyOrderIds.length ? await chunkedRows(shopifyOrderIds, (ids) => this.#client.from("vault_shopify_refund_line_observations").select("id,shopify_order_id,shopify_line_item_id,shopify_refund_id,shopify_refund_line_item_id,refund_source_updated_at,quantity,restocked,source,evidence_mode,currency").in("shopify_order_id", ids), "HISTORICAL_COGS_PREVIEW_REFUND_OBSERVATION_READ_FAILED") : [];
    const refundObservations: RefundObservation[] = observationsRows.map((row) => ({ id:text(row,"id"), shopifyOrderId:text(row,"shopify_order_id"), shopifyLineItemId:typeof row.shopify_line_item_id === "string" ? row.shopify_line_item_id : null, shopifyRefundId:text(row,"shopify_refund_id"), shopifyRefundLineItemId:text(row,"shopify_refund_line_item_id"), refundSourceUpdatedAt:text(row,"refund_source_updated_at"), quantity:positiveInteger(row,"quantity"), restocked:row.restocked === true, source:text(row,"source"), evidenceMode:text(row,"evidence_mode"), currency:text(row,"currency") }));
    const dispositionRows = await rows(this.#client.from("vault_historical_cogs_refund_dispositions").select("id,draft_policy_version_id,subject_order_line_id,disposition,owner_attestation,attested_by_operator_id,evidence_provenance").eq("draft_policy_version_id", draftId), "HISTORICAL_COGS_PREVIEW_DISPOSITION_READ_FAILED");
    const dispositions: GovernedDisposition[] = dispositionRows.map((row) => ({ id:text(row,"id"), draftPolicyVersionId:text(row,"draft_policy_version_id"), subjectOrderLineId:text(row,"subject_order_line_id"), disposition:text(row,"disposition") as GovernedDisposition["disposition"], ownerAttestation:text(row,"owner_attestation"), attestedByOperatorId:text(row,"attested_by_operator_id"), evidenceProvenance:text(row,"evidence_provenance") }));
    const dispositionIds = dispositions.map((row) => row.id);
    const linkRows = dispositionIds.length ? await rows(this.#client.from("vault_historical_cogs_refund_disposition_observation_links").select("disposition_id,refund_line_observation_id,shopify_order_id,shopify_line_item_id,refunded_quantity,restocked,refund_source_updated_at").in("disposition_id", dispositionIds), "HISTORICAL_COGS_PREVIEW_DISPOSITION_LINK_READ_FAILED") : [];
    const dispositionLinks: GovernedDispositionLink[] = linkRows.map((row) => ({ dispositionId:text(row,"disposition_id"), refundLineObservationId:text(row,"refund_line_observation_id"), shopifyOrderId:text(row,"shopify_order_id"), shopifyLineItemId:typeof row.shopify_line_item_id === "string" ? row.shopify_line_item_id : null, refundedQuantity:positiveInteger(row,"refunded_quantity"), restocked:row.restocked === true, refundSourceUpdatedAt:text(row,"refund_source_updated_at") }));
    return { draft, receipts, sales, attributions, refundObservations, dispositions, dispositionLinks };
  }
}
