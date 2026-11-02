import { NextResponse } from "next/server";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import { SalesWorkbookRepository } from "@/lib/sales-workbook/SalesWorkbookRepository";
import { parseSalesWorkbook } from "@/lib/sales-workbook/WorkbookParser";
import { supabaseAdmin } from "@/lib/supabase-admin";

type CanonicalLinks = { shopifyAdminUrl: string | null; tracking: Array<{ number: string; url: string | null }> };
type ShopifyOrder = { order_number: string; shopify_order_id: string };
type TrackingObservation = { shopify_order_id: string; tracking_number: string; tracking_url: string | null; observed_at: string };

function safeTrackingUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

function shopifyAdminUrl(gid: string): string | null {
  const match = /^gid:\/\/shopify\/Order\/(\d+)$/.exec(gid);
  if (!match) return null;
  // Store handle confirmed by the Vault OS owner; not a customer-facing domain.
  return `https://admin.shopify.com/store/vgjszm-2t/orders/${match[1]}`;
}

export async function GET() {
  try {
    await requireAuthenticatedOperator();
    const { workbook, bytes } = await SalesWorkbookRepository.readCurrentWorkbookBytes();
    const parsed = parseSalesWorkbook(bytes);
    if (!parsed.valid) return NextResponse.json({ error: "Workbook Sales sheet layout is invalid", validation: parsed }, { status: 422 });

    const orderNumbers = [...new Set(parsed.rows.map(row => String(row.orderNumber ?? "").trim()).filter(value => /^\d+$/.test(value)))];
    const canonical: Record<string, CanonicalLinks> = {};
    // Best-effort enrichment: workbook availability must not depend on Shopify observations.
    try {
      const orderRecords: ShopifyOrder[] = [];
      for (let i = 0; i < orderNumbers.length; i += 200) {
        const { data, error } = await supabaseAdmin.from("vault_shopify_orders")
          .select("order_number,shopify_order_id").in("order_number", orderNumbers.slice(i, i + 200));
        if (error) throw error;
        orderRecords.push(...((data ?? []) as ShopifyOrder[]));
      }
      const idToNumbers = new Map<string, string[]>();
      for (const order of orderRecords) {
        if (!orderNumbers.includes(order.order_number)) continue;
        canonical[order.order_number] = { shopifyAdminUrl: shopifyAdminUrl(order.shopify_order_id), tracking: [] };
        idToNumbers.set(order.shopify_order_id, [...(idToNumbers.get(order.shopify_order_id) ?? []), order.order_number]);
      }
      const ids = [...idToNumbers.keys()];
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await supabaseAdmin.from("vault_shopify_fulfillment_tracking_observations")
          .select("shopify_order_id,tracking_number,tracking_url,observed_at")
          .in("shopify_order_id", ids.slice(i, i + 100))
          .order("observed_at", { ascending: false }).limit(1000);
        if (error) throw error;
        for (const observation of (data ?? []) as TrackingObservation[]) {
          if (!observation.tracking_number) continue;
          for (const orderNumber of idToNumbers.get(observation.shopify_order_id) ?? []) {
            const existing = canonical[orderNumber].tracking;
            if (!existing.some(item => item.number === observation.tracking_number)) {
              existing.push({ number: observation.tracking_number, url: safeTrackingUrl(observation.tracking_url) });
            }
          }
        }
      }
    } catch (error) {
      console.error("Sales Workbook Shopify link enrichment unavailable", error);
    }

    return NextResponse.json({ workbook: { filename: workbook.filename, version: workbook.current_version }, sheet: { name: "Sales", headers: parsed.headers, rowCount: parsed.rowCount, columnOwnership: parsed.columnOwnership, rows: parsed.rows }, canonical });
  } catch {
    return NextResponse.json({ error: "Sales workbook is unavailable" }, { status: 400 });
  }
}
