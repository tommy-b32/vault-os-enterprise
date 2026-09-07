import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

const ANALYTICS_START = "2026-05-04T00:00:00+01:00";
const TIME_ZONE = "Europe/London";

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

type Weekday = (typeof WEEKDAYS)[number];

type OrderRow = {
  id: string;
  shopify_created_at: string;
  net_revenue: number | string;
  gross_total: number | string;
  refunds: number | string;
  cancelled_at: string | null;
  metadata: unknown;
};

type LineRow = {
  order_id: string;
  title: string;
  quantity: number;
  refunded_quantity: number;
  net_line_revenue: number | string;
};

export type WeekdayPerformance = {
  day: Weekday;
  orders: number;
  revenue: number;
  observedDays: number;
  averageOrders: number;
  averageRevenue: number;
  aov: number;
};

export type HourWindowPerformance = {
  label: string;
  orders: number;
  revenue: number;
};

export type ProductPerformance = {
  title: string;
  units: number;
  revenue: number;
};

export type StoreInsight = {
  id: string;
  severity: "positive" | "neutral" | "watch";
  title: string;
  summary: string;
  evidence: string;
};

export type StoreIntelligenceSnapshot = {
  generatedAt: string;
  analyticsStart: string;
  sourceOrderCount: number;
  netRevenue: number;
  averageOrderValue: number;
  averageItemsPerOrder: number;
  twoItemOrderShare: number;
  refundRate: number;
  weekdays: WeekdayPerformance[];
  bestWeekday: WeekdayPerformance | null;
  bestSundayWindow: HourWindowPerformance | null;
  topProducts: ProductPerformance[];
  insights: StoreInsight[];
  metaStatus: "pending";
};

function amount(value: number | string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isTestOrder(metadata: unknown): boolean {
  return typeof metadata === "object" && metadata !== null && "test" in metadata &&
    (metadata as { test?: unknown }).test === true;
}

function zonedParts(value: string): { weekday: Weekday; hour: number; dateKey: string } {
  const date = new Date(value);
  const weekday = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: TIME_ZONE,
  }).format(date) as Weekday;
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: TIME_ZONE,
  }).format(date));
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TIME_ZONE,
  }).format(date);
  return { weekday, hour, dateKey };
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildInsights(
  weekdays: WeekdayPerformance[],
  twoItemOrderShare: number,
  bestSundayWindow: HourWindowPerformance | null,
): StoreInsight[] {
  const best = [...weekdays].sort((a, b) => b.averageRevenue - a.averageRevenue)[0];
  const others = weekdays.filter((item) => item.day !== best?.day && item.observedDays > 0);
  const otherAverage = others.length > 0
    ? others.reduce((sum, item) => sum + item.averageRevenue, 0) / others.length
    : 0;
  const uplift = best && otherAverage > 0
    ? ((best.averageRevenue - otherAverage) / otherAverage) * 100
    : 0;

  const insights: StoreInsight[] = [];
  if (best) {
    insights.push({
      id: "best-weekday",
      severity: "positive",
      title: `${best.day} leads store revenue`,
      summary: `${best.day} averages £${best.averageRevenue.toFixed(2)} revenue and ${best.averageOrders.toFixed(2)} orders per observed day.`,
      evidence: otherAverage > 0
        ? `${round(uplift, 0)}% above the average revenue of the other weekdays.`
        : "Highest average weekday revenue in the current canonical dataset.",
    });
  }

  if (twoItemOrderShare >= 0.4) {
    insights.push({
      id: "two-item-basket",
      severity: "positive",
      title: "Two-item baskets dominate",
      summary: `${round(twoItemOrderShare * 100, 0)}% of orders contain exactly two net items.`,
      evidence: "The basket pattern is consistent with the store's multi-buy offer influencing order composition.",
    });
  }

  if (bestSundayWindow) {
    insights.push({
      id: "sunday-window",
      severity: "neutral",
      title: "Sunday peak window detected",
      summary: `${bestSundayWindow.label} is the strongest Sunday purchase window in the canonical dataset.`,
      evidence: `${bestSundayWindow.orders} orders generating £${bestSundayWindow.revenue.toFixed(2)} net revenue.`,
    });
  }

  insights.push({
    id: "meta-pending",
    severity: "watch",
    title: "Meta efficiency comparison pending",
    summary: "Shopify demand patterns are live, but budget recommendations remain locked until Meta spend and purchase-value data are reliable.",
    evidence: "This prevents Vault OS from recommending budget changes from Shopify revenue alone.",
  });

  return insights;
}

