import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getTodayTradingRange } from "@/lib/business/ShopifyTradingRepository";

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
    const orderCount = count(data.order_count);
    const coveredOrders = count(data.covered_orders);
    let coveredTotal: number | null = total;
    if (total === null && coveredOrders > 0) {
      const range = getTodayTradingRange(now);
      const { data: orders, error: ordersError } = await supabaseAdmin.from("vault_shopify_orders")
        .select("id").eq("source", "shopify").is("cancelled_at", null).eq("metadata->>test", false)
        .gte("shopify_created_at", range.from).lt("shopify_created_at", range.to);
      if (ordersError || !orders || orders.length !== orderCount) throw new Error("Shipping cohort unavailable");
      const orderIds = orders.map((order) => order.id);
      const { data: costs, error: costsError } = await supabaseAdmin.from("vault_shopify_shipping_costs")
        .select("order_id,label_cost_gbp").in("order_id", orderIds).eq("source_state", "covered");
      if (costsError || !costs || costs.length !== coveredOrders) throw new Error("Shipping coverage unavailable");
      coveredTotal = costs.reduce((sum, cost) => {
        const amount = Number(cost.label_cost_gbp);
        if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid shipping total");
        return sum + amount;
      }, 0);
    }
    return { total, coveredTotal, orderCount, coveredOrders,
      awaitingCostOrders: count(data.awaiting_cost_orders), oldestAwaitingAt: data.oldest_awaiting_at as string | null,
      sourceAt: data.source_at as string | null };
  },
};
