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
type Confidence = "low" | "medium" | "high";

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

export type PeriodTrend = {
  label: "7 days" | "30 days";
  currentOrders: number;
  previousOrders: number;
  currentRevenue: number;
  previousRevenue: number;
  currentAov: number;
  previousAov: number;
  orderChange: number | null;
  revenueChange: number | null;
  aovChange: number | null;
  confidence: Confidence;
};

export type ProductMomentum = {
  title: string;
  currentUnits: number;
  previousUnits: number;
  currentRevenue: number;
  previousRevenue: number;
  unitChange: number | null;
  direction: "up" | "down" | "flat" | "new";
  confidence: Confidence;
};

export type StoreInsight = {
  id: string;
  severity: "positive" | "neutral" | "watch";
  title: string;
  summary: string;
  evidence: string;
  confidence?: Confidence;
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
  weakestWeekday: WeekdayPerformance | null;
  bestSundayWindow: HourWindowPerformance | null;
  trends: PeriodTrend[];
  topProducts: ProductPerformance[];
  productMomentum: ProductMomentum[];
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

function percentageChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? null : 0;
  return round((current - previous) / previous, 4);
}

function confidenceForSample(currentOrders: number, previousOrders: number): Confidence {
  const total = currentOrders + previousOrders;
  if (total >= 40) return "high";
  if (total >= 18) return "medium";
  return "low";
}

function periodTrend(orders: OrderRow[], days: 7 | 30, now: Date): PeriodTrend {
  const dayMs = 24 * 60 * 60 * 1000;
  const currentStart = new Date(now.getTime() - days * dayMs);
  const previousStart = new Date(now.getTime() - days * 2 * dayMs);

  const current = orders.filter((order) => {
    const time = new Date(order.shopify_created_at).getTime();
    return time >= currentStart.getTime() && time <= now.getTime();
  });
  const previous = orders.filter((order) => {
    const time = new Date(order.shopify_created_at).getTime();
    return time >= previousStart.getTime() && time < currentStart.getTime();
  });

  const currentRevenue = current.reduce((sum, order) => sum + amount(order.net_revenue), 0);
  const previousRevenue = previous.reduce((sum, order) => sum + amount(order.net_revenue), 0);
  const currentAov = current.length > 0 ? currentRevenue / current.length : 0;
  const previousAov = previous.length > 0 ? previousRevenue / previous.length : 0;

  return {
    label: days === 7 ? "7 days" : "30 days",
    currentOrders: current.length,
    previousOrders: previous.length,
    currentRevenue: round(currentRevenue),
    previousRevenue: round(previousRevenue),
    currentAov: round(currentAov),
    previousAov: round(previousAov),
    orderChange: percentageChange(current.length, previous.length),
    revenueChange: percentageChange(currentRevenue, previousRevenue),
    aovChange: percentageChange(currentAov, previousAov),
    confidence: confidenceForSample(current.length, previous.length),
  };
}

function productMomentum(
  lines: LineRow[],
  orderById: Map<string, OrderRow>,
  now: Date,
): ProductMomentum[] {
  const dayMs = 24 * 60 * 60 * 1000;
  const currentStart = new Date(now.getTime() - 14 * dayMs);
  const previousStart = new Date(now.getTime() - 28 * dayMs);
  const products = new Map<string, {
    currentUnits: number;
    previousUnits: number;
    currentRevenue: number;
    previousRevenue: number;
  }>();

  for (const line of lines) {
    const order = orderById.get(line.order_id);
    if (!order) continue;
    const orderTime = new Date(order.shopify_created_at).getTime();
    if (orderTime < previousStart.getTime() || orderTime > now.getTime()) continue;

    const netUnits = Math.max(0, Number(line.quantity ?? 0) - Number(line.refunded_quantity ?? 0));
    const product = products.get(line.title) ?? {
      currentUnits: 0,
      previousUnits: 0,
      currentRevenue: 0,
      previousRevenue: 0,
    };

    if (orderTime >= currentStart.getTime()) {
      product.currentUnits += netUnits;
      product.currentRevenue += amount(line.net_line_revenue);
    } else {
      product.previousUnits += netUnits;
      product.previousRevenue += amount(line.net_line_revenue);
    }
    products.set(line.title, product);
  }

  return [...products.entries()]
    .map(([title, value]) => {
      const unitChange = percentageChange(value.currentUnits, value.previousUnits);
      let direction: ProductMomentum["direction"] = "flat";
      if (value.previousUnits === 0 && value.currentUnits > 0) direction = "new";
      else if (unitChange !== null && unitChange >= 0.2) direction = "up";
      else if (unitChange !== null && unitChange <= -0.2) direction = "down";

      return {
        title,
        currentUnits: value.currentUnits,
        previousUnits: value.previousUnits,
        currentRevenue: round(value.currentRevenue),
        previousRevenue: round(value.previousRevenue),
        unitChange,
        direction,
        confidence: confidenceForSample(value.currentUnits, value.previousUnits),
      };
    })
    .filter((item) => item.currentUnits + item.previousUnits >= 3)
    .sort((a, b) => {
      const aScore = Math.abs(a.unitChange ?? (a.direction === "new" ? 1 : 0)) * (a.currentUnits + a.previousUnits);
      const bScore = Math.abs(b.unitChange ?? (b.direction === "new" ? 1 : 0)) * (b.currentUnits + b.previousUnits);
      return bScore - aScore || b.currentUnits - a.currentUnits;
    })
    .slice(0, 8);
}

