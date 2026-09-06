import type { CashLedgerRepository } from "@/lib/business/CashLedgerRepository";
import type { ShopifyPaymentsPayout } from "@/lib/business/ShopifyPaymentsRepository";
import type { BusinessActivityEvent } from "@/lib/business/BusinessActivityRepository";
import type { CommercialDecisionTimelineResult } from "@/lib/brain/CommercialDecisionTimeline";
import type { ExecutiveBriefing } from "@/lib/brain/ExecutiveIntelligenceEngine";
import type { InventorySyncStatus } from "@/lib/inventory/InventoryFreshness";
import type { ShopifyCalendarRevenue, ShopifyRecentOrderSummary } from "@/lib/business/ShopifyTradingRepository";

export type CockpitValue<T> =
  | { state: "available" | "stale"; value: T; updatedAt: string | null }
  | { state: "unavailable" | "not_connected" | "pending"; value: null; updatedAt: null };

export type CockpitMoney = { amount: number; currency: string };

export type CockpitTrendPoint = {
  label: string;
  value: number;
};

export type CockpitInsight = {
  id: string;
  tone: "positive" | "warning" | "neutral";
  title: string;
  detail: string | null;
};

export type CockpitAttentionItem = {
  id: string;
  priority: "critical" | "high" | "medium" | "low" | "informational";
  title: string;
  description: string | null;
  destination: string;
};

export type BusinessPulseState =
  | "healthy"
  | "watch"
  | "attention"
  | "critical"
  | "unavailable";

export type DomainPulseState = BusinessPulseState | "not_connected";

export type DomainPulse = {
  domain: "Trading" | "Website" | "Inventory" | "Finance" | "Marketing" | "Operations" | "Suppliers" | "Advisor";
  state: DomainPulseState;
  detail: string;
};

export type TodaysFocus =
  | {
    state: "available";
    source: "advisor" | "timeline" | "blocker";
    title: string;
    description: string | null;
    destination: string;
    blockerReasons: string[];
  }
  | { state: "unavailable" };

export type CommandCentreCockpitData = {
  generatedAt: string;
  systemStatus: "live" | "stale" | "partial" | "unavailable" | "error";
  latestSourceAt: string | null;
  brainConfidence: CockpitValue<number>;
  businessPulse: { state: BusinessPulseState; label: string };
  domains: DomainPulse[];
  todaysFocus: TodaysFocus;
  executiveBriefing: ExecutiveBriefing;
  trading: {
    revenue: CockpitValue<CockpitMoney>;
    calendarRevenue: Record<"week" | "month" | "threeMonths" | "sixMonths" | "year", CockpitValue<CockpitMoney>>;
    recentOrders: CockpitValue<Array<ShopifyRecentOrderSummary & { destination: string }>>;
    orders: CockpitValue<number>;
    units: CockpitValue<number>;
    averageOrderValue: CockpitValue<CockpitMoney>;
    revenueComparison: CockpitValue<number>;
    orderComparison: CockpitValue<number>;
    revenueTrend: CockpitTrendPoint[];
    orderTrend: CockpitTrendPoint[];
  };
  website: {
    trackedVisitors: CockpitValue<number>;
    estimatedUntrackedVisitors: CockpitValue<number>;
    estimatedTotalVisitors: CockpitValue<number>;
    sessions: CockpitValue<number>;
    liveTrackedVisitors: CockpitValue<number>;
    conversionRate: CockpitValue<number>;
    addToCartToday: CockpitValue<number>;
    checkoutStartedToday: CockpitValue<number>;
    checkoutCompletedToday: CockpitValue<number>;
    addToCartRate: CockpitValue<number>;
    checkoutRate: CockpitValue<number>;
    abandonedCheckouts: CockpitValue<number>;
    visitorTrend: CockpitTrendPoint[];
    shopifyAnalytics: {
      availability: "live" | "stale" | "unavailable" | "pending_permission";
      reportingTimezone: string | null;
      sessions: CockpitValue<number>;
      visitors: CockpitValue<number>;
      cartAdditions: CockpitValue<number>;
      reachedCheckout: CockpitValue<number>;
      completedCheckout: CockpitValue<number>;
      conversionRate: CockpitValue<number>;
      sessionTrend: CockpitTrendPoint[];
    };
  };
  meta: {
    connection: "live" | "stale" | "unavailable" | "pending_configuration";
    spend: CockpitValue<CockpitMoney>;
    attributedRevenue: CockpitValue<CockpitMoney>;
    roas: CockpitValue<number>;
    impressions: CockpitValue<number>;
    clickThroughRate: CockpitValue<number>;
    costPerClick: CockpitValue<CockpitMoney>;
    purchases: CockpitValue<number>;
  };
  finance: {
    recentLedger: CockpitValue<Awaited<ReturnType<typeof CashLedgerRepository.getRecentEntries>>>;
    todayPayout: CockpitValue<{ label: string; money: CockpitMoney | null }>;
    ledgerCash: CockpitValue<CockpitMoney>;
    purchasingPower: CockpitValue<CockpitMoney>;
    protectedReserve: CockpitValue<CockpitMoney>;
    committedPurchaseOrders: CockpitValue<CockpitMoney>;
  };
  inventory: {
    lowStockStyles: CockpitValue<number>;
    outOfStockStyles: CockpitValue<number>;
    stockValue: CockpitValue<CockpitMoney>;
    freshness: CockpitValue<string>;
    reorderReview: CockpitValue<number>;
  };
  operations: {
    awaitingFulfilment: CockpitValue<number>;
    dispatchedToday: CockpitValue<number>;
    refundsToday: CockpitValue<number>;
    supplierIssues: CockpitValue<number>;
    lateDeliveries: CockpitValue<number>;
  };
  insights: CockpitInsight[];
  attention: CockpitAttentionItem[];
  feed: BusinessActivityEvent[];
};

