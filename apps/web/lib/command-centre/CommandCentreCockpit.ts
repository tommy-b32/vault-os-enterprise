import type { BusinessActivityEvent } from "@/lib/business/BusinessActivityRepository";
import type { CommercialDecisionTimelineResult } from "@/lib/brain/CommercialDecisionTimeline";
import type { ExecutiveBriefing } from "@/lib/brain/ExecutiveIntelligenceEngine";
import type { InventorySyncStatus } from "@/lib/inventory/InventoryFreshness";

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
  };
  meta: {
    connection: "not_connected";
    spend: CockpitValue<CockpitMoney>;
    attributedRevenue: CockpitValue<CockpitMoney>;
    roas: CockpitValue<number>;
    impressions: CockpitValue<number>;
    clickThroughRate: CockpitValue<number>;
    costPerClick: CockpitValue<CockpitMoney>;
    purchases: CockpitValue<number>;
  };
  finance: {
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