function buildInsights(
  weekdays: WeekdayPerformance[],
  twoItemOrderShare: number,
  bestSundayWindow: HourWindowPerformance | null,
  trends: PeriodTrend[],
  momentum: ProductMomentum[],
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
      confidence: best.observedDays >= 12 ? "high" : best.observedDays >= 6 ? "medium" : "low",
    });
  }

  const sevenDay = trends.find((trend) => trend.label === "7 days");
  if (sevenDay?.revenueChange !== null && Math.abs(sevenDay.revenueChange) >= 0.12) {
    const improving = sevenDay.revenueChange > 0;
    insights.push({
      id: "seven-day-momentum",
      severity: improving ? "positive" : "watch",
      title: improving ? "7-day revenue momentum is rising" : "7-day revenue momentum has softened",
      summary: `Revenue is ${Math.abs(round(sevenDay.revenueChange * 100, 0))}% ${improving ? "higher" : "lower"} than the previous 7-day period.`,
      evidence: `${sevenDay.currentOrders} orders / £${sevenDay.currentRevenue.toFixed(2)} now versus ${sevenDay.previousOrders} orders / £${sevenDay.previousRevenue.toFixed(2)} previously.`,
      confidence: sevenDay.confidence,
    });
  }

  if (twoItemOrderShare >= 0.4) {
    insights.push({
      id: "two-item-basket",
      severity: "positive",
      title: "Two-item baskets dominate",
      summary: `${round(twoItemOrderShare * 100, 0)}% of orders contain exactly two net items.`,
      evidence: "The basket pattern is consistent with the store's multi-buy offer influencing order composition.",
      confidence: "high",
    });
  }

  const strongestMover = momentum.find((item) => item.direction === "up" && item.confidence !== "low");
  if (strongestMover) {
    insights.push({
      id: `product-momentum-${strongestMover.title}`,
      severity: "positive",
      title: `${strongestMover.title} is gaining momentum`,
      summary: `${strongestMover.currentUnits} net units sold in the last 14 days versus ${strongestMover.previousUnits} in the prior 14 days.`,
      evidence: strongestMover.unitChange === null
        ? "Recent sales emerged from a zero-unit prior period."
        : `${round(strongestMover.unitChange * 100, 0)}% unit growth period over period.`,
      confidence: strongestMover.confidence,
    });
  }

  if (bestSundayWindow) {
    insights.push({
      id: "sunday-window",
      severity: "neutral",
      title: "Sunday peak window detected",
      summary: `${bestSundayWindow.label} is the strongest Sunday purchase window in the canonical dataset.`,
      evidence: `${bestSundayWindow.orders} orders generating £${bestSundayWindow.revenue.toFixed(2)} net revenue.`,
      confidence: bestSundayWindow.orders >= 12 ? "high" : bestSundayWindow.orders >= 6 ? "medium" : "low",
    });
  }

  insights.push({
    id: "meta-pending",
    severity: "watch",
    title: "Meta efficiency comparison pending",
    summary: "Shopify demand patterns are live, but budget recommendations remain locked until Meta spend and purchase-value data are reliable.",
    evidence: "This prevents Vault OS from recommending budget changes from Shopify revenue alone.",
  });

  return insights.slice(0, 6);
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

    const trends = [periodTrend(orders, 7, now), periodTrend(orders, 30, now)];
    const momentum = productMomentum(lines, orderById, now);
    const bestWeekday = [...weekdays].sort((a, b) => b.averageRevenue - a.averageRevenue)[0] ?? null;
    const weakestWeekday = [...weekdays].filter((item) => item.observedDays > 0).sort((a, b) => a.averageRevenue - b.averageRevenue)[0] ?? null;
    const twoItemOrderShare = orders.length > 0 ? twoItemOrders / orders.length : 0;

    return {
      generatedAt: now.toISOString(),
      analyticsStart: ANALYTICS_START,
      sourceOrderCount: orders.length,
      netRevenue: round(netRevenue),
      averageOrderValue: orders.length > 0 ? round(netRevenue / orders.length) : 0,
      averageItemsPerOrder: orders.length > 0 ? round(totalNetItems / orders.length) : 0,
      twoItemOrderShare: round(twoItemOrderShare, 4),
      refundRate: grossRevenue > 0 ? round(refunds / grossRevenue, 4) : 0,
      weekdays,
      bestWeekday,
      weakestWeekday,
      bestSundayWindow: bestSundayWindow
        ? { label: bestSundayWindow.label, orders: bestSundayWindow.orders, revenue: round(bestSundayWindow.revenue) }
        : null,
      trends,
      topProducts,
      productMomentum: momentum,
      insights: buildInsights(weekdays, twoItemOrderShare, bestSundayWindow, trends, momentum),
      metaStatus: "pending",
    };
  },
} as const;