export const unavailable = <T>(): CockpitValue<T> => ({
  state: "unavailable",
  value: null,
  updatedAt: null,
});

export function createCalendarRevenueValues(
  summary: ShopifyCalendarRevenue | null,
  updatedAt: string | null,
  stale: boolean,
  fallbackCurrency: string | null,
): CommandCentreCockpitData["trading"]["calendarRevenue"] {
  const currency = fallbackCurrency ?? summary?.year?.currency ?? summary?.month?.currency ?? null;
  const value = (period: "week" | "month" | "threeMonths" | "sixMonths" | "year"): CockpitValue<CockpitMoney> => {
    const total = summary?.[period];
    const periodCurrency = total?.currency ?? currency;
    if (!total || !updatedAt || !periodCurrency || !Number.isFinite(total.netRevenue)) return unavailable();
    return {
      state: stale ? "stale" : "available",
      value: { amount: total.netRevenue, currency: periodCurrency },
      updatedAt,
    };
  };
  return { week: value("week"), month: value("month"), threeMonths: value("threeMonths"), sixMonths: value("sixMonths"), year: value("year") };
}

export const notConnected = <T>(): CockpitValue<T> => ({
  state: "not_connected",
  value: null,
  updatedAt: null,
});

export function createWebsiteTrafficBreakdown({
  tracked,
  estimatedUntracked,
  estimatedTotal,
  liveTracked,
  updatedAt,
  stale,
}: {
  tracked: number | null;
  estimatedUntracked: number | null;
  estimatedTotal: number | null;
  liveTracked: number | null;
  updatedAt: string | null;
  stale: boolean;
}): Pick<CommandCentreCockpitData["website"],
  | "trackedVisitors"
  | "estimatedUntrackedVisitors"
  | "estimatedTotalVisitors"
  | "liveTrackedVisitors"
> {
  const canonical = (value: number | null): CockpitValue<number> =>
    value === null
      ? unavailable()
      : { state: stale ? "stale" : "available", value, updatedAt };

  return {
    trackedVisitors: canonical(tracked),
    estimatedUntrackedVisitors: canonical(estimatedUntracked),
    estimatedTotalVisitors: canonical(estimatedTotal),
    liveTrackedVisitors: canonical(liveTracked),
  };
}

export function selectAttentionItems(
  timeline: CommercialDecisionTimelineResult | null,
): CockpitAttentionItem[] {
  if (!timeline) return [];

  return timeline.items
    .filter((item) =>
      item.source !== "business_event" &&
      item.destination !== null &&
      (item.status === "actionable" ||
        item.status === "blocked" ||
        item.category === "risk" ||
        item.category === "follow_up")
    )
    .slice(0, 4)
    .map((item) => ({
      id: item.id,
      priority: item.priority,
      title: item.title,
      description: item.description,
      destination: item.destination!,
    }));
}

