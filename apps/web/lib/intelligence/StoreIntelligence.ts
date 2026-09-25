import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildProductMomentum as calculateProductMomentum } from "@/lib/intelligence/ProductMomentumEngine";
import { assessInventory, type InventoryAssessment, type InventoryVariant } from "@/lib/intelligence/ProductInventoryIntelligence";
import { assessModels, resolveCanonicalCatalogueVariantStructure, type ModelAssessment } from "@/lib/intelligence/CatalogueVariantStructure";
import { InventorySyncRepository } from "@/lib/inventory/InventorySyncRepository";

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
export type ProfitPeriod = "7d" | "30d" | "90d" | "all";
export function parseProfitPeriod(value: unknown): ProfitPeriod { return value === "7d" || value === "30d" || value === "90d" || value === "all" ? value : "30d"; }
export function profitPeriodBounds(period: ProfitPeriod, now = new Date()): { from: string; to: string } | null {
  if (period === "all") return null;
  const days = Number(period.slice(0, -1));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const end = new Date(`${today}T00:00:00+00:00`); const from = new Date(end); from.setUTCDate(from.getUTCDate() - days);
  return { from: from.toISOString(), to: end.toISOString() };
}

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
  shopify_variant_id: string | null;
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
  status: "accelerating" | "emerging" | "stable" | "cooling" | "insufficient_data";
  evidence: string;
  recommendedAction: string;
  variantIds: string[];
  sold7: number;
  inventory: InventoryAssessment;
  models: ModelAssessment[];
  modelGrouping: "resolved" | "ambiguous" | "unavailable";
};

export type ProductProfitability = {
  productId: string; productName: string; eligibleUnits: number; verifiedRevenue: number;
  cogs: number; shippingCost: number; paymentFees: number; contribution: number;
  contributionPerUnit: number | null; contributionMarginPct: number | null;
  revenueCoveragePct: number | null; excludedOrders: number;
};

export type ProductProfitabilitySummary = { verifiedContribution: number; verifiedRevenue: number; verifiedRevenueCoveragePct: number | null };

type ShopifyVariantRow = {
  id: string;
  product_id: string;
  source_variant_id: string;
  option_1: string | null;
  option_2: string | null;
  option_3: string | null;
  model_design: string | null;
  normalized_size: string | null;
  identity_resolution_status: string | null;
  available_for_sale: boolean;
  source_active: boolean;
};

function hasResolvedSemanticIdentity(variant: ShopifyVariantRow): variant is ShopifyVariantRow & { model_design: string; normalized_size: string; identity_resolution_status: "resolved" } {
  return variant.identity_resolution_status === "resolved" && Boolean(variant.model_design?.trim()) && Boolean(variant.normalized_size?.trim());
}

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
  productProfitability: ProductProfitability[];
  productProfitabilitySummary: ProductProfitabilitySummary;
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

function isMerchandiseProduct(title: string): boolean {
  return !/vault\s*care|return\s*protection/i.test(title);
}

function momentumConfidence(currentUnits: number, previousUnits: number): Confidence {
  const total = currentUnits + previousUnits;
  if (total >= 24 && Math.min(currentUnits, previousUnits) >= 6) return "high";
  if (total >= 12 && Math.min(currentUnits, previousUnits) >= 3) return "medium";
  return "low";
}

