import "server-only";

import type { PurchasingWalletData } from "@/components/commercial/PurchasingWallet";
import { getCommercialDecisionTimeline } from "@/lib/brain/getCommercialDecisionTimeline";
import { getVaultBusinessState } from "@/lib/business/VaultBusinessState";
import type { FinancePosition } from "@/lib/business/BusinessFinanceRepository";
import {
  buildExecutiveSummary,
  createWebsiteTrafficBreakdown,
  deriveBusinessPulse,
  limitFeed,
  limitInsights,
  notConnected,
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
  const [timeline, walletResult] = await Promise.all([
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
  const attention = selectAttentionItems(timeline);
  const todaysFocus = selectTodaysFocus(timeline);
  const supplierBlocker = timeline?.items.find((item) =>
    item.source === "supplier" && item.status === "blocked"
  );
  const advisorAction = timeline?.items.find((item) =>
    item.source === "advisor" && item.status === "actionable"
  );
  const advisorNoCandidate = timeline?.items.find((item) =>
    item.id === "advisor-no-trusted-candidate"
  );
  const domains: DomainPulse[] = [
    sourceDomain("Trading", business.trading.status),
    sourceDomain("Website", business.websiteAnalytics.status),
    {
      ...sourceDomain("Inventory", business.inventory.status),
      state: business.inventory.status === "stale"
        ? "attention"
        : business.inventory.status === "live" && (inventory?.productsRequiringAttention ?? 0) > 0
          ? "watch"
          : sourceDomain("Inventory", business.inventory.status).state,
      detail: business.inventory.status === "stale"
        ? "Source stale"
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
    { domain: "Marketing", state: "not_connected", detail: "Meta not connected" },
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
  const executiveSummary = buildExecutiveSummary({
    trading: domains[0],
    focus: todaysFocus,
    domains,
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
  const firstAttention = selectAttentionItems(timeline)[0];
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
    executiveSummary,
    trading: {
      revenue: trading ? tradingMoney(trading.netRevenue) : unavailableMoney,
      orders: trading ? available(trading.orderCount, tradingAt, tradingStale) : unavailable(),
      units: trading ? available(trading.itemsSold, tradingAt, tradingStale) : unavailable(),
      averageOrderValue: trading ? tradingMoney(trading.averageOrderValue) : unavailableMoney,
      revenueComparison: trading?.comparisonRevenuePercentage !== null && trading?.comparisonRevenuePercentage !== undefined
        ? available(trading.comparisonRevenuePercentage, tradingAt, tradingStale)
        : unavailable(),
      orderComparison: trading?.comparisonOrderCountPercentage !== null && trading?.comparisonOrderCountPercentage !== undefined
        ? available(trading.comparisonOrderCountPercentage, tradingAt, tradingStale)
        : unavailable(),
    },
    website: {
      ...websiteTraffic,
      sessions: unavailable(),
      conversionRate: unavailable(),
      addToCartRate: unavailable(),
      checkoutRate: unavailable(),
      abandonedCheckouts: unavailable(),
    },
    meta: {
      connection: "not_connected",
      spend: notConnected(),
      attributedRevenue: notConnected(),
      roas: notConnected(),
      impressions: notConnected(),
      clickThroughRate: notConnected(),
      costPerClick: notConnected(),
      purchases: notConnected(),
    },
    finance: {
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
      freshness: inventoryAt ? available(inventoryAt, inventoryAt, inventoryStale) : unavailable(),
      reorderReview: inventory ? available(inventory.productsRequiringAttention, inventoryAt, inventoryStale) : unavailable(),
    },
    operations: {
      awaitingFulfilment: unavailable(),
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
