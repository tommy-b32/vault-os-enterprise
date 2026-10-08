import "server-only";

import type { ProposalField } from "./BackfillProposal";

export type GovernedFulfilmentTrackingEvidence = {
  order_id: string;
  tracking_number: string | null;
};

const proven = <T,>(value: T, source: string): ProposalField<T> => ({ value, status: "proven", source });
const unresolved = <T,>(source: string): ProposalField<T> => ({ value: null, status: "unresolved", source });

/** Resolves only bounded governed evidence; multiple numbers deliberately fail closed. */
export function governedTrackingFieldsByOrder(
  orderIds: readonly string[],
  evidence: readonly GovernedFulfilmentTrackingEvidence[],
): Map<string, ProposalField<string>> {
  const requested = new Set(orderIds);
  if (requested.size !== orderIds.length) throw new Error("Tracking evidence request contains duplicate orders");

  const valuesByOrder = new Map<string, Set<string>>();
  for (const item of evidence) {
    if (!requested.has(item.order_id) || typeof item.tracking_number !== "string" || !item.tracking_number.trim()) {
      throw new Error("Governed tracking evidence is invalid");
    }
    const values = valuesByOrder.get(item.order_id) ?? new Set<string>();
    values.add(item.tracking_number.trim());
    valuesByOrder.set(item.order_id, values);
  }

  const fields = new Map<string, ProposalField<string>>();
  for (const orderId of orderIds) {
    const values = [...(valuesByOrder.get(orderId) ?? [])];
    if (values.length === 0) {
      fields.set(orderId, { value: "", status: "not_applicable", source: "governed_shopify_fulfillment_tracking_absent" });
    } else if (values.length === 1) {
      fields.set(orderId, proven(values[0], "governed_shopify_fulfillment_tracking"));
    } else {
      fields.set(orderId, unresolved("governed_shopify_fulfillment_tracking_ambiguous"));
    }
  }
  return fields;
}
