import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type ShopifyPaymentFeeToday = { total: number | null; orderCount: number; coveredOrders: number; sourceAt: string | null };
const count = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;

export const ShopifyPaymentFeeRepository = {
  async getToday(now = new Date()): Promise<ShopifyPaymentFeeToday | null> {
    const { data, error } = await supabaseAdmin.rpc("get_shopify_daily_payment_fees", { target_at: now.toISOString() }).single<Record<string, unknown>>();
    if (error || !data) return null;
    const total = data.total_payment_fees_gbp === null ? null : Number(data.total_payment_fees_gbp);
    if (total !== null && (!Number.isFinite(total) || total < 0)) return null;
    const sourceAt = typeof data.source_at === "string" && Number.isFinite(Date.parse(data.source_at)) ? data.source_at : null;
    return { total, orderCount: count(data.order_count), coveredOrders: count(data.covered_orders), sourceAt };
  },
} as const;
