import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type ShippingSyncFailureCode =
  | "SHIPPING_SOURCE_UNAVAILABLE"
  | "SHIPPING_SOURCE_INCOMPATIBLE"
  | "SHIPPING_SOURCE_INCOMPLETE"
  | "SHIPPING_PERSISTENCE_FAILED"
  | "SHIPPING_CONFIGURATION_UNAVAILABLE"
  | "SHIPPING_SYNC_FAILED";

export type ShippingSyncOutcome = {
  status: "success" | "unavailable";
  failureCode: ShippingSyncFailureCode | null;
};

/** Maps internal errors to a stable, non-sensitive operational contract. */
export function shippingSyncFailureCode(error: unknown): ShippingSyncFailureCode {
  const message = error instanceof Error ? error.message : "";
  if (/currency\/timezone|incompatible/i.test(message)) return "SHIPPING_SOURCE_INCOMPATIBLE";
  if (/incomplete|invalid shipping|invalid canonical|duplicate canonical/i.test(message)) return "SHIPPING_SOURCE_INCOMPLETE";
  if (/persist shipping|persist.*cost/i.test(message)) return "SHIPPING_PERSISTENCE_FAILED";
  if (/missing configuration/i.test(message)) return "SHIPPING_CONFIGURATION_UNAVAILABLE";
  if (/shipping analytics unavailable|shopifyql|shopify.*(error|failed)|timeout|thrott/i.test(message)) return "SHIPPING_SOURCE_UNAVAILABLE";
  return "SHIPPING_SYNC_FAILED";
}

/** Telemetry must not make a source capture appear successful or unsuccessful. */
export async function recordShippingSyncOutcome(
  supabase: SupabaseClient,
  outcome: ShippingSyncOutcome,
): Promise<void> {
  const { error } = await supabase.rpc("record_shopify_shipping_sync_outcome", {
    p_status: outcome.status,
    p_failure_code: outcome.failureCode,
  });
  if (error) throw error;
}
