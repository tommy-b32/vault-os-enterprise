import "server-only";

import { CashLedgerRepository } from "@/lib/business/CashLedgerRepository";

import type { PurchasingWalletData } from "@/components/commercial/PurchasingWallet";
import { ExecutiveIntelligenceEngine } from "@/lib/brain/ExecutiveIntelligenceEngine";
import { getCommercialDecisionTimeline } from "@/lib/brain/getCommercialDecisionTimeline";
import { getVaultBusinessState } from "@/lib/business/VaultBusinessState";
import type { FinancePosition } from "@/lib/business/BusinessFinanceRepository";
import { StorefrontFunnelRepository } from "@/lib/business/StorefrontFunnelRepository";
import { ShopifyTradingRepository } from "@/lib/business/ShopifyTradingRepository";
import { ShopifyAnalyticsRepository } from "@/lib/business/ShopifyAnalyticsRepository";
import { MetaAdsRepository } from "@/lib/business/MetaAdsRepository";
import {
  createCalendarRevenueValues,
  createTodayPayoutValue,
  createWebsiteTrafficBreakdown,
  deriveBusinessPulse,
  limitFeed,
  limitInsights,
  reconcileTimelineInventoryFreshness,
  selectAttentionItems,
  selectTodaysFocus,
  unavailable,
  type CockpitInsight,
  type CockpitMoney,
  type CockpitValue,
  type CommandCentreCockpitData,
  type DomainPulse,
} from "@/lib/command-centre/CommandCentreCockpit";
import { supabaseAdmin } from "@/lib/supabase-admin";

function available<T>(value: T, updatedAt: string | null, stale = false): CockpitValue<T> {
  return { state: stale ? "stale" : "available", value, updatedAt };
}

function money(amount: number, currency: string | null): CockpitMoney | null {
  return currency ? { amount, currency } : null;
}

