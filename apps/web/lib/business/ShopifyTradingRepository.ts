import "server-only";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

const BUSINESS_TIME_ZONE = "Europe/London";

export type ShopifyTradingRange = {
  from: string;
  to: string;
};

export type ShopifyCalendarRevenue = Record<"week" | "month" | "threeMonths" | "sixMonths" | "year", {
  range: ShopifyTradingRange;
  netRevenue: number;
  currency: string | null;
} | null>;

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

export type ShopifyRecentOrderSummary = {
  id: string;
  displayName: string;
  fulfilmentStatus: string | null;
  quantity: number | null;
  netRevenue: number;
  currency: string;
  createdAt: string;
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

export type ShopifyOperationsSnapshot = {
  awaitingFulfilment: number;
  updatedAt: string;
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

export function getCalendarRevenueRanges(now = new Date()) {
  const today = getZonedParts(now);
  const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
  const monday = shiftCalendarDay(today, -((weekday + 6) % 7));
  const to = now.toISOString();
  const currentMonthStart = getZonedMidnight(today.year, today.month, 1).toISOString();

  return {
    week: { from: getZonedMidnight(monday.year, monday.month, monday.day).toISOString(), to },
    month: { from: getZonedMidnight(today.year, today.month, 1).toISOString(), to },
    threeMonths: {
      from: getZonedMidnight(today.year, today.month - 3, 1).toISOString(),
      to: currentMonthStart,
    },
    sixMonths: {
      from: getZonedMidnight(today.year, today.month - 6, 1).toISOString(),
      to: currentMonthStart,
    },
    year: { from: getZonedMidnight(today.year, 1, 1).toISOString(), to },
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
  page?: { offset: number; size: number },
): Promise<OrderSummaryRow[]> {
  let query = supabaseAdmin
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
    .is("cancelled_at", null)
    .eq("metadata->>test", false);

  if (page) {
    query = query.order("shopify_created_at").order("id")
      .range(page.offset, page.offset + page.size - 1);
  }
  const { data, error } = await query;

  if (error) {
    throw new Error(`Unable to read canonical Shopify orders: ${error.message}`);
  }

  if (page && data === null) {
    throw new Error("Canonical Shopify order data is unavailable");
  }

  return (data ?? []) as OrderSummaryRow[];
}

export const ShopifyTradingRepository = {
  async getCalendarRevenue(now = new Date()): Promise<ShopifyCalendarRevenue> {
    const ranges = getCalendarRevenueRanges(now);
    const summary = async (range: ShopifyTradingRange) => {
      // Page every period: a year can exceed the database API's row limit.
      const orders: OrderSummaryRow[] = [];
      const size = 500;
      for (let offset = 0; ; offset += size) {
        const page = await getOrdersInRange(range, { offset, size });
        orders.push(...page);
        if (page.length < size) break;
      }
      const netRevenue = orders.reduce((total, order) => {
        if (order.net_revenue === null || order.net_revenue === undefined || order.net_revenue === "") {
          throw new Error("Canonical Shopify net revenue is unavailable");
        }
        // Stored net revenue already reflects refunds, exactly as in today's summary.
        return total + numberFromDatabase(order.net_revenue);
      }, 0);
      return { range, netRevenue, currency: getCurrency(orders) };
    };
    const [week, month, threeMonths, sixMonths, year] = await Promise.all([
      summary(ranges.week).catch(() => null),
      summary(ranges.month).catch(() => null),
      summary(ranges.threeMonths).catch(() => null),
      summary(ranges.sixMonths).catch(() => null),
      summary(ranges.year).catch(() => null),
    ]);
    return { week, month, threeMonths, sixMonths, year };
  },

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

  async getOperationsSnapshot(): Promise<ShopifyOperationsSnapshot | null> {
    const [ordersResult, latestSyncAt] = await Promise.all([
      supabaseAdmin
        .from("vault_shopify_orders")
        .select("id", { count: "exact", head: true })
        .is("cancelled_at", null)
        .eq("metadata->>test", false)
        .in("fulfilment_status", [
          "UNFULFILLED",
          "PARTIALLY_FULFILLED",
          "ON_HOLD",
          "SCHEDULED",
        ]),
      this.getLatestSyncAt(),
    ]);

    if (ordersResult.error) {
      throw new Error(
        `Unable to read canonical Shopify fulfilment state: ${ordersResult.error.message}`,
      );
    }

    if (ordersResult.count === null || latestSyncAt === null) return null;

    return {
      awaitingFulfilment: ordersResult.count,
      updatedAt: latestSyncAt,
    };
  },

  async getRecentOrderSummaries(): Promise<ShopifyRecentOrderSummary[]> {
    const { data: orders, error } = await supabaseAdmin
      .from("vault_shopify_orders")
      .select("id, order_name, order_number, net_revenue, currency, shopify_created_at, fulfilment_status")
      .eq("source", "shopify")
      .eq("metadata->>test", false)
      .is("cancelled_at", null)
      .order("shopify_created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(3);
    if (error || orders === null) throw new Error("Recent canonical orders unavailable");
    if (!orders.length) return [];

    const quantities = new Map<string, number>();
    // Page line quantities so API row limits cannot silently undercount units.
    for (let offset = 0; ; offset += 500) {
      const { data: lines, error: lineError } = await supabaseAdmin
        .from("vault_shopify_order_lines")
        .select("id, order_id, quantity")
        .in("order_id", orders.map((order) => order.id))
        .order("id")
        .range(offset, offset + 499);
      if (lineError || lines === null) throw new Error("Recent order quantities unavailable");
      for (const line of lines) {
        if (!Number.isSafeInteger(line.quantity) || line.quantity < 0) throw new Error("Invalid order quantity");
        quantities.set(line.order_id, (quantities.get(line.order_id) ?? 0) + line.quantity);
      }
      if (lines.length < 500) break;
    }
    return orders.map((order) => {
      if (order.net_revenue === null || order.net_revenue === undefined || order.net_revenue === "" ||
          !/^[A-Z]{3}$/.test(order.currency ?? "") || !Number.isFinite(Date.parse(order.shopify_created_at))) {
        throw new Error("Recent order accounting data unavailable");
      }
      return {
        id: order.id,
        displayName: order.order_name || (order.order_number ? "#" + order.order_number : "Order"),
        fulfilmentStatus: order.fulfilment_status,
        quantity: quantities.get(order.id) ?? null,
        netRevenue: numberFromDatabase(order.net_revenue),
        currency: order.currency,
        createdAt: order.shopify_created_at,
      };
    });
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
      .eq("metadata->>test", false)
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
      .is("order.cancelled_at", null)
      .eq("order.metadata->>test", false);

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
