import "server-only";

import { requireOperatorRole } from "@/lib/auth/operators";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createSessionSupabaseClient } from "@/lib/supabase-server";

export class ExternalPostageValidationError extends Error {}

const ORDER_NUMBER = /^[1-9][0-9]{0,11}$/;
const GBP_AMOUNT = /^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,2})?$/;

/**
 * Order-level external postage write. Requires the governed
 * record_external_order_postage RPC migration before this is enabled.
 * No direct writes to Shopify shipping snapshots or workbook files.
 */
export async function recordExternalOrderPostage(input: {
  orderNumber: string;
  amountGbp: string;
}) {
  await requireOperatorRole("owner", "operator");
  if (!ORDER_NUMBER.test(input.orderNumber) || !GBP_AMOUNT.test(input.amountGbp)) {
    throw new ExternalPostageValidationError("A valid order number and GBP postage amount are required");
  }

  const [pounds, fractional = ""] = input.amountGbp.split(".");
  const amountPence = Number(pounds) * 100 + Number(fractional.padEnd(2, "0"));
  if (!Number.isSafeInteger(amountPence)) {
    throw new ExternalPostageValidationError("Invalid postage amount");
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from("vault_shopify_orders")
    .select("id,shopify_order_id")
    .eq("source", "shopify")
    .eq("order_number", input.orderNumber)
    .maybeSingle();
  if (orderError || !order) {
    throw new ExternalPostageValidationError("Canonical Shopify order is unavailable");
  }

  // RPC must enforce order uniqueness, actor validation, immutable audit,
  // idempotency and Shopify/external source conflicts in one transaction.
  const supabase = await createSessionSupabaseClient();
  const { data, error } = await supabase.rpc("record_external_order_postage", {
    p_order_id: order.id,
    p_amount_pence: amountPence,
  });
  if (error) throw new Error("Unable to record external postage");
  return { orderNumber: input.orderNumber, amountGbp: (amountPence / 100).toFixed(2), result: data };
}