function productRecommendation(value: {
  currentUnits: number;
  previousUnits: number;
  currentRevenue: number;
  previousRevenue: number;
  unitChange: number | null;
}): Pick<ProductMomentum, "status" | "confidence" | "evidence" | "recommendedAction"> {
  const { currentUnits, previousUnits, currentRevenue, previousRevenue, unitChange } = value;
  const totalUnits = currentUnits + previousUnits;
  const confidence = momentumConfidence(currentUnits, previousUnits);
  const revenueEvidence = `Net units: ${currentUnits} vs ${previousUnits}; net revenue: £${currentRevenue.toFixed(2)} vs £${previousRevenue.toFixed(2)}.`;

  if (previousUnits === 0 && currentUnits > 0) {
    return {
      status: "emerging", confidence: currentUnits >= 12 ? "medium" : "low",
      evidence: `${revenueEvidence} New demand has no prior 14-day unit baseline.`,
      recommendedAction: "Monitor another 7–14 days before increasing purchasing.",
    };
  }
  if (totalUnits < 6 || confidence === "low") {
    return {
      status: "insufficient_data", confidence,
      evidence: `${revenueEvidence} Too few net units across both periods for a reliable decision.`,
      recommendedAction: "Monitor another 7–14 days before increasing purchasing.",
    };
  }
  if (unitChange !== null && unitChange >= 0.25) {
    return {
      status: "accelerating", confidence,
      evidence: `${revenueEvidence} Net-unit demand is up ${round(unitChange * 100, 0)}% period over period.`,
      recommendedAction: "Protect stock / consider increasing reorder quantity. Consider prioritising this product for promotion; Meta spend remains locked.",
    };
  }
  if (unitChange !== null && unitChange <= -0.25) {
    return {
      status: "cooling", confidence,
      evidence: `${revenueEvidence} Net-unit demand is down ${round(Math.abs(unitChange) * 100, 0)}% period over period.`,
      recommendedAction: "Review declining demand before reordering.",
    };
  }
  return {
    status: "stable", confidence,
    evidence: `${revenueEvidence} Net-unit demand is broadly unchanged period over period.`,
    recommendedAction: "Maintain current stock level.",
  };
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

function legacyBuildProductMomentum(
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
    if (!isMerchandiseProduct(line.title)) continue;
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

      const recommendation = productRecommendation({
        currentUnits: value.currentUnits, previousUnits: value.previousUnits,
        currentRevenue: round(value.currentRevenue), previousRevenue: round(value.previousRevenue), unitChange,
      });
      return {
        title,
        currentUnits: value.currentUnits,
        previousUnits: value.previousUnits,
        currentRevenue: round(value.currentRevenue),
        previousRevenue: round(value.previousRevenue),
        unitChange,
        direction,
        variantIds: [],
        sold7: 0,
        inventory: { state: "inventory_unavailable", stock: null, sold7: 0, sold14: value.currentUnits, dailyVelocity: null, daysCover: null, priority: "watch", missingSizes: [], lowSizes: [], freshness: "unavailable", action: "Inventory unavailable. No reorder recommendation made." } as InventoryAssessment,
        models: [],
        modelGrouping: "unavailable" as const,
        ...recommendation,
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
  if (sevenDay && sevenDay.revenueChange !== null && Math.abs(sevenDay.revenueChange) >= 0.12) {
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
  async getSnapshot(profitPeriod: ProfitPeriod = "30d"): Promise<StoreIntelligenceSnapshot> {
    const ordersResult = await supabaseAdmin
      .from("vault_shopify_orders")
      .select("id, shopify_created_at, net_revenue, gross_total, refunds, cancelled_at, metadata")
      .gte("shopify_created_at", ANALYTICS_START)
      .order("shopify_created_at", { ascending: true })
      .limit(5000);

    if (ordersResult.error) throw new Error(ordersResult.error.message);

    const profitBounds = profitPeriodBounds(profitPeriod);
    const profitabilityQuery = supabaseAdmin.from("vault_shopify_verified_product_profitability_line_allocations").select("shopify_created_at,product_id,product_name,order_id,eligible_units,allocated_total_revenue_gbp,trusted_direct_sale_time_cogs_gbp,allocated_shipping_cost_gbp,allocated_payment_fees_gbp,operational_contribution_gbp");
    const coverageQuery = supabaseAdmin.from("vault_shopify_product_profitability_coverage_lines").select("shopify_created_at,product_id,order_id,stage_1_eligible,units,revenue");
    const [profitabilityResult, coverageResult] = await Promise.all([
      profitBounds ? profitabilityQuery.gte("shopify_created_at", profitBounds.from).lt("shopify_created_at", profitBounds.to) : profitabilityQuery,
      profitBounds ? coverageQuery.gte("shopify_created_at", profitBounds.from).lt("shopify_created_at", profitBounds.to) : coverageQuery,
    ]);
    if (profitabilityResult.error) throw new Error(profitabilityResult.error.message);
    if (coverageResult.error) throw new Error(coverageResult.error.message);
    const coverageByProduct = new Map<string, { eligibleRevenue: number; excludedRevenue: number; excludedOrders: Set<string> }>();
    for (const row of coverageResult.data ?? []) { const item = coverageByProduct.get((row as any).product_id) ?? { eligibleRevenue: 0, excludedRevenue: 0, excludedOrders: new Set<string>() }; if ((row as any).stage_1_eligible) item.eligibleRevenue += amount((row as any).revenue); else { item.excludedRevenue += amount((row as any).revenue); item.excludedOrders.add((row as any).order_id); } coverageByProduct.set((row as any).product_id, item); }
    const totals = new Map<string, any>(); for (const row of profitabilityResult.data ?? []) { const current = totals.get((row as any).product_id) ?? { ...row, eligible_units: 0, allocated_total_revenue_gbp: 0, trusted_direct_sale_time_cogs_gbp: 0, allocated_shipping_cost_gbp: 0, allocated_payment_fees_gbp: 0, operational_contribution_gbp: 0 }; for (const key of ["eligible_units","allocated_total_revenue_gbp","trusted_direct_sale_time_cogs_gbp","allocated_shipping_cost_gbp","allocated_payment_fees_gbp","operational_contribution_gbp"]) current[key] += amount((row as any)[key]); totals.set((row as any).product_id, current); }
    const productProfitability = [...totals.values()].map((row: any): ProductProfitability => { const coverage = coverageByProduct.get(row.product_id); const eligibleRevenue = coverage?.eligibleRevenue ?? 0, excludedRevenue = coverage?.excludedRevenue ?? 0; const contribution = amount(row.operational_contribution_gbp), units = amount(row.eligible_units), revenue = amount(row.allocated_total_revenue_gbp); return { productId: row.product_id, productName: row.product_name, eligibleUnits: units, verifiedRevenue: revenue, cogs: amount(row.trusted_direct_sale_time_cogs_gbp), shippingCost: amount(row.allocated_shipping_cost_gbp), paymentFees: amount(row.allocated_payment_fees_gbp), contribution, contributionPerUnit: units > 0 ? contribution / units : null, contributionMarginPct: revenue > 0 ? contribution / revenue * 100 : null, revenueCoveragePct: eligibleRevenue + excludedRevenue > 0 ? eligibleRevenue / (eligibleRevenue + excludedRevenue) : null, excludedOrders: coverage?.excludedOrders.size ?? 0 }; }).sort((a,b)=>b.contribution-a.contribution||a.productName.localeCompare(b.productName));
    const verifiedRevenue = productProfitability.reduce((sum, row) => sum + row.verifiedRevenue, 0);
    const eligibleCoverageRevenue = [...coverageByProduct.values()].reduce((sum, row) => sum + row.eligibleRevenue, 0);
    const excludedCoverageRevenue = [...coverageByProduct.values()].reduce((sum, row) => sum + row.excludedRevenue, 0);
    const productProfitabilitySummary: ProductProfitabilitySummary = { verifiedContribution: productProfitability.reduce((sum, row) => sum + row.contribution, 0), verifiedRevenue, verifiedRevenueCoveragePct: eligibleCoverageRevenue + excludedCoverageRevenue > 0 ? eligibleCoverageRevenue / (eligibleCoverageRevenue + excludedCoverageRevenue) : null };

    const orders = ((ordersResult.data ?? []) as OrderRow[]).filter(
      (order) => !order.cancelled_at && !isTestOrder(order.metadata),
    );

    const orderIds = orders.map((order) => order.id);
    let lines: LineRow[] = [];
    if (orderIds.length > 0) {
      const linesResult = await supabaseAdmin
        .from("vault_shopify_order_lines")
        .select("order_id, title, quantity, refunded_quantity, net_line_revenue, shopify_variant_id")
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
    const rawMomentum = calculateProductMomentum(lines, orderById, now);
    const soldVariantIds = Array.from(new Set(rawMomentum.flatMap((item) => item.variantIds)));
    const freshnessResult = await InventorySyncRepository.getFreshness(now).catch(() => null);
    const inventoryFreshness = freshnessResult?.syncStatus === "current" ? "current" as const
      : freshnessResult?.lastInventorySync ? "stale" as const : "unavailable" as const;
    const soldVariantsResult = soldVariantIds.length
      ? await supabaseAdmin.from("vault_variants").select("id, product_id, source_variant_id, option_1, option_2, option_3, model_design, normalized_size, identity_resolution_status, available_for_sale, source_active").eq("source", "shopify").in("source_variant_id", soldVariantIds)
      : { data: [] as unknown[], error: null };
    const inventoryQueryFailed = Boolean(soldVariantsResult.error);
    const mappedVariants = (soldVariantsResult.data ?? []) as ShopifyVariantRow[];
    const productIds = Array.from(new Set(mappedVariants.map((variant) => variant.product_id)));
    const catalogueVariantsResult = productIds.length && !inventoryQueryFailed
      ? await supabaseAdmin.from("vault_variants").select("id, product_id, source_variant_id, option_1, option_2, option_3, model_design, normalized_size, identity_resolution_status, available_for_sale, source_active").eq("source", "shopify").in("product_id", productIds)
      : { data: [] as unknown[], error: inventoryQueryFailed ? new Error("sold variant mapping unavailable") : null };
    const catalogueQueryFailed = inventoryQueryFailed || Boolean(catalogueVariantsResult.error);
    const allVariants = (catalogueVariantsResult.data ?? []) as ShopifyVariantRow[];
    const variantIds = allVariants.map((variant) => variant.id);
    const levelsResult = variantIds.length && !catalogueQueryFailed
      ? await supabaseAdmin.from("vault_inventory_levels").select("variant_id, available_quantity").in("variant_id", variantIds)
      : { data: [] as unknown[], error: catalogueQueryFailed ? new Error("catalogue inventory mapping unavailable") : null };
    const levelsQueryFailed = catalogueQueryFailed || Boolean(levelsResult.error);
    const levelsByVariant = new Map<string, number[]>();
    for (const level of (levelsResult.data ?? []) as Array<{ variant_id: string; available_quantity: number }>) levelsByVariant.set(level.variant_id, [...(levelsByVariant.get(level.variant_id) ?? []), level.available_quantity]);
    const semanticVariants = allVariants.filter(hasResolvedSemanticIdentity);
    const inventoryVariants: InventoryVariant[] = semanticVariants.map((variant) => ({ sourceVariantId: variant.source_variant_id, productId: variant.product_id, size: variant.normalized_size, availableForSale: variant.available_for_sale, available: levelsByVariant.has(variant.id) ? levelsByVariant.get(variant.id)!.reduce((sum, value) => sum + value, 0) : null, sold14: 0 }));
    const modelSales = new Map<string, { sold7: number; sold14: number; previous14: number }>();
    for (const line of lines) { if (!line.shopify_variant_id || !orderById.has(line.order_id)) continue; const time = new Date(orderById.get(line.order_id)!.shopify_created_at).getTime(); const net = Math.max(0, Number(line.quantity) - Number(line.refunded_quantity)); if (time < now.getTime() - 28 * 86400000 || time > now.getTime()) continue; const value = modelSales.get(line.shopify_variant_id) ?? { sold7: 0, sold14: 0, previous14: 0 }; if (time >= now.getTime() - 7 * 86400000) value.sold7 += net; if (time >= now.getTime() - 14 * 86400000) value.sold14 += net; else value.previous14 += net; modelSales.set(line.shopify_variant_id, value); }
    const structures = new Map(productIds.map((productId) => [productId, resolveCanonicalCatalogueVariantStructure(productId, allVariants.filter((v) => v.product_id === productId).map((v) => ({ id: v.id, productId: v.product_id, sourceVariantId: v.source_variant_id, option1: v.option_1, option2: v.option_2, option3: v.option_3, modelDesign: v.model_design, normalizedSize: v.normalized_size, identityResolutionStatus: v.identity_resolution_status, sourceActive: v.source_active === true, availableForSale: v.available_for_sale, available: levelsByVariant.has(v.id) ? levelsByVariant.get(v.id)!.reduce((sum, value) => sum + value, 0) : null })))]));
    const momentum = rawMomentum.map((item) => { const ids = new Set(item.variantIds.map((id) => mappedVariants.find((v) => v.source_variant_id === id)?.product_id).filter(Boolean)); const productId = ids.size === 1 ? [...ids][0]! : null; const structure = productId ? structures.get(productId) : undefined; return { ...item, inventory: assessInventory({ momentum: item, sold7: item.sold7, sold14: item.currentUnits, soldVariantIds: item.variantIds, variants: inventoryVariants, freshness: inventoryFreshness, queryFailed: levelsQueryFailed }), models: structure ? assessModels(structure, modelSales, inventoryFreshness, levelsQueryFailed) : [], modelGrouping: !structure ? "unavailable" as const : structure.state, }; });
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
      productProfitability,
      productProfitabilitySummary,
      insights: buildInsights(weekdays, twoItemOrderShare, bestSundayWindow, trends, momentum),
      metaStatus: "pending",
    };
  },
} as const;
