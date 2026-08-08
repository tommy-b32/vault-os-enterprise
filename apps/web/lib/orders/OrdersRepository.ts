import "server-only";

import { ShopifyTradingRepository } from "@/lib/business/ShopifyTradingRepository";
import { deriveOrderFreshness, type OrderFreshnessState } from "@/lib/orders/OrderFreshness";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type CanonicalOrderSummary = {
  id: string;
  shopifyOrderId: string;
  orderNumber: string;
  orderName: string;
  orderDate: string;
  customerName: string | null;
  financialStatus: string | null;
  fulfilmentStatus: string | null;
  grossTotal: number;
  netRevenue: number;
  refunds: number;
  currency: string;
  lineItemCount: number;
  cancelledAt: string | null;
  test: boolean;
  syncedAt: string;
};

export type CanonicalOrderLine = {
  id: string;
  shopifyLineItemId: string;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  refundedQuantity: number;
  unitPrice: number;
  discountAllocation: number;
  netLineRevenue: number;
};

export type CanonicalOrderDetail = CanonicalOrderSummary & {
  subtotal: number;
  discounts: number;
  shipping: number;
  tax: number;
  lines: CanonicalOrderLine[];
};

export type OrdersReadResult<T> = {
  data: T;
  freshness: OrderFreshnessState | "error";
  latestSyncAt: string | null;
  message: string;
};

type OrderRow = {
  id: string;
  shopify_order_id: string;
  order_number: string;
  order_name: string;
  shopify_created_at: string;
  customer_name: string | null;
  financial_status: string | null;
  fulfilment_status: string | null;
  gross_total: number | string;
  net_revenue: number | string;
  refunds: number | string;
  currency: string;
  cancelled_at: string | null;
  metadata: unknown;
  synced_at: string;
};

function amount(value: number | string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Canonical order contains an invalid amount");
  return parsed;
}

function isTestOrder(metadata: unknown): boolean {
  return typeof metadata === "object" && metadata !== null &&
    "test" in metadata && (metadata as { test?: unknown }).test === true;
}

function freshnessMessage(state: OrderFreshnessState): string {
  if (state === "current") return "Canonical Shopify orders are current.";
  if (state === "stale") return "Canonical Shopify orders are available but the latest sync is delayed.";
  return "No completed canonical Shopify order sync is available.";
}

function mapSummary(row: OrderRow, lineItemCount: number): CanonicalOrderSummary {
  return {
    id: row.id,
    shopifyOrderId: row.shopify_order_id,
    orderNumber: row.order_number,
    orderName: row.order_name,
    orderDate: row.shopify_created_at,
    customerName: row.customer_name,
    financialStatus: row.financial_status,
    fulfilmentStatus: row.fulfilment_status,
    grossTotal: amount(row.gross_total),
    netRevenue: amount(row.net_revenue),
    refunds: amount(row.refunds),
    currency: row.currency,
    lineItemCount,
    cancelledAt: row.cancelled_at,
    test: isTestOrder(row.metadata),
    syncedAt: row.synced_at,
  };
}

const ORDER_FIELDS = `
  id, shopify_order_id, order_number, order_name, shopify_created_at,
  customer_name, financial_status, fulfilment_status, gross_total,
  net_revenue, refunds, currency, cancelled_at, metadata, synced_at
`;

export const OrdersRepository = {
  async list(limit = 100): Promise<OrdersReadResult<CanonicalOrderSummary[]>> {
    try {
      const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
      const [latestSyncAt, ordersResult] = await Promise.all([
        ShopifyTradingRepository.getLatestSyncAt(),
        supabaseAdmin
          .from("vault_shopify_orders")
          .select(ORDER_FIELDS)
          .order("shopify_created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(safeLimit),
      ]);
      if (ordersResult.error) throw new Error(ordersResult.error.message);
      const rows = (ordersResult.data ?? []) as OrderRow[];
      const counts = new Map<string, number>();
      if (rows.length > 0) {
        const { data, error } = await supabaseAdmin
          .from("vault_shopify_order_lines")
          .select("order_id")
          .in("order_id", rows.map((row) => row.id));
        if (error) throw new Error(error.message);
        for (const line of data ?? []) counts.set(line.order_id, (counts.get(line.order_id) ?? 0) + 1);
      }
      const freshness = deriveOrderFreshness(latestSyncAt);
      return {
        data: rows.map((row) => mapSummary(row, counts.get(row.id) ?? 0)),
        freshness,
        latestSyncAt,
        message: freshnessMessage(freshness),
      };
    } catch {
      return {
        data: [],
        freshness: "error",
        latestSyncAt: null,
        message: "Canonical Shopify orders could not be loaded.",
      };
    }
  },

  async getById(id: string): Promise<OrdersReadResult<CanonicalOrderDetail | null>> {
    try {
      const [latestSyncAt, orderResult, linesResult] = await Promise.all([
        ShopifyTradingRepository.getLatestSyncAt(),
        supabaseAdmin.from("vault_shopify_orders").select(`${ORDER_FIELDS}, subtotal, discounts, shipping, tax`).eq("id", id).maybeSingle(),
        supabaseAdmin.from("vault_shopify_order_lines").select(`
          id, shopify_line_item_id, shopify_product_id, shopify_variant_id,
          title, variant_title, sku, quantity, refunded_quantity,
          unit_price, discount_allocation, net_line_revenue
        `).eq("order_id", id).order("created_at", { ascending: true }),
      ]);
      if (orderResult.error || linesResult.error) {
        throw new Error(orderResult.error?.message ?? linesResult.error?.message);
      }
      const freshness = deriveOrderFreshness(latestSyncAt);
      if (!orderResult.data) return { data: null, freshness, latestSyncAt, message: freshnessMessage(freshness) };
      const row = orderResult.data as OrderRow & {
        subtotal: number | string;
        discounts: number | string;
        shipping: number | string;
        tax: number | string;
      };
      const lines = (linesResult.data ?? []).map((line) => ({
        id: line.id,
        shopifyLineItemId: line.shopify_line_item_id,
        shopifyProductId: line.shopify_product_id,
        shopifyVariantId: line.shopify_variant_id,
        title: line.title,
        variantTitle: line.variant_title,
        sku: line.sku,
        quantity: line.quantity,
        refundedQuantity: line.refunded_quantity,
        unitPrice: amount(line.unit_price),
        discountAllocation: amount(line.discount_allocation),
        netLineRevenue: amount(line.net_line_revenue),
      }));
      return {
        data: {
          ...mapSummary(row, lines.length),
          subtotal: amount(row.subtotal),
          discounts: amount(row.discounts),
          shipping: amount(row.shipping),
          tax: amount(row.tax),
          lines,
        },
        freshness,
        latestSyncAt,
        message: freshnessMessage(freshness),
      };
    } catch {
      return { data: null, freshness: "error", latestSyncAt: null, message: "Canonical Shopify order details could not be loaded." };
    }
  },
} as const;
