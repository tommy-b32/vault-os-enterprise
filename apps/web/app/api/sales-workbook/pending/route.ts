import { NextResponse } from "next/server";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import { supabaseAdmin } from "@/lib/supabase-admin";

type PendingOrder = { orderId: string; orderNumber: string; date: string; products: string[]; reasons: string[]; paymentFee: string | null; paymentFeeSource: "shopify" | "manual" | "missing" };
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
    const [coverageResult, feesResult, manualResult] = ids.length ? await Promise.all([
      supabaseAdmin.from("vault_shopify_payment_fee_coverage").select("order_id,coverage_state").in("order_id", ids),
      supabaseAdmin.from("vault_shopify_payment_fee_records").select("order_id,fee_amount,tax_amount,counts_toward_profit").in("order_id", ids),
      supabaseAdmin.from("vault_shopify_manual_financial_evidence").select("order_id,evidence_type,amount_gbp").eq("evidence_type", "payment_fee").in("order_id", ids),
    ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
    if (coverageResult.error || feesResult.error || manualResult.error) throw new Error("Pending financial evidence unavailable");
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
      const covered = (coverageResult.data ?? []).some(row => row.order_id === order.id && row.coverage_state === "covered");
      const shopifyFee = covered ? (feesResult.data ?? []).filter(row => row.order_id === order.id && row.counts_toward_profit).reduce((total, row) => total + Number(row.fee_amount) + Number(row.tax_amount ?? 0), 0) : null;
      const manualFee = (manualResult.data ?? []).find(row => row.order_id === order.id)?.amount_gbp;
      const paymentFee = shopifyFee === null ? (manualFee === undefined ? null : String(manualFee)) : String(shopifyFee);
      return [{ orderId: order.id, orderNumber, date: order.shopify_created_at, products: byId.get(order.id) ?? [], paymentFee, paymentFeeSource: shopifyFee !== null ? "shopify" : manualFee === undefined ? "missing" : "manual",
        reasons: Array.isArray(entry.reason_codes) ? entry.reason_codes.filter((value: unknown): value is string => typeof value === "string") : [] }];
    });
    return NextResponse.json({ orders: result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Pending orders unavailable" }, { status: 503 });
  }
}
