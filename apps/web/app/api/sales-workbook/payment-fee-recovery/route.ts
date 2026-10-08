import { NextResponse } from "next/server";

import { OperatorAuthorizationError, requireOperatorRole } from "@/lib/auth/operators";
import { supabaseAdmin } from "@/lib/supabase-admin";

const MAX_EXACT_ORDERS = 5;
const shopifyOrderGid = /^gid:\/\/shopify\/Order\/[1-9][0-9]*$/;

function parseRequest(value: unknown): string[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || !Array.isArray(body.shopifyOrderIds) || body.shopifyOrderIds.length < 1 || body.shopifyOrderIds.length > MAX_EXACT_ORDERS ||
      body.shopifyOrderIds.some(id => typeof id !== "string" || !shopifyOrderGid.test(id)) || new Set(body.shopifyOrderIds).size !== body.shopifyOrderIds.length) return null;
  return body.shopifyOrderIds as string[];
}

export async function POST(request: Request) {
  try {
    await requireOperatorRole("owner", "operator");
    const shopifyOrderIds = parseRequest(await request.json().catch(() => null));
    if (!shopifyOrderIds) return NextResponse.json({ error: "Invalid payment-fee recovery request" }, { status: 400 });
    const syncSecret = process.env.VAULT_ORDER_SYNC_SECRET;
    if (!syncSecret) {
      console.error("Sales workbook payment-fee recovery is unavailable: sync secret missing");
      return NextResponse.json({ error: "Payment-fee recovery is unavailable" }, { status: 500 });
    }
    const { data, error } = await supabaseAdmin.functions.invoke("shopify-payment-fee-retry", {
      body: { shopifyOrderIds },
      headers: { "X-Vault-Sync-Secret": syncSecret },
    });
    if (error || !data?.success || data.mode !== "exact_orders") {
      console.error("Sales workbook exact payment-fee recovery failed", { name: error?.name ?? "RecoveryError" });
      return NextResponse.json({ error: "Payment-fee recovery failed" }, { status: 502 });
    }
    return NextResponse.json({ success: true, processed: data.payment_fees?.processed ?? 0, covered: data.payment_fees?.covered ?? 0, requestedOrderIds: shopifyOrderIds });
  } catch (error) {
    if (error instanceof OperatorAuthorizationError) return NextResponse.json({ error: error.reason === "forbidden" ? "Forbidden" : "Unauthorized" }, { status: error.reason === "forbidden" ? 403 : 401 });
    console.error("Sales workbook exact payment-fee recovery failed", { name: error instanceof Error ? error.name : "Unknown" });
    return NextResponse.json({ error: "Payment-fee recovery failed" }, { status: 500 });
  }
}
