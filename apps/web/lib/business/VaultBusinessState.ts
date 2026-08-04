import "server-only";

import {
  getLiveInventorySnapshot,
  type LiveInventorySnapshot,
} from "@/lib/brain/getLiveInventorySnapshot";
import {
  ShopifyTradingRepository,
  type ShopifyRecentOrder,
  type ShopifySevenDaySummary,
  type ShopifyTodaySummary,
  type ShopifyTopProduct,
} from "@/lib/business/ShopifyTradingRepository";
import {
  WebsiteAnalyticsRepository,
  type WebsiteAnalyticsSnapshot,
} from "@/lib/business/WebsiteAnalyticsRepository";
import {
  BusinessFinanceRepository,
  type FinancePosition,
} from "@/lib/business/BusinessFinanceRepository";
import {
  BusinessActivityRepository,
  type BusinessActivityEvent,
} from "@/lib/business/BusinessActivityRepository";
import {
  ShopifyPaymentsRepository,
  type ShopifyPaymentsPayout,
} from "@/lib/business/ShopifyPaymentsRepository";

export type VaultBusinessSource =
  | "inventory"
  | "shopify-trading"
  | "website-analytics"
  | "business-finance"
  | "shopify-payments"
  | "business-activity"
  | "shipments"
  | "trustpilot";

export type VaultBusinessSourceState =
  | "live"
  | "stale"
  | "unavailable"
  | "error";

export type VaultBusinessSourceStatus = {
  source: VaultBusinessSource;
  label: string;
  status: VaultBusinessSourceState;
  lastUpdatedAt: string | null;
  message: string;
};

export type VaultBusinessFreshness = {
  status:
    | "live"
    | "stale"
    | "partial"
    | "unavailable"
    | "error";
  checkedAt: string;
  latestSourceAt: string | null;
};

export type VaultTradingData = {
  periodStartedAt: string;
  periodEndedAt: string;
  orderCount: number;
  grossRevenue: number;
  refunds: number;
  netRevenue: number;
  profit: null;
  currency: string | null;
  itemsSold: number;
  averageOrderValue: number | null;
  comparisonOrderCountPercentage: number | null;
  comparisonRevenuePercentage: number | null;
  comparisonProfitPercentage: number | null;
  sevenDaySummary: {
    periodStartedAt: string;
    periodEndedAt: string;
    currency: string | null;
    days: Array<{
      date: string;
      orderCount: number;
      grossRevenue: number;
      refunds: number;
      netRevenue: number;
    }>;
  };
};

export type VaultRecentOrder = {
  id: string;
  orderName: string;
  customerName: string | null;
  amount: number;
  currency: string;
  financialStatus: string | null;
  fulfilmentStatus: string | null;
  createdAt: string;
};

export type VaultTopProduct = {
  productId: string;
  title: string;
  quantitySold: number;
  netRevenue: number;
  currency: string | null;
};

export type VaultFinanceData = {
  businessCash: FinancePosition | null;
  protectedReserve: FinancePosition | null;
  shopifyPaymentsBalance: FinancePosition | null;
  todayPayout: ShopifyPaymentsPayout | null;
  nextScheduledPayout: ShopifyPaymentsPayout | null;
  latestSuccessfulPayout: ShopifyPaymentsPayout | null;
};

export type VaultShipment = {
  id: string;
  carrier: string | null;
  trackingNumber: string | null;
  status: string;
  estimatedDeliveryAt: string | null;
};

export type VaultTrustpilotData = {
  rating: number;
  reviewCount: number;
  trustScoreLabel: string | null;
  latestReviewAt: string | null;
};

export type VaultAvailableData<T> = {
  status: "live" | "stale";
  data: T;
  lastUpdatedAt: string;
  message: string | null;
};

export type VaultUnavailableData = {
  status: "unavailable";
  data: null;
  lastUpdatedAt: null;
  message: string;
};

