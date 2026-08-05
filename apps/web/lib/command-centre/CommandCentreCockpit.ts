import type { BusinessActivityEvent } from "@/lib/business/BusinessActivityRepository";
import type { CommercialDecisionTimelineResult } from "@/lib/brain/CommercialDecisionTimeline";

export type CockpitValue<T> =
  | { state: "available" | "stale"; value: T; updatedAt: string | null }
  | { state: "unavailable" | "not_connected" | "pending"; value: null; updatedAt: null };

export type CockpitMoney = { amount: number; currency: string };

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

export type CommandCentreCockpitData = {
  generatedAt: string;
  systemStatus: "live" | "stale" | "partial" | "unavailable" | "error";
  latestSourceAt: string | null;
  brainConfidence: CockpitValue<number>;
  trading: {
    revenue: CockpitValue<CockpitMoney>;
    orders: CockpitValue<number>;
    units: CockpitValue<number>;
    averageOrderValue: CockpitValue<CockpitMoney>;
    revenueComparison: CockpitValue<number>;
    orderComparison: CockpitValue<number>;
  };
  website: {
    visitors: CockpitValue<number>;
    sessions: CockpitValue<number>;
    liveVisitors: CockpitValue<number>;
    conversionRate: CockpitValue<number>;
    addToCartRate: CockpitValue<number>;
    checkoutRate: CockpitValue<number>;
    abandonedCheckouts: CockpitValue<number>;
    ukTrafficPercentage: CockpitValue<number>;
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

export function limitInsights(insights: CockpitInsight[]): CockpitInsight[] {
  return insights.slice(0, 4);
}

export function limitFeed(events: BusinessActivityEvent[]): BusinessActivityEvent[] {
  return events.slice(0, 3);
}