export function reconcileTimelineInventoryFreshness({
  timeline,
  syncStatus,
}: {
  timeline: CommercialDecisionTimelineResult | null;
  syncStatus: InventorySyncStatus | null;
}): CommercialDecisionTimelineResult | null {
  if (!timeline || (syncStatus !== "current" && syncStatus !== "syncing")) {
    return timeline;
  }

  const items = timeline.items.filter((item) =>
    !item.blockerReasons.includes("inventory_stale")
  );
  const itemIds = new Set(items.map((item) => item.id));

  return {
    ...timeline,
    highestPriorityAction: timeline.highestPriorityAction &&
        itemIds.has(timeline.highestPriorityAction.id)
      ? timeline.highestPriorityAction
      : null,
    items,
    groups: timeline.groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => itemIds.has(item.id)),
      }))
      .filter((group) => group.items.length > 0),
  };
}

export function limitInsights(insights: CockpitInsight[]): CockpitInsight[] {
  return insights.slice(0, 4);
}

export function limitFeed(events: BusinessActivityEvent[]): BusinessActivityEvent[] {
  return events.slice(0, 3);
}

const PRIORITY_WEIGHT = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  informational: 1,
} as const;

export function selectTodaysFocus(
  timeline: CommercialDecisionTimelineResult | null,
): TodaysFocus {
  if (!timeline) return { state: "unavailable" };
  const ranked = [...timeline.items].sort((left, right) =>
    PRIORITY_WEIGHT[right.priority] - PRIORITY_WEIGHT[left.priority]
  );
  const selected =
    ranked.find((item) => item.source === "advisor" && item.status === "actionable") ??
    ranked.find((item) => item.status === "actionable") ??
    ranked.find((item) => item.status === "blocked" && item.destination !== null);

  if (!selected?.destination) return { state: "unavailable" };

  return {
    state: "available",
    source: selected.source === "advisor"
      ? "advisor"
      : selected.status === "blocked" ? "blocker" : "timeline",
    title: selected.title,
    description: selected.description,
    destination: selected.destination,
    blockerReasons: selected.blockerReasons,
  };
}

export function deriveBusinessPulse({
  domains,
  attention,
}: {
  domains: DomainPulse[];
  attention: CockpitAttentionItem[];
}): { state: BusinessPulseState; label: string } {
  const mandatory = domains.filter((domain) => domain.domain !== "Marketing");
  const evaluated = mandatory.filter((domain) => domain.state !== "unavailable");
  let state: BusinessPulseState;

  if (evaluated.length === 0) state = "unavailable";
  else if (mandatory.some((domain) => domain.state === "critical") || attention.some((item) => item.priority === "critical")) state = "critical";
  else if (mandatory.some((domain) => domain.state === "attention") || attention.some((item) => item.priority === "high")) state = "attention";
  else if (mandatory.some((domain) => domain.state === "watch" || domain.state === "unavailable")) state = "watch";
  else state = "healthy";

  return { state, label: state.charAt(0).toUpperCase() + state.slice(1) };
}


export function createTodayPayoutValue(
  payout: ShopifyPaymentsPayout | null,
  source: { status: string; lastUpdatedAt: string | null } | undefined,
  generatedAt: string,
): CommandCentreCockpitData["finance"]["todayPayout"] {
  const londonDate = (at: string) => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(at));
  if (!source || !["live", "stale"].includes(source.status) || !source.lastUpdatedAt ||
      !Number.isFinite(Date.parse(source.lastUpdatedAt)) || !Number.isFinite(Date.parse(generatedAt)) ||
      londonDate(source.lastUpdatedAt) !== londonDate(generatedAt)) return unavailable();
  const age = Date.parse(generatedAt) - Date.parse(source.lastUpdatedAt);
  if (age < 0) return unavailable();
  const state = source.status === "stale" || age > 30 * 60_000 ? "stale" : "available";
  const result = (label: string, money: CockpitMoney | null = null): CommandCentreCockpitData["finance"]["todayPayout"] => ({ state, value: { label, money }, updatedAt: source.lastUpdatedAt });
  if (!payout) return result("No payout today");
  if (!Number.isFinite(Date.parse(payout.issuedAt))) return unavailable();
  if (londonDate(payout.issuedAt) !== londonDate(generatedAt)) return result("No payout today");
  // The canonical Payments writer selects DEPOSIT payouts only; no order revenue is used.
  if (!Number.isFinite(payout.amount) || payout.amount < 0 || !/^[A-Z]{3}$/.test(payout.currency)) return unavailable();
  const money = { amount: payout.amount, currency: payout.currency };
  switch (payout.status) {
    case "SCHEDULED": return result("Expected today", money);
    case "IN_TRANSIT": return result("Payout pending", money);
    case "PAID": return result("Payout paid today", money);
    case "FAILED": return result("Payout failed");
    case "CANCELED": return result("Payout canceled");
    case "ACTION_REQUIRED": return result("Payout needs attention");
    default: return unavailable();
  }
}