export type VaultErrorData = {
  status: "error";
  data: null;
  lastUpdatedAt: null;
  message: string;
};

export type VaultBusinessDataState<T> =
  | VaultAvailableData<T>
  | VaultUnavailableData
  | VaultErrorData;

export type VaultBusinessState = {
  generatedAt: string;
  freshness: VaultBusinessFreshness;
  sourceStatuses: VaultBusinessSourceStatus[];
  trading: VaultBusinessDataState<VaultTradingData>;
  inventory: VaultBusinessDataState<LiveInventorySnapshot>;
  recentOrders: VaultBusinessDataState<VaultRecentOrder[]>;
  topProducts: VaultBusinessDataState<VaultTopProduct[]>;
  websiteAnalytics: VaultBusinessDataState<WebsiteAnalyticsSnapshot>;
  finance: VaultBusinessDataState<VaultFinanceData>;
  businessActivity: VaultBusinessDataState<BusinessActivityEvent[]>;
  shipments: VaultBusinessDataState<VaultShipment[]>;
  trustpilot: VaultBusinessDataState<VaultTrustpilotData>;
};

const INVENTORY_STALE_AFTER_MS = 30 * 60 * 1000;
const SHOPIFY_TRADING_STALE_AFTER_MS = 30 * 60 * 1000;
const WEBSITE_ANALYTICS_STALE_AFTER_MS = 30 * 60 * 1000;
const BUSINESS_FINANCE_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const RECENT_ORDER_LIMIT = 10;
const TOP_PRODUCT_LIMIT = 10;

