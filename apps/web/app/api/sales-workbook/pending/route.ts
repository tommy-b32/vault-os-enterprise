import { NextResponse } from "next/server";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import { supabaseAdmin } from "@/lib/supabase-admin";

type PendingOrder = { orderNumber: string; date: string; products: string[]; reasons: string[] };
const LIMIT = 200;

/** Read-only canonical pending orders; never generates workbook rows or financial totals. */
export async function GET() {
  try {
    await requireAuthenticatedOperator();
    const { data: deferred, error } = await supabaseAdmin
      .from("vault_sales_workbook_deferred_orders")
      .select("order_number,reason_codes")
      .order("order_number", { ascending: false })
      .limit(LIMIT);
    if (error) throw error;
    const numbers = [...new Set((deferred ?? []).map(row => String(row.order_number)).filter(value => /^\d+$/.test(value)))];
    if (!numbers.length) return NextResponse.json({ orders: [] as PendingOrder[] });
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("vault_shopify_orders")
      .select("id,order_number,shopify_created_at")
      .eq("source", "shopify")
      .in("order_number", numbers);
    if (ordersError) throw ordersError;
    const ids = (orders ?? []).map(order => order.id);
    const { data: lines, error: linesError } = ids.length
      ? await supabaseAdmin.from("vault_shopify_order_lines").select("order_id,title").in("order_id", ids)
      : { data: [], error: null };
    if (linesError) throw linesError;
    const byId = new Map<string, string[]>();
    for (const line of lines ?? []) {
      if (typeof line.title !== "string" || !line.title.trim()) continue;
      byId.set(line.order_id, [...(byId.get(line.order_id) ?? []), line.title.trim()]);
    }
    const byNumber = new Map((orders ?? []).map(order => [String(order.order_number), order]));
    const result: PendingOrder[] = (deferred ?? []).flatMap(entry => {
      const orderNumber = String(entry.order_number);
      const order = byNumber.get(orderNumber);
      if (!order) return [];
      return [{ orderNumber, date: order.shopify_created_at, products: byId.get(order.id) ?? [],
        reasons: Array.isArray(entry.reason_codes) ? entry.reason_codes.filter((value: unknown): value is string => typeof value === "string") : [] }];
    });
    return NextResponse.json({ orders: result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Pending orders unavailable" }, { status: 503 });
  }
}