export async function getCommandCentreCockpit(): Promise<CommandCentreCockpitData> {
  const business = await getVaultBusinessState({ refreshExternalSources: false });
  const [timeline, walletResult, funnelResult, operationsResult, shopifyAnalytics, metaAds, calendarRevenue, recentOrders, recentLedger] = await Promise.all([
    getCommercialDecisionTimeline(business.generatedAt),
    supabaseAdmin.from("vault_purchasing_wallet").select(`
      ledger_balance_gbp,
      protected_reserve_gbp,
      committed_orders_gbp,
      calculated_purchasing_power_gbp,
      available_purchasing_power_gbp,
      manual_spending_limit_gbp,
      reserve_override_allowed,
      wallet_last_updated,
      purchasing_power_state
    `).single(),
    StorefrontFunnelRepository.getToday().catch(() => null),
    ShopifyTradingRepository.getOperationsSnapshot().catch(() => null),
    ShopifyAnalyticsRepository.getSnapshot().catch(() => null),
    MetaAdsRepository.getSnapshot().catch(() => null),
    business.trading.data
      ? ShopifyTradingRepository.getCalendarRevenue(new Date(business.generatedAt)).catch(() => null)
      : Promise.resolve(null),
    ShopifyTradingRepository.getRecentOrderSummaries().catch(() => null),
    CashLedgerRepository.getRecentEntries().catch(() => null),
  ]);

  const trading = business.trading.data;
  const tradingStale = business.trading.status === "stale";
  const tradingAt = business.trading.lastUpdatedAt;
  const tradingCurrency = trading?.currency ?? null;
  const visitors = business.websiteAnalytics.data?.visitors ?? null;
  const websiteStale = business.websiteAnalytics.status === "stale";
  const websiteAt = business.websiteAnalytics.lastUpdatedAt;
  const inventory = business.inventory.data;
  const inventoryStale = business.inventory.status === "stale";
  const inventoryAt = business.inventory.lastUpdatedAt;
  const finance = business.finance.data;
  const financeStale = business.finance.status === "stale";
  const wallet = walletResult.error ? null : walletResult.data as PurchasingWalletData;
  const websiteTraffic = createWebsiteTrafficBreakdown({
    tracked: visitors?.tracked ?? null,
    estimatedUntracked: visitors?.estimatedPrivacy ?? null,
    estimatedTotal: visitors?.estimatedTotal ?? null,
    liveTracked: visitors?.liveTracked ?? null,
    updatedAt: websiteAt,
    stale: websiteStale,
  });
  const revenueTrend = trading?.sevenDaySummary.days.map((day) => ({
    label: day.date,
    value: day.netRevenue,
  })) ?? [];
  const orderTrend = trading?.sevenDaySummary.days.map((day) => ({
    label: day.date,
    value: day.orderCount,
  })) ?? [];
  const visitorTrend = business.websiteAnalytics.data?.sevenDayVisitors
    .filter((day) => day.visitors.estimatedTotal !== null)
    .map((day) => ({
      label: day.date,
      value: day.visitors.estimatedTotal!,
    })) ?? [];
  const shopifyToday = shopifyAnalytics?.today ?? null;
  const shopifyValue = (value: number | null | undefined): CockpitValue<number> =>
    value === null || value === undefined || !shopifyAnalytics
      ? shopifyAnalytics?.availability === "pending_permission"
        ? { state: "pending", value: null, updatedAt: null }
        : unavailable()
      : available(value, shopifyAnalytics.fetchedAt, shopifyAnalytics.availability === "stale");
  const canonicalTimeline = reconcileTimelineInventoryFreshness({
    timeline,
    syncStatus: inventory?.sync.syncStatus ?? null,
  });
  const sourceDomain = (
    domain: DomainPulse["domain"],
    status: "live" | "stale" | "unavailable" | "error",
  ): DomainPulse => ({
    domain,
    state: status === "live"
      ? "healthy"
      : status === "stale" ? "watch" : status === "error" ? "attention" : "unavailable",
    detail: status === "live"
      ? "Canonical source current"
      : status === "stale" ? "Canonical source stale" : status === "error" ? "Source error" : "Source unavailable",
  });
  const attention = selectAttentionItems(canonicalTimeline);
  const todaysFocus = selectTodaysFocus(canonicalTimeline);
  const supplierBlocker = canonicalTimeline?.items.find((item) =>
    item.source === "supplier" && item.status === "blocked"
  );
  const advisorAction = canonicalTimeline?.items.find((item) =>
    item.source === "advisor" && item.status === "actionable"
  );
  const advisorNoCandidate = canonicalTimeline?.items.find((item) =>
    item.id === "advisor-no-trusted-candidate"
  );
  const domains: DomainPulse[] = [
    sourceDomain("Trading", business.trading.status),
    sourceDomain("Website", business.websiteAnalytics.status),
    {
      ...sourceDomain("Inventory", business.inventory.status),
      state: inventory?.sync.syncStatus === "failed"
        ? "attention"
        : inventory?.sync.syncStatus === "delayed"
        ? "attention"
        : inventory?.sync.syncStatus === "syncing"
          ? "watch"
        : business.inventory.status === "live" && (inventory?.productsRequiringAttention ?? 0) > 0
          ? "watch"
          : sourceDomain("Inventory", business.inventory.status).state,
      detail: inventory?.sync.syncStatus === "failed"
        ? "Shopify sync failed"
        : inventory?.sync.syncStatus === "delayed"
          ? "Shopify sync delayed"
          : inventory?.sync.syncStatus === "syncing"
            ? "Shopify sync running"
        : business.inventory.status === "live" && (inventory?.productsRequiringAttention ?? 0) > 0
          ? `${inventory?.productsRequiringAttention} styles require attention`
          : sourceDomain("Inventory", business.inventory.status).detail,
    },
    {
      domain: "Finance",
      state: !wallet
        ? "unavailable"
        : wallet.purchasing_power_state === "healthy"
          ? "healthy"
          : wallet.purchasing_power_state === "no_cash" ? "attention" : "watch",
      detail: !wallet
        ? "Purchasing wallet unavailable"
        : wallet.purchasing_power_state === "healthy"
          ? "Purchasing capacity available"
          : wallet.purchasing_power_state === "no_cash"
            ? "No purchasing power"
            : wallet.purchasing_power_state.replaceAll("_", " "),
    },
    {
      domain: "Marketing",
      state: metaAds?.availability === "live"
        ? "healthy"
        : metaAds?.availability === "stale"
          ? "watch"
          : metaAds?.availability === "pending_configuration"
            ? "not_connected"
            : "unavailable",
      detail: metaAds?.availability === "live"
        ? "Meta Ads current"
        : metaAds?.availability === "stale"
          ? "Meta Ads data stale"
          : metaAds?.availability === "pending_configuration"
            ? "Meta Ads configuration pending"
            : "Meta Ads unavailable",
    },
    { domain: "Operations", state: "watch", detail: "Partial visibility" },
    supplierBlocker
      ? { domain: "Suppliers", state: "attention", detail: supplierBlocker.title }
      : { domain: "Suppliers", state: "unavailable", detail: "Aggregate readiness unavailable" },
    advisorAction
      ? { domain: "Advisor", state: "healthy", detail: "Eligible trusted decision" }
      : advisorNoCandidate
        ? { domain: "Advisor", state: "watch", detail: "No trusted candidate" }
        : { domain: "Advisor", state: "unavailable", detail: "Decision state unavailable" },
  ];
  const businessPulse = deriveBusinessPulse({ domains, attention });
  const supportingEvidence: string[] = [];
  if (inventoryAt) supportingEvidence.push(`Inventory source updated ${inventoryAt}.`);
  if (inventory) supportingEvidence.push(`${inventory.totalProducts.toLocaleString("en-GB")} styles analysed.`);
  if (wallet) {
    supportingEvidence.push(
      `${new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(wallet.available_purchasing_power_gbp)} purchasing power available.`,
    );
  }
  if (advisorNoCandidate) supportingEvidence.push("No trusted buying candidate is currently available.");
  if (visitors?.estimatedTotal !== null && visitors?.estimatedTotal !== undefined) {
    supportingEvidence.push(`${visitors.estimatedTotal.toLocaleString("en-GB")} estimated total visitors today.`);
  }
  const executiveBriefing = ExecutiveIntelligenceEngine.build({
    businessPulse,
    domains,
    todayFocus: todaysFocus,
    orderedBlockers: canonicalTimeline?.items
      .filter((item) => item.status === "blocked")
      .map((item) => ({ title: item.title, description: item.description })) ?? [],
    supportingEvidence,
  });

  const unavailableMoney = unavailable<CockpitMoney>();
  const tradingMoney = (amount: number | null): CockpitValue<CockpitMoney> => {
    const value = amount === null ? null : money(amount, tradingCurrency);
    return value ? available(value, tradingAt, tradingStale) : unavailableMoney;
  };
  const insights: CockpitInsight[] = [];

  if (trading) {
    insights.push({
      id: "trading-today",
      tone: trading.netRevenue >= 0 ? "positive" : "warning",
      title: `${trading.orderCount.toLocaleString("en-GB")} orders generated today`,
      detail: trading.currency
        ? `Canonical net revenue is ${new Intl.NumberFormat("en-GB", { style: "currency", currency: trading.currency }).format(trading.netRevenue)}.`
        : "Revenue is available, but its currency is unavailable.",
    });
  }
  if (
    visitors?.tracked !== null && visitors?.tracked !== undefined &&
    visitors.estimatedPrivacy !== null &&
    visitors.estimatedTotal !== null
  ) {
    insights.push({
      id: "website-visitors",
      tone: "neutral",
      title: `${visitors.estimatedTotal.toLocaleString("en-GB")} estimated total visitors today`,
      detail: `${visitors.tracked.toLocaleString("en-GB")} tracked and ${visitors.estimatedPrivacy.toLocaleString("en-GB")} estimated from declined-cookie traffic.`,
    });
  }
  const firstAttention = selectAttentionItems(canonicalTimeline)[0];
  if (firstAttention) {
    insights.push({
      id: `risk-${firstAttention.id}`,
      tone: firstAttention.priority === "critical" || firstAttention.priority === "high" ? "warning" : "neutral",
      title: firstAttention.title,
      detail: firstAttention.description,
    });
  }

  const financePosition = (position: FinancePosition | null | undefined): CockpitValue<CockpitMoney> =>
    position
      ? available({ amount: position.amount, currency: position.currency }, position.asOf, financeStale)
      : unavailableMoney;

  return {
    generatedAt: business.generatedAt,
    systemStatus: business.freshness.status,
    latestSourceAt: business.freshness.latestSourceAt,
    brainConfidence: unavailable(),
    businessPulse,
    domains,
    todaysFocus,
    executiveBriefing,
    trading: {
      revenue: trading ? tradingMoney(trading.netRevenue) : unavailableMoney,
      calendarRevenue: createCalendarRevenueValues(calendarRevenue, tradingAt, tradingStale, tradingCurrency),
      recentOrders: recentOrders ? available(recentOrders.map((order) => ({ ...order, destination: `/orders/${encodeURIComponent(order.id)}` })), tradingAt, tradingStale) : unavailable(),
      orders: trading ? available(trading.orderCount, tradingAt, tradingStale) : unavailable(),
      units: trading ? available(trading.itemsSold, tradingAt, tradingStale) : unavailable(),
      averageOrderValue: trading ? tradingMoney(trading.averageOrderValue) : unavailableMoney,
      revenueComparison: trading?.comparisonRevenuePercentage !== null && trading?.comparisonRevenuePercentage !== undefined
        ? available(trading.comparisonRevenuePercentage, tradingAt, tradingStale)
        : unavailable(),
      orderComparison: trading?.comparisonOrderCountPercentage !== null && trading?.comparisonOrderCountPercentage !== undefined
        ? available(trading.comparisonOrderCountPercentage, tradingAt, tradingStale)
        : unavailable(),
      revenueTrend,
      orderTrend,
    },
    website: {
      ...websiteTraffic,
      sessions: funnelResult?.trackedSessions !== null && funnelResult?.trackedSessions !== undefined
        ? available(funnelResult.trackedSessions, funnelResult.latestActivityAt, funnelResult.stale)
        : unavailable(),
      conversionRate: funnelResult?.conversionRate !== null && funnelResult?.conversionRate !== undefined
        ? available(funnelResult.conversionRate, funnelResult.latestActivityAt, funnelResult.stale)
        : unavailable(),
      addToCartToday: funnelResult?.addToCartSessions !== null && funnelResult?.addToCartSessions !== undefined
        ? available(funnelResult.addToCartSessions, funnelResult.latestActivityAt, funnelResult.stale)
        : unavailable(),
      checkoutStartedToday: funnelResult?.checkoutStartedSessions !== null && funnelResult?.checkoutStartedSessions !== undefined
        ? available(funnelResult.checkoutStartedSessions, funnelResult.latestActivityAt, funnelResult.stale)
        : unavailable(),
      checkoutCompletedToday: funnelResult?.checkoutCompletedSessions !== null && funnelResult?.checkoutCompletedSessions !== undefined
        ? available(funnelResult.checkoutCompletedSessions, funnelResult.latestActivityAt, funnelResult.stale)
        : unavailable(),
      addToCartRate: funnelResult?.addToCartRate !== null && funnelResult?.addToCartRate !== undefined
        ? available(funnelResult.addToCartRate, funnelResult.latestActivityAt, funnelResult.stale)
        : unavailable(),
      checkoutRate: funnelResult?.checkoutRate !== null && funnelResult?.checkoutRate !== undefined
        ? available(funnelResult.checkoutRate, funnelResult.latestActivityAt, funnelResult.stale)
        : unavailable(),
      abandonedCheckouts: funnelResult?.abandonedCheckouts !== null && funnelResult?.abandonedCheckouts !== undefined
        ? available(funnelResult.abandonedCheckouts, funnelResult.latestActivityAt, funnelResult.stale)
        : unavailable(),
      visitorTrend,
      shopifyAnalytics: {
        availability: shopifyAnalytics?.availability ?? "unavailable",
        reportingTimezone: shopifyAnalytics?.reportingTimezone ?? null,
        sessions: shopifyValue(shopifyToday?.sessions),
        visitors: shopifyValue(shopifyToday?.visitors),
        cartAdditions: shopifyValue(shopifyToday?.cartAdditions),
        reachedCheckout: shopifyValue(shopifyToday?.reachedCheckout),
        completedCheckout: shopifyValue(shopifyToday?.completedCheckout),
        conversionRate: shopifyValue(shopifyToday ? shopifyToday.conversionRate * 100 : null),
        sessionTrend: shopifyAnalytics?.sessionTrend ?? [],
      },
    },
    meta: {
      connection: metaAds?.availability ?? "unavailable",
      costPerPurchase: metaAds?.today?.costPerPurchase != null && metaAds.currency
        ? available(
            money(metaAds.today.costPerPurchase, metaAds.currency)!,
            metaAds.fetchedAt,
            metaAds.availability === "stale",
          )
        : unavailable(),
      cpm: metaAds?.today?.cpm != null && metaAds.currency
        ? available(
            money(metaAds.today.cpm, metaAds.currency)!,
            metaAds.fetchedAt,
            metaAds.availability === "stale",
          )
        : unavailable(),
      landingPageViewRate: metaAds?.today?.landingPageViewRate != null
        ? available(
            metaAds.today.landingPageViewRate,
            metaAds.fetchedAt,
            metaAds.availability === "stale",
          )
        : unavailable(),
      spend: metaAds?.today && metaAds.currency
        ? available(
            money(metaAds.today.spend, metaAds.currency)!,
            metaAds.fetchedAt,
            metaAds.availability === "stale",
          )
        : unavailable(),
      attributedRevenue: metaAds?.today && metaAds.currency
        ? available(
            money(metaAds.today.attributedRevenue, metaAds.currency)!,
            metaAds.fetchedAt,
            metaAds.availability === "stale",
          )
        : unavailable(),
      roas: metaAds?.today
        ? available(
            metaAds.today.roas,
            metaAds.fetchedAt,
            metaAds.availability === "stale",
          )
        : unavailable(),
      impressions: metaAds?.today
        ? available(
            metaAds.today.impressions,
            metaAds.fetchedAt,
            metaAds.availability === "stale",
          )
        : unavailable(),
      clickThroughRate: metaAds?.today
        ? available(
            metaAds.today.ctr,
            metaAds.fetchedAt,
            metaAds.availability === "stale",
          )
        : unavailable(),
      costPerClick: metaAds?.today && metaAds.currency
        ? available(
            money(metaAds.today.cpc, metaAds.currency)!,
            metaAds.fetchedAt,
            metaAds.availability === "stale",
          )
        : unavailable(),
      purchases: metaAds?.today
        ? available(
            metaAds.today.purchases,
            metaAds.fetchedAt,
            metaAds.availability === "stale",
          )
        : unavailable(),
    },
    finance: {
      recentLedger: recentLedger ? available(recentLedger, business.generatedAt) : unavailable(),
      todayPayout: createTodayPayoutValue(finance?.todayPayout ?? null, business.sourceStatuses.find((source) => source.source === "shopify-payments"), business.generatedAt),
      ledgerCash: financePosition(finance?.businessCash),
      purchasingPower: wallet
        ? available({ amount: wallet.available_purchasing_power_gbp, currency: "GBP" }, wallet.wallet_last_updated)
        : unavailableMoney,
      protectedReserve: wallet
        ? available({ amount: wallet.protected_reserve_gbp, currency: "GBP" }, wallet.wallet_last_updated)
        : financePosition(finance?.protectedReserve),
      committedPurchaseOrders: wallet
        ? available({ amount: wallet.committed_orders_gbp, currency: "GBP" }, wallet.wallet_last_updated)
        : unavailableMoney,
    },
    inventory: {
      lowStockStyles: inventory ? available(inventory.lowStockProducts, inventoryAt, inventoryStale) : unavailable(),
      outOfStockStyles: inventory ? available(inventory.outOfStockProducts, inventoryAt, inventoryStale) : unavailable(),
      stockValue: unavailable(),
      freshness: inventory
        ? available(
          inventory.sync.syncStatus,
          inventory.sync.lastInventorySync,
          inventory.sync.syncStatus === "delayed" || inventory.sync.syncStatus === "failed",
        )
        : unavailable(),
      reorderReview: inventory ? available(inventory.productsRequiringAttention, inventoryAt, inventoryStale) : unavailable(),
    },
    operations: {
      awaitingFulfilment: operationsResult
        ? available(operationsResult.awaitingFulfilment, operationsResult.updatedAt, tradingStale)
        : unavailable(),
      dispatchedToday: unavailable(),
      refundsToday: unavailable(),
      supplierIssues: unavailable(),
      lateDeliveries: unavailable(),
    },
    insights: limitInsights(insights),
    attention,
    feed: limitFeed(business.businessActivity.data ?? []),
  };
}