function unavailable<T>(message: string): VaultBusinessDataState<T> {
  return {
    status: "unavailable",
    data: null,
    lastUpdatedAt: null,
    message,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "An unexpected data-source error occurred.";
}

function getShopifyTradingStatus(
  lastUpdatedAt: string,
  checkedAt: string,
): "live" | "stale" {
  const lastUpdatedTime = new Date(lastUpdatedAt).getTime();
  const checkedTime = new Date(checkedAt).getTime();

  return !Number.isFinite(lastUpdatedTime) ||
      checkedTime - lastUpdatedTime > SHOPIFY_TRADING_STALE_AFTER_MS
    ? "stale"
    : "live";
}

function availableShopifyData<T>(
  data: T,
  lastUpdatedAt: string,
  checkedAt: string,
): VaultAvailableData<T> {
  const status = getShopifyTradingStatus(lastUpdatedAt, checkedAt);

  return {
    status,
    data,
    lastUpdatedAt,
    message: status === "stale"
      ? "Shopify trading data is older than the 30-minute freshness threshold."
      : null,
  };
}

function getWebsiteAnalyticsState(
  analytics: WebsiteAnalyticsSnapshot,
  checkedAt: string,
): VaultAvailableData<WebsiteAnalyticsSnapshot> {
  const latestTime = new Date(analytics.latestAnalyticsAt).getTime();
  const checkedTime = new Date(checkedAt).getTime();
  const isStale = !Number.isFinite(latestTime) ||
    checkedTime - latestTime > WEBSITE_ANALYTICS_STALE_AFTER_MS;

  return {
    status: isStale ? "stale" : "live",
    data: analytics,
    lastUpdatedAt: analytics.latestAnalyticsAt,
    message: isStale
      ? "Website visitor intelligence is older than the 30-minute freshness threshold."
      : null,
  };
}

function shopifyError<T>(
  label: string,
  error: unknown,
): VaultBusinessDataState<T> {
  return {
    status: "error",
    data: null,
    lastUpdatedAt: null,
    message: `${label} could not be loaded: ${getErrorMessage(error)}`,
  };
}

function mapTradingData(
  today: ShopifyTodaySummary,
  sevenDay: ShopifySevenDaySummary,
): VaultTradingData {
  return {
    periodStartedAt: today.range.from,
    periodEndedAt: today.range.to,
    orderCount: today.orderCount,
    grossRevenue: today.grossRevenue,
    refunds: today.refunds,
    netRevenue: today.netRevenue,
    profit: null,
    currency: today.currency ?? sevenDay.currency,
    itemsSold: today.itemsSold,
    averageOrderValue: today.averageOrderValue,
    comparisonOrderCountPercentage: null,
    comparisonRevenuePercentage: null,
    comparisonProfitPercentage: null,
    sevenDaySummary: {
      periodStartedAt: sevenDay.range.from,
      periodEndedAt: sevenDay.range.to,
      currency: sevenDay.currency,
      days: sevenDay.days.map((day) => ({
        date: day.date,
        orderCount: day.orderCount,
        grossRevenue: day.grossRevenue,
        refunds: day.refunds,
        netRevenue: day.netRevenue,
      })),
    },
  };
}

function mapRecentOrder(order: ShopifyRecentOrder): VaultRecentOrder {
  return {
    id: order.id,
    orderName: order.orderName,
    customerName: order.customerName,
    amount: order.netRevenue,
    currency: order.currency,
    financialStatus: order.financialStatus,
    fulfilmentStatus: order.fulfilmentStatus,
    createdAt: order.createdAt,
  };
}

function mapTopProduct(
  product: ShopifyTopProduct,
  currency: string | null,
): VaultTopProduct {
  return {
    productId: product.productId,
    title: product.title,
    quantitySold: product.unitsSold,
    netRevenue: product.netRevenue,
    currency,
  };
}

function getInventoryState(
  inventory: LiveInventorySnapshot,
  checkedAt: string,
): VaultAvailableData<LiveInventorySnapshot> {
  const lastUpdatedAt =
    inventory.latestSyncAt ?? inventory.generatedAt;

  const lastUpdatedTime = new Date(lastUpdatedAt).getTime();
  const checkedTime = new Date(checkedAt).getTime();
  const isStale =
    !inventory.latestSyncAt ||
    !Number.isFinite(lastUpdatedTime) ||
    checkedTime - lastUpdatedTime > INVENTORY_STALE_AFTER_MS;

  return {
    status: isStale ? "stale" : "live",
    data: inventory,
    lastUpdatedAt,
    message: isStale
      ? inventory.latestSyncAt
        ? "Inventory data is older than the 30-minute freshness threshold."
        : "Inventory is available, but no completed inventory sync timestamp was reported."
      : null,
  };
}

function createSourceStatus(
  source: VaultBusinessSource,
  label: string,
  state: VaultBusinessDataState<unknown>,
): VaultBusinessSourceStatus {
  return {
    source,
    label,
    status: state.status,
    lastUpdatedAt: state.lastUpdatedAt,
    message:
      state.message ?? `${label} is live.`,
  };
}

function createShopifyTradingSourceStatus(
  states: Array<VaultBusinessDataState<unknown>>,
): VaultBusinessSourceStatus {
  const statuses = new Set(states.map((state) => state.status));
  const lastUpdatedAt = states
    .map((state) => state.lastUpdatedAt)
    .filter((value): value is string => value !== null)
    .sort(
      (left, right) =>
        new Date(right).getTime() - new Date(left).getTime(),
    )[0] ?? null;

  let status: VaultBusinessSourceState;

  if (statuses.has("error")) {
    status = "error";
  } else if (statuses.has("stale")) {
    status = "stale";
  } else if (statuses.has("live")) {
    status = "live";
  } else {
    status = "unavailable";
  }

  const failedDomains = states.filter((state) => state.status === "error").length;

  return {
    source: "shopify-trading",
    label: "Shopify trading",
    status,
    lastUpdatedAt,
    message: status === "live"
      ? "Canonical Shopify trading data is live."
      : status === "stale"
        ? "Canonical Shopify trading data is available but stale."
        : status === "error"
          ? `${failedDomains} Shopify trading domain${failedDomains === 1 ? "" : "s"} failed to load.`
          : "Canonical Shopify trading data is unavailable because no completed order sync was found.",
  };
}

function getFreshness(
  checkedAt: string,
  statuses: VaultBusinessSourceStatus[],
): VaultBusinessFreshness {
  const latestSourceAt = statuses
    .map((status) => status.lastUpdatedAt)
    .filter((value): value is string => value !== null)
    .sort(
      (left, right) =>
        new Date(right).getTime() - new Date(left).getTime(),
    )[0] ?? null;

  const states = new Set(statuses.map((status) => status.status));
  let status: VaultBusinessFreshness["status"];

  if (states.has("live") && states.size > 1) {
    status = "partial";
  } else if (states.has("stale") && states.size > 1) {
    status = "partial";
  } else if (states.has("error")) {
    status = "error";
  } else if (states.has("stale")) {
    status = "stale";
  } else if (states.has("live")) {
    status = "live";
  } else {
    status = "unavailable";
  }

  return {
    status,
    checkedAt,
    latestSourceAt,
  };
}

export async function getVaultBusinessState({
  refreshExternalSources = true,
}: {
  refreshExternalSources?: boolean;
} = {}): Promise<VaultBusinessState> {
  const generatedAt = new Date().toISOString();

  let inventory: VaultBusinessDataState<LiveInventorySnapshot>;

  try {
    inventory = getInventoryState(
      await getLiveInventorySnapshot(),
      generatedAt,
    );
  } catch (error) {
    inventory = {
      status: "error",
      data: null,
      lastUpdatedAt: null,
      message: `Live inventory could not be loaded: ${getErrorMessage(error)}`,
    };
  }

  let trading = unavailable<VaultTradingData>(
    "The Shopify trading adapter is not connected.",
  );
  let recentOrders = unavailable<VaultRecentOrder[]>(
    "Recent orders are unavailable until the Shopify trading adapter is connected.",
  );
  let topProducts = unavailable<VaultTopProduct[]>(
    "Product sales performance is unavailable until the Shopify trading adapter is connected.",
  );

  try {
    const latestSyncAt = await ShopifyTradingRepository.getLatestSyncAt();

    if (latestSyncAt) {
      const [todayResult, sevenDayResult, recentOrdersResult] =
        await Promise.allSettled([
          ShopifyTradingRepository.getTodaySummary(),
          ShopifyTradingRepository.getSevenDaySummary(),
          ShopifyTradingRepository.getRecentOrders(RECENT_ORDER_LIMIT),
        ]);

      if (
        todayResult.status === "fulfilled" &&
        sevenDayResult.status === "fulfilled"
      ) {
        trading = availableShopifyData(
          mapTradingData(todayResult.value, sevenDayResult.value),
          latestSyncAt,
          generatedAt,
        );
      } else {
        const error = todayResult.status === "rejected"
          ? todayResult.reason
          : sevenDayResult.status === "rejected"
            ? sevenDayResult.reason
            : new Error("Shopify trading summaries were unavailable");

        trading = shopifyError("Shopify trading summary", error);
      }

      if (recentOrdersResult.status === "fulfilled") {
        recentOrders = availableShopifyData(
          recentOrdersResult.value.map(mapRecentOrder),
          latestSyncAt,
          generatedAt,
        );
      } else {
        recentOrders = shopifyError(
          "Recent Shopify orders",
          recentOrdersResult.reason,
        );
      }

      if (sevenDayResult.status === "fulfilled") {
        try {
          const products = await ShopifyTradingRepository.getTopProducts(
            sevenDayResult.value.range,
            TOP_PRODUCT_LIMIT,
          );

          topProducts = availableShopifyData(
            products.map((product) =>
              mapTopProduct(product, sevenDayResult.value.currency)
            ),
            latestSyncAt,
            generatedAt,
          );
        } catch (error) {
          topProducts = shopifyError("Top Shopify products", error);
        }
      } else {
        topProducts = shopifyError(
          "Top Shopify products",
          sevenDayResult.reason,
        );
      }
    } else {
      trading = unavailable(
        "Shopify trading is unavailable because no completed order sync was found.",
      );
      recentOrders = unavailable(
        "Recent Shopify orders are unavailable because no completed order sync was found.",
      );
      topProducts = unavailable(
        "Top Shopify products are unavailable because no completed order sync was found.",
      );
    }
  } catch (error) {
    trading = shopifyError("Shopify trading", error);
    recentOrders = shopifyError("Recent Shopify orders", error);
    topProducts = shopifyError("Top Shopify products", error);
  }

  let websiteAnalytics = unavailable<WebsiteAnalyticsSnapshot>(
    "Website visitor intelligence is unavailable because no canonical traffic has been recorded.",
  );

  try {
    const analytics = await WebsiteAnalyticsRepository.getSnapshot();

    if (analytics) {
      websiteAnalytics = getWebsiteAnalyticsState(analytics, generatedAt);
    }
  } catch (error) {
    websiteAnalytics = {
      status: "error",
      data: null,
      lastUpdatedAt: null,
      message: `Website visitor intelligence could not be loaded: ${getErrorMessage(error)}`,
    };
  }

  let businessFinanceStatus: VaultBusinessSourceStatus = {
    source: "business-finance",
    label: "Business finance",
    status: "unavailable",
    lastUpdatedAt: null,
    message: "No canonical business finance position is available.",
  };
  let shopifyPaymentsStatus: VaultBusinessSourceStatus = {
    source: "shopify-payments",
    label: "Shopify Payments",
    status: "unavailable",
    lastUpdatedAt: null,
    message: "Shopify Payments has not synchronized.",
  };
  let businessCash: FinancePosition | null = null;
  let protectedReserve: FinancePosition | null = null;
  let shopifyPaymentsBalance: FinancePosition | null = null;
  let todayPayout: ShopifyPaymentsPayout | null = null;
  let nextScheduledPayout: ShopifyPaymentsPayout | null = null;
  let latestSuccessfulPayout: ShopifyPaymentsPayout | null = null;

  try {
    const positions = await BusinessFinanceRepository.getSnapshot();
    businessCash = positions.businessCash;
    protectedReserve = positions.protectedReserve;
    const lastUpdatedAt = [businessCash?.asOf, protectedReserve?.asOf]
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
    const stale = lastUpdatedAt === null ||
      Date.parse(generatedAt) - Date.parse(lastUpdatedAt) >
        BUSINESS_FINANCE_STALE_AFTER_MS;

    businessFinanceStatus = {
      source: "business-finance",
      label: "Business finance",
      status: businessCash || protectedReserve
        ? stale ? "stale" : "live"
        : "unavailable",
      lastUpdatedAt,
      message: businessCash || protectedReserve
        ? stale
          ? "Business finance is older than the 24-hour freshness threshold."
          : "Canonical business finance is live."
        : "No canonical business finance position is available.",
    };
  } catch (error) {
    businessFinanceStatus = {
      source: "business-finance",
      label: "Business finance",
      status: "error",
      lastUpdatedAt: null,
      message: `Business finance could not be loaded: ${getErrorMessage(error)}`,
    };
  }

  try {
    const payments = await ShopifyPaymentsRepository.getSnapshot({
      refreshFromShopify: refreshExternalSources,
    });
    const defaultBalance = payments.balances.find(
      (balance) => balance.currency === payments.defaultCurrency,
    ) ?? (payments.balances.length === 1 ? payments.balances[0] : null);

    shopifyPaymentsBalance = defaultBalance
      ? { ...defaultBalance, asOf: payments.synchronizedAt }
      : null;
    todayPayout = payments.todayPayout;
    nextScheduledPayout = payments.nextScheduledPayout;
    latestSuccessfulPayout = payments.latestSuccessfulPayout;
    shopifyPaymentsStatus = {
      source: "shopify-payments",
      label: "Shopify Payments",
      status: payments.sourceState,
      lastUpdatedAt: payments.synchronizedAt,
      message: payments.message ?? "Shopify Payments is live.",
    };
  } catch (error) {
    shopifyPaymentsStatus = {
      source: "shopify-payments",
      label: "Shopify Payments",
      status: "error",
      lastUpdatedAt: null,
      message: `Shopify Payments could not be loaded: ${getErrorMessage(error)}`,
    };
  }

  const financeData: VaultFinanceData = {
    businessCash,
    protectedReserve,
    shopifyPaymentsBalance,
    todayPayout,
    nextScheduledPayout,
    latestSuccessfulPayout,
  };
  const financeSourceStates = [
    businessFinanceStatus.status,
    shopifyPaymentsStatus.status,
  ];
  const financeLastUpdatedAt = [
    businessFinanceStatus.lastUpdatedAt,
    shopifyPaymentsStatus.lastUpdatedAt,
  ].filter((value): value is string => value !== null)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
  const hasFinanceData = Object.values(financeData).some((value) => value !== null);
  const finance: VaultBusinessDataState<VaultFinanceData> = hasFinanceData
    ? {
      status: financeSourceStates.includes("stale") ||
          financeSourceStates.includes("error") ||
          financeSourceStates.includes("unavailable")
        ? "stale"
        : "live",
      data: financeData,
      lastUpdatedAt: financeLastUpdatedAt ?? generatedAt,
      message: financeSourceStates.every((status) => status === "live")
        ? null
        : "Finance is partially available; review the source statuses.",
    }
    : financeSourceStates.includes("error")
      ? {
        status: "error",
        data: null,
        lastUpdatedAt: null,
        message: "Business finance and Shopify Payments are unavailable.",
      }
      : unavailable("No canonical finance position is available.");
  const shipments = unavailable<VaultShipment[]>(
    "The shipments adapter is not connected.",
  );
  const trustpilot = unavailable<VaultTrustpilotData>(
    "The Trustpilot adapter is not connected.",
  );
  let businessActivity = unavailable<BusinessActivityEvent[]>(
    "No canonical business activity is available.",
  );

  try {
    const activity = await BusinessActivityRepository
      .getRecentBusinessActivity();

    if (
      (activity.status === "live" || activity.status === "stale") &&
      activity.timestamp
    ) {
      businessActivity = {
        status: activity.status,
        data: activity.data,
        lastUpdatedAt: activity.timestamp,
        message: activity.message,
      };
    } else if (activity.status === "error") {
      businessActivity = {
        status: "error",
        data: null,
        lastUpdatedAt: null,
        message: activity.message ?? "Business activity could not be loaded.",
      };
    }
  } catch (error) {
    businessActivity = {
      status: "error",
      data: null,
      lastUpdatedAt: null,
      message: `Business activity could not be loaded: ${getErrorMessage(error)}`,
    };
  }

  const sourceStatuses: VaultBusinessSourceStatus[] = [
    createSourceStatus("inventory", "Inventory", inventory),
    createShopifyTradingSourceStatus([trading, recentOrders, topProducts]),
    createSourceStatus(
      "website-analytics",
      "Website intelligence",
      websiteAnalytics,
    ),
    businessFinanceStatus,
    shopifyPaymentsStatus,
    createSourceStatus(
      "business-activity",
      "Business activity",
      businessActivity,
    ),
    createSourceStatus("shipments", "Shipments", shipments),
    createSourceStatus("trustpilot", "Trustpilot", trustpilot),
  ];

  return {
    generatedAt,
    freshness: getFreshness(generatedAt, sourceStatuses),
    sourceStatuses,
    trading,
    inventory,
    recentOrders,
    topProducts,
    websiteAnalytics,
    finance,
    businessActivity,
    shipments,
    trustpilot,
  };
}
