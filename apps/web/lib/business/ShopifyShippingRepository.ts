import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const ShopifyShippingRepository = {
  async getToday(now = new Date()) {
    const { data, error } = await supabaseAdmin.rpc("get_shopify_daily_shipping", { target_at: now.toISOString() }).single<Record<string, unknown>>();
    if (error || !data) throw new Error("Shipping coverage unavailable");
    const count = (value: unknown) => {
      const parsed = value == null || value === "" ? NaN : Number(value);
      if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Invalid shipping coverage");
      return parsed;
    };
    const total = data.total_shipping_gbp == null ? null : Number(data.total_shipping_gbp);
    if (total !== null && (!Number.isFinite(total) || total < 0)) throw new Error("Invalid shipping total");
    if (data.accounting_status !== "unreconciled") throw new Error("Unknown shipping accounting status");
    return { total, orderCount: count(data.order_count), coveredOrders: count(data.covered_orders),
      awaitingCostOrders: count(data.awaiting_cost_orders), oldestAwaitingAt: data.oldest_awaiting_at as string | null,
      sourceAt: data.source_at as string | null };
  },
};
