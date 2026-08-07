import "server-only";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

const BUSINESS_TIME_ZONE = "Europe/London";

export type ShopifyTradingRange = {
  from: string;
  to: string;
};

export type ShopifyTodaySummary = {
  range: ShopifyTradingRange;
  currency: string | null;
  orderCount: number;
  grossRevenue: number;
  netRevenue: number;
  refunds: number;
  itemsSold: number;
  averageOrderValue: number | null;
  profit: null;
};

export type ShopifyRecentOrder = {
  id: string;
  orderNumber: string;
  orderName: string;
  createdAt: string;
  currency: string;
  financialStatus: string | null;
  fulfilmentStatus: string | null;
  grossTotal: number;
  netRevenue: number;
  customerName: string | null;
};

export type ShopifyTradingDay = {
  date: string;
  orderCount: number;
  grossRevenue: number;
  netRevenue: number;
  refunds: number;
};

export type ShopifySevenDaySummary = {
  range: ShopifyTradingRange;
  currency: string | null;
  days: ShopifyTradingDay[];
};

export type ShopifyTopProduct = {
  productId: string;
  title: string;
  unitsSold: number;
  netRevenue: number;
};

type OrderSummaryRow = {
  id: string;
  shopify_created_at: string;
  currency: string;
  gross_total: number | string;
  net_revenue: number | string;
  refunds: number | string;
};

function numberFromDatabase(value: number | string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error("Canonical Shopify order data contains an invalid amount");
  }

  return parsed;
}

function getZonedParts(date: Date) {
  const values = new Map(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: BUSINESS_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
    second: Number(values.get("second")),
  };
}

function getTimeZoneOffsetMilliseconds(date: Date): number {
  const parts = getZonedParts(date);

  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  ) - date.getTime();
}

function getZonedMidnight(
  year: number,
  month: number,
  day: number,
): Date {
  const localAsUtc = new Date(Date.UTC(year, month - 1, day));
  let result = new Date(
    localAsUtc.getTime() - getTimeZoneOffsetMilliseconds(localAsUtc),
  );

  result = new Date(
    localAsUtc.getTime() - getTimeZoneOffsetMilliseconds(result),
  );

  return result;
}

