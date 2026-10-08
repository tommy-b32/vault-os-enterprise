import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { sourceContentFingerprint } from "./financial-evidence.ts";
import { runFulfillmentEvidenceProbe } from "./fulfillment-evidence-probe.ts";

export const FULFILLMENT_TRACKING_FINGERPRINT_CONTRACT = "shopify-fulfillment-tracking-source-content-v1";
type Mode = "historical" | "prospective";

type Tracking = { trackingNumber: string; trackingCompany: string | null; trackingUrl: string | null };
type Fulfillment = { fulfillmentId: string; status: string; updatedAt: string; trackingValues: Tracking[] };
type ProbeOrder = { orderId: string; updatedAt: string; fulfillmentsComplete: boolean; fulfillments: Fulfillment[] };

export function trackingValues(values: Tracking[]): Tracking[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trackingNumber;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildFulfillmentTrackingEvidence(order: ProbeOrder, observedAt: string, captureMode: Mode) {
  if (!order.fulfillmentsComplete) throw new Error("INCOMPLETE_FULFILLMENT_TRACKING_CAPTURE");
  const fulfillments = order.fulfillments.map((fulfillment) => ({
    shopify_fulfillment_id: fulfillment.fulfillmentId,
    fulfillment_status: fulfillment.status,
    fulfillment_updated_at: fulfillment.updatedAt,
    tracking: trackingValues(fulfillment.trackingValues).map((value) => ({
      tracking_number: value.trackingNumber,
      tracking_company: value.trackingCompany,
      tracking_url: value.trackingUrl,
    })),
  }));
  const source = { source: "shopify", shopify_order_id: order.orderId, order_source_updated_at: order.updatedAt, fulfillments };
  return {
    capture_mode: captureMode,
    completeness: {
      source: "shopify", evidence_mode: captureMode, shopify_order_id: order.orderId,
      order_source_updated_at: order.updatedAt, observed_at: observedAt, fulfillments_complete: true,
      tracking_count: fulfillments.reduce((count, fulfillment) => count + fulfillment.tracking.length, 0),
      fingerprint_contract_version: FULFILLMENT_TRACKING_FINGERPRINT_CONTRACT,
      source_content_fingerprint: sourceContentFingerprint(source),
    },
    fulfillments,
  };
}
export type FulfillmentTrackingEvidence = ReturnType<typeof buildFulfillmentTrackingEvidence>;

export async function persistFulfillmentTrackingEvidence(supabase: SupabaseClient, payload: FulfillmentTrackingEvidence) {
  const { error } = await supabase.rpc("record_shopify_fulfillment_tracking_evidence", { payload, capture_mode: payload.capture_mode });
  if (error) throw new Error(`Unable to persist Shopify fulfilment tracking evidence: ${error.message}`);
}

export function fulfillmentTrackingBatches<T>(items: T[], batchSize = 5): T[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5) throw new Error("INVALID_FULFILLMENT_TRACKING_BATCH_SIZE");
  const batches: T[][] = [];
  for (let offset = 0; offset < items.length; offset += batchSize) batches.push(items.slice(offset, offset + batchSize));
  return batches;
}

/** Probes complete Shopify fulfilment evidence once per bounded batch, without writing canonical orders. */
export async function probeFulfillmentTrackingEvidence(orderIds: string[], mode: Mode, observedAt = new Date().toISOString()) {
  if (!orderIds.length || orderIds.length > 5) throw new Error("INVALID_FULFILLMENT_TRACKING_BATCH_SIZE");
  const probe = await runFulfillmentEvidenceProbe(orderIds) as { orders: ProbeOrder[]; completeness: { allRequestedOrdersFound: boolean; allConnectionsComplete: boolean } };
  if (!probe.completeness.allRequestedOrdersFound || !probe.completeness.allConnectionsComplete) throw new Error("INCOMPLETE_FULFILLMENT_TRACKING_CAPTURE");
  const evidence = new Map(probe.orders.map((order) => [order.orderId, buildFulfillmentTrackingEvidence(order, observedAt, mode)]));
  if (evidence.size !== orderIds.length || orderIds.some((orderId) => !evidence.has(orderId))) throw new Error("INCOMPLETE_FULFILLMENT_TRACKING_CAPTURE");
  return evidence;
}