export const StoreIntelligence = {
  async getSnapshot(): Promise<StoreIntelligenceSnapshot> {
    const ordersResult = await supabaseAdmin
      .from("vault_shopify_orders")
      .select("id, shopify_created_at, net_revenue, gross_total, refunds, cancelled_at, metadata")
      .gte("shopify_created_at", ANALYTICS_START)
      .order("shopify_created_at", { ascending: true })
      .limit(5000);

    if (ordersResult.error) throw new Error(ordersResult.error.message);

    const orders = ((ordersResult.data ?? []) as OrderRow[]).filter(
      (order) => !order.cancelled_at && !isTestOrder(order.metadata),
    );

    const orderIds = orders.map((order) => order.id);
    let lines: LineRow[] = [];
    if (orderIds.length > 0) {
      const linesResult = await supabaseAdmin
        .from("vault_shopify_order_lines")
        .select("order_id, title, quantity, refunded_quantity, net_line_revenue")
        .in("order_id", orderIds)
        .limit(10000);
      if (linesResult.error) throw new Error(linesResult.error.message);
      lines = (linesResult.data ?? []) as LineRow[];
    }

    const orderById = new Map(orders.map((order) => [order.id, order]));
    const weekdayMap = new Map<Weekday, { orders: number; revenue: number; dates: Set<string> }>(
      WEEKDAYS.map((day) => [day, { orders: 0, revenue: 0, dates: new Set<string>() }]),
    );

    for (const order of orders) {
      const { weekday, dateKey } = zonedParts(order.shopify_created_at);
      const bucket = weekdayMap.get(weekday)!;
      bucket.orders += 1;
      bucket.revenue += amount(order.net_revenue);
      bucket.dates.add(dateKey);
    }

    const firstDate = new Date(ANALYTICS_START);
    const now = new Date();
    for (let cursor = new Date(firstDate); cursor <= now; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const sample = new Date(cursor);
      const { weekday, dateKey } = zonedParts(sample.toISOString());
      weekdayMap.get(weekday)!.dates.add(dateKey);
    }

    const weekdays = WEEKDAYS.map((day) => {
      const bucket = weekdayMap.get(day)!;
      const observedDays = bucket.dates.size;
      return {
        day,
        orders: bucket.orders,
        revenue: round(bucket.revenue),
        observedDays,
        averageOrders: observedDays > 0 ? round(bucket.orders / observedDays) : 0,
        averageRevenue: observedDays > 0 ? round(bucket.revenue / observedDays) : 0,
        aov: bucket.orders > 0 ? round(bucket.revenue / bucket.orders) : 0,
      } satisfies WeekdayPerformance;
    });

    const sundayWindows = [
      { start: 0, end: 5, label: "00:00–05:59" },
      { start: 6, end: 8, label: "06:00–08:59" },
      { start: 9, end: 11, label: "09:00–11:59" },
      { start: 12, end: 14, label: "12:00–14:59" },
      { start: 15, end: 17, label: "15:00–17:59" },
      { start: 18, end: 20, label: "18:00–20:59" },
      { start: 21, end: 23, label: "21:00–23:59" },
    ].map((window) => ({ ...window, orders: 0, revenue: 0 }));

    for (const order of orders) {
      const { weekday, hour } = zonedParts(order.shopify_created_at);
      if (weekday !== "Sunday") continue;
      const window = sundayWindows.find((candidate) => hour >= candidate.start && hour <= candidate.end);
      if (!window) continue;
      window.orders += 1;
      window.revenue += amount(order.net_revenue);
    }

    const bestSundayWindow = [...sundayWindows]
      .sort((a, b) => b.revenue - a.revenue)[0] ?? null;

    const unitsByOrder = new Map<string, number>();
    const products = new Map<string, { units: number; revenue: number }>();
    for (const line of lines) {
      if (!orderById.has(line.order_id)) continue;
      const netUnits = Math.max(0, Number(line.quantity ?? 0) - Number(line.refunded_quantity ?? 0));
      unitsByOrder.set(line.order_id, (unitsByOrder.get(line.order_id) ?? 0) + netUnits);
      const product = products.get(line.title) ?? { units: 0, revenue: 0 };
      product.units += netUnits;
      product.revenue += amount(line.net_line_revenue);
      products.set(line.title, product);
    }

    const totalNetItems = [...unitsByOrder.values()].reduce((sum, value) => sum + value, 0);
    const twoItemOrders = [...unitsByOrder.values()].filter((value) => value === 2).length;
    const netRevenue = orders.reduce((sum, order) => sum + amount(order.net_revenue), 0);
    const grossRevenue = orders.reduce((sum, order) => sum + amount(order.gross_total), 0);
    const refunds = orders.reduce((sum, order) => sum + amount(order.refunds), 0);

    const topProducts = [...products.entries()]
      .map(([title, value]) => ({ title, units: value.units, revenue: round(value.revenue) }))
      .sort((a, b) => b.units - a.units || b.revenue - a.revenue)
      .slice(0, 8);

    const bestWeekday = [...weekdays].sort((a, b) => b.averageRevenue - a.averageRevenue)[0] ?? null;
    const twoItemOrderShare = orders.length > 0 ? twoItemOrders / orders.length : 0;

    return {
      generatedAt: new Date().toISOString(),
      analyticsStart: ANALYTICS_START,
      sourceOrderCount: orders.length,
      netRevenue: round(netRevenue),
      averageOrderValue: orders.length > 0 ? round(netRevenue / orders.length) : 0,
      averageItemsPerOrder: orders.length > 0 ? round(totalNetItems / orders.length) : 0,
      twoItemOrderShare: round(twoItemOrderShare, 4),
      refundRate: grossRevenue > 0 ? round(refunds / grossRevenue, 4) : 0,
      weekdays,
      bestWeekday,
      bestSundayWindow: bestSundayWindow
        ? { label: bestSundayWindow.label, orders: bestSundayWindow.orders, revenue: round(bestSundayWindow.revenue) }
        : null,
      topProducts,
      insights: buildInsights(weekdays, twoItemOrderShare, bestSundayWindow),
      metaStatus: "pending",
    };
  },
} as const;