function shiftCalendarDay(
  parts: { year: number; month: number; day: number },
  days: number,
) {
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function getDayRange(now = new Date()): ShopifyTradingRange {
  const today = getZonedParts(now);
  const tomorrow = shiftCalendarDay(today, 1);

  return {
    from: getZonedMidnight(today.year, today.month, today.day).toISOString(),
    to: getZonedMidnight(
      tomorrow.year,
      tomorrow.month,
      tomorrow.day,
    ).toISOString(),
  };
}

function getSevenDayRange(now = new Date()): ShopifyTradingRange {
  const today = getZonedParts(now);
  const firstDay = shiftCalendarDay(today, -6);
  const tomorrow = shiftCalendarDay(today, 1);

  return {
    from: getZonedMidnight(
      firstDay.year,
      firstDay.month,
      firstDay.day,
    ).toISOString(),
    to: getZonedMidnight(
      tomorrow.year,
      tomorrow.month,
      tomorrow.day,
    ).toISOString(),
  };
}

function getCurrency(rows: Array<{ currency: string }>): string | null {
  const currencies = new Set(rows.map((row) => row.currency));

  if (currencies.size > 1) {
    throw new Error("Trading summaries cannot combine multiple currencies");
  }

  return currencies.values().next().value ?? null;
}

function formatBusinessDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatCalendarDate(parts: {
  year: number;
  month: number;
  day: number;
}): string {
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

async function getOrdersInRange(
  range: ShopifyTradingRange,
): Promise<OrderSummaryRow[]> {
  const { data, error } = await supabaseAdmin
    .from("vault_shopify_orders")
    .select(`
      id,
      shopify_created_at,
      currency,
      gross_total,
      net_revenue,
      refunds
    `)
    .gte("shopify_created_at", range.from)
    .lt("shopify_created_at", range.to)
    .is("cancelled_at", null);

  if (error) {
    throw new Error(`Unable to read canonical Shopify orders: ${error.message}`);
  }

  return (data ?? []) as OrderSummaryRow[];
}

export const ShopifyTradingRepository = {
  async getLatestSyncAt(): Promise<string | null> {
    const { data: syncRun, error: syncRunError } = await supabaseAdmin
      .from("vault_shopify_order_sync_runs")
      .select("completed_at")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (syncRunError) {
      throw new Error(
        `Unable to read Shopify reconciliation freshness: ${syncRunError.message}`,
      );
    }

    if (syncRun?.completed_at) {
      return syncRun.completed_at;
    }

    const { data, error } = await supabaseAdmin
      .from("vault_shopify_orders")
      .select("synced_at")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to read Shopify trading freshness: ${error.message}`);
    }

    return data?.synced_at ?? null;
  },

  async getTodaySummary(now = new Date()): Promise<ShopifyTodaySummary> {
    const range = getDayRange(now);
    const orders = await getOrdersInRange(range);
    const orderIds = orders.map((order) => order.id);
    let itemsSold = 0;

    if (orderIds.length > 0) {
      const { data: lines, error } = await supabaseAdmin
        .from("vault_shopify_order_lines")
        .select("quantity, refunded_quantity")
        .in("order_id", orderIds);

      if (error) {
        throw new Error(`Unable to read canonical Shopify order lines: ${error.message}`);
      }

      itemsSold = (lines ?? []).reduce(
        (total, line) =>
          total + Math.max(0, line.quantity - line.refunded_quantity),
        0,
      );
    }

    const grossRevenue = orders.reduce(
      (total, order) => total + numberFromDatabase(order.gross_total),
      0,
    );
    const netRevenue = orders.reduce(
      (total, order) => total + numberFromDatabase(order.net_revenue),
      0,
    );
    const refunds = orders.reduce(
      (total, order) => total + numberFromDatabase(order.refunds),
      0,
    );

    return {
      range,
      currency: getCurrency(orders),
      orderCount: orders.length,
      grossRevenue,
      netRevenue,
      refunds,
      itemsSold,
      averageOrderValue:
        orders.length > 0 ? netRevenue / orders.length : null,
      profit: null,
    };
  },

  async getRecentOrders(limit = 10): Promise<ShopifyRecentOrder[]> {
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
    const { data, error } = await supabaseAdmin
      .from("vault_shopify_orders")
      .select(`
        id,
        order_number,
        order_name,
        shopify_created_at,
        currency,
        financial_status,
        fulfilment_status,
        gross_total,
        net_revenue,
        customer_name
      `)
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    if (error) {
      throw new Error(`Unable to read recent Shopify orders: ${error.message}`);
    }

    return (data ?? []).map((order) => ({
      id: order.id,
      orderNumber: order.order_number,
      orderName: order.order_name,
      createdAt: order.shopify_created_at,
      currency: order.currency,
      financialStatus: order.financial_status,
      fulfilmentStatus: order.fulfilment_status,
      grossTotal: numberFromDatabase(order.gross_total),
      netRevenue: numberFromDatabase(order.net_revenue),
      customerName: order.customer_name,
    }));
  },

  async getSevenDaySummary(now = new Date()): Promise<ShopifySevenDaySummary> {
    const range = getSevenDayRange(now);
    const orders = await getOrdersInRange(range);
    const daily = new Map<string, ShopifyTradingDay>();
    const today = getZonedParts(now);

    for (let offset = 6; offset >= 0; offset -= 1) {
      const key = formatCalendarDate(
        shiftCalendarDay(today, -offset),
      );

      daily.set(key, {
        date: key,
        orderCount: 0,
        grossRevenue: 0,
        netRevenue: 0,
        refunds: 0,
      });
    }

    for (const order of orders) {
      const date = formatBusinessDate(new Date(order.shopify_created_at));
      const current = daily.get(date) ?? {
        date,
        orderCount: 0,
        grossRevenue: 0,
        netRevenue: 0,
        refunds: 0,
      };

      current.orderCount += 1;
      current.grossRevenue += numberFromDatabase(order.gross_total);
      current.netRevenue += numberFromDatabase(order.net_revenue);
      current.refunds += numberFromDatabase(order.refunds);
      daily.set(date, current);
    }

    return {
      range,
      currency: getCurrency(orders),
      days: [...daily.values()].sort((left, right) =>
        left.date.localeCompare(right.date)
      ),
    };
  },

  async getTopProducts(
    range: ShopifyTradingRange,
    limit = 10,
  ): Promise<ShopifyTopProduct[]> {
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
    const { data, error } = await supabaseAdmin
      .from("vault_shopify_order_lines")
      .select(`
        shopify_product_id,
        title,
        quantity,
        refunded_quantity,
        net_line_revenue,
        order:vault_shopify_orders!inner(
          shopify_created_at,
          cancelled_at
        )
      `)
      .gte("order.shopify_created_at", range.from)
      .lt("order.shopify_created_at", range.to)
      .is("order.cancelled_at", null);

    if (error) {
      throw new Error(`Unable to aggregate Shopify product sales: ${error.message}`);
    }

    const products = new Map<string, ShopifyTopProduct>();

    for (const line of data ?? []) {
      if (!line.shopify_product_id) {
        continue;
      }

      const current = products.get(line.shopify_product_id) ?? {
        productId: line.shopify_product_id,
        title: line.title,
        unitsSold: 0,
        netRevenue: 0,
      };

      current.unitsSold += Math.max(
        0,
        line.quantity - line.refunded_quantity,
      );
      current.netRevenue += numberFromDatabase(line.net_line_revenue);
      products.set(line.shopify_product_id, current);
    }

    return [...products.values()]
      .sort((left, right) =>
        right.unitsSold - left.unitsSold ||
        right.netRevenue - left.netRevenue
      )
      .slice(0, safeLimit);
  },
} as const;
