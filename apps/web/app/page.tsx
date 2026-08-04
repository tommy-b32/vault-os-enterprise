import VaultAppShell from "@/components/layout/VaultAppShell";

import {
  CommandCentreBrainPriority,
} from "@/components/brain/CommandCentreBrainPriority";
import {
  CommandCentreLiveMetric,
  CommandCentreLiveTrading,
  CommandCentreRecentOrderRow,
} from "@/components/command-centre/CommandCentreLiveTrading";

import {
  getVaultBusinessState,
  type VaultBusinessSourceState,
} from "@/lib/business/VaultBusinessState";

export const dynamic = "force-dynamic";

type IconName =
  | "home"
  | "inventory"
  | "catalogue"
  | "partners"
  | "orders"
  | "analytics"
  | "advisor"
  | "settings"
  | "search"
  | "bell"
  | "pound"
  | "cart"
  | "coins"
  | "chart"
  | "warning"
  | "truck"
  | "star"
  | "arrow"
  | "whatsapp";

type IconProps = {
  name: IconName;
  size?: number;
  strokeWidth?: number;
};

function Icon({
  name,
  size = 20,
  strokeWidth = 1.8,
}: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const paths: Record<IconName, React.ReactNode> = {
    home: (
      <>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5 10.5V20h14v-9.5" />
        <path d="M9.5 20v-6h5v6" />
      </>
    ),
    inventory: (
      <>
        <path d="M4 7h16v13H4z" />
        <path d="M7 4h10l2 3H5z" />
        <path d="M9 11h6" />
      </>
    ),
    catalogue: (
      <>
        <path d="M8 4 4 7v13h16V7l-4-3" />
        <path d="M8 4c0 2 1.8 3 4 3s4-1 4-3" />
        <path d="M8 12h8" />
      </>
    ),
    partners: (
      <>
        <circle cx="8" cy="8" r="3" />
        <circle cx="16" cy="8" r="3" />
        <path d="M3 20c.5-4 2.2-6 5-6s4.5 2 5 6" />
        <path d="M11 20c.5-4 2.2-6 5-6s4.5 2 5 6" />
      </>
    ),
    orders: (
      <>
        <path d="M6 5h12l1 15H5z" />
        <path d="M9 8V5a3 3 0 0 1 6 0v3" />
        <path d="M9 12h6" />
      </>
    ),
    analytics: (
      <>
        <path d="M4 20V10" />
        <path d="M9 20V5" />
        <path d="M14 20v-8" />
        <path d="M19 20V3" />
      </>
    ),
    advisor: (
      <>
        <path d="M9 3h6l1 3 3 1v5l-3 1-1 3H9l-1-3-3-1V7l3-1z" />
        <circle cx="12" cy="9.5" r="2.5" />
        <path d="M8.5 20c.7-3 2-4.5 3.5-4.5s2.8 1.5 3.5 4.5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1a7 7 0 0 0-1.8-1L14.2 3h-4.4l-.4 3a7 7 0 0 0-1.8 1l-2.5-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.5-1a7 7 0 0 0 1.8 1l.4 3h4.4l.4-3a7 7 0 0 0 1.8-1l2.5 1 2-3.4-2-1.6a7 7 0 0 0 .1-1Z" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    pound: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M14.5 7.5a3 3 0 0 0-5 2v6" />
        <path d="M8 12h5" />
        <path d="M8 17h8" />
      </>
    ),
    cart: (
      <>
        <path d="M3 4h2l2 11h10l2-7H6" />
        <circle cx="9" cy="19" r="1" />
        <circle cx="17" cy="19" r="1" />
      </>
    ),
    coins: (
      <>
        <ellipse cx="12" cy="6" rx="7" ry="3" />
        <path d="M5 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
        <path d="M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
      </>
    ),
    chart: (
      <>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="m7 15 4-4 3 2 5-7" />
      </>
    ),
    warning: (
      <>
        <path d="M12 3 2.5 20h19z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </>
    ),
    truck: (
      <>
        <path d="M3 6h11v10H3z" />
        <path d="M14 10h4l3 3v3h-7z" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
      </>
    ),
    star: (
      <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6-4.4-4.3 6.1-.9z" />
    ),
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m14 7 5 5-5 5" />
      </>
    ),
    whatsapp: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m7 20 1-3" />
        <path d="M9 8c1 4 3 6 7 7" />
      </>
    ),
  };

  return <svg {...common}>{paths[name]}</svg>;
}

function formatCurrency(
  value: number,
  currency: string | null,
): string {
  if (!currency) {
    return new Intl.NumberFormat("en-GB", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(value);
}

function formatRelativeTime(
  value: string,
  generatedAt: string,
): string {
  const elapsedMilliseconds =
    new Date(generatedAt).getTime() - new Date(value).getTime();

  if (!Number.isFinite(elapsedMilliseconds)) {
    return "time unavailable";
  }

  const elapsedMinutes = Math.max(
    0,
    Math.round(elapsedMilliseconds / 60_000),
  );

  if (elapsedMinutes < 1) {
    return "just now";
  }

  if (elapsedMinutes === 1) {
    return "1 min ago";
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} mins ago`;
  }

  const elapsedHours = Math.round(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return elapsedHours === 1 ? "1 hour ago" : `${elapsedHours} hours ago`;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatSourceFreshness(
  label: string,
  status: VaultBusinessSourceState,
  lastUpdatedAt: string | null,
  generatedAt: string,
): string {
  if (status === "unavailable") {
    return `${label} unavailable`;
  }

  if (status === "error") {
    return `${label} error`;
  }

  const statusLabel = status === "stale" ? "stale" : "live";

  return lastUpdatedAt
    ? `${label} ${statusLabel} · synced ${formatRelativeTime(lastUpdatedAt, generatedAt)}`
    : `${label} ${statusLabel}`;
}

function getSourceStatusColour(status: VaultBusinessSourceState): string {
  if (status === "live") {
    return "var(--vault-success)";
  }

  if (status === "stale") {
    return "var(--vault-warning)";
  }

  return "var(--vault-error)";
}

function formatChartDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function getSalesChartPaths(
  days: Array<{ netRevenue: number }>,
): { line: string; area: string } | null {
  if (days.length === 0) {
    return null;
  }

  const left = 5;
  const right = 595;
  const top = 10;
  const bottom = 180;
  const maximum = Math.max(0, ...days.map((day) => day.netRevenue));
  const points = days.map((day, index) => {
    const x = days.length === 1
      ? (left + right) / 2
      : left + (index * (right - left)) / (days.length - 1);
    const value = Math.max(0, day.netRevenue);
    const y = maximum > 0
      ? bottom - (value / maximum) * (bottom - top)
      : bottom;

    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point}`)
    .join(" ");

  return {
    line,
    area: `${line} L${right} 210 L${left} 210 Z`,
  };
}

function formatOrderStatus(
  status: string | null,
  fallback: string,
): string {
  return (status?.trim() || fallback)
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function getFinancialStatusClass(status: string): string {
  if (status === "PAID") return "order-status-success";
  if (
    status === "AUTHORIZED" ||
    status === "PENDING" ||
    status === "PARTIALLY_REFUNDED"
  ) {
    return "order-status-warning";
  }
  if (status === "REFUNDED" || status === "VOIDED") {
    return "order-status-error";
  }

  return "order-status-neutral";
}

function getFulfilmentStatusClass(status: string): string {
  if (status === "FULFILLED") return "order-status-success";
  if (
    status === "UNFULFILLED" ||
    status === "PARTIALLY_FULFILLED" ||
    status === "ON_HOLD"
  ) {
    return "order-status-warning";
  }
  if (status === "SCHEDULED") return "order-status-info";
  if (status === "CANCELLED") return "order-status-error";

  return "order-status-neutral";
}

function getPayoutStatusClass(status: string): string {
  if (status === "PAID") return "cash-payout-success";
  if (status === "SCHEDULED") return "cash-payout-warning";
  if (status === "FAILED" || status === "CANCELED") {
    return "cash-payout-error";
  }

  return "cash-payout-neutral";
}

function formatInventoryFreshness(
  status: VaultBusinessSourceState,
  lastUpdatedAt: string | null,
  generatedAt: string,
): string {
  if (status === "unavailable") {
    return "Inventory unavailable";
  }

  if (status === "error") {
    return "Inventory error";
  }

  if (!lastUpdatedAt) {
    return status === "stale"
      ? "Inventory stale"
      : "Inventory live";
  }

  const elapsedMilliseconds =
    new Date(generatedAt).getTime() -
    new Date(lastUpdatedAt).getTime();

  if (!Number.isFinite(elapsedMilliseconds)) {
    return status === "stale"
      ? "Inventory stale"
      : "Inventory live";
  }

  const elapsedMinutes = Math.max(
    0,
    Math.round(elapsedMilliseconds / 60_000),
  );
  const freshness =
    elapsedMinutes < 1
      ? "just now"
      : elapsedMinutes === 1
        ? "1 min ago"
        : elapsedMinutes < 60
          ? `${elapsedMinutes} mins ago`
          : new Intl.DateTimeFormat("en-GB", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(lastUpdatedAt));

  return status === "stale"
    ? `Inventory stale · synced ${freshness}`
    : `Inventory live · synced ${freshness}`;
}

function getInventoryPercentage(
  count: number,
  total: number,
): number | null {
  if (total <= 0) {
    return null;
  }

  return Math.round((count / total) * 100);
}

export default async function Home() {
  const businessState =
    await getVaultBusinessState({
      refreshExternalSources: false,
    });
  const tradingState = businessState.trading;
  const trading = tradingState.data;
  const recentOrdersState = businessState.recentOrders;
  const recentOrders = recentOrdersState.data;
  const topProductsState = businessState.topProducts;
  const topProducts = topProductsState.data;
  const shopifyStatus =
    businessState.sourceStatuses.find(
      (source) => source.source === "shopify-trading",
    );
  const shopifyState = shopifyStatus?.status ?? tradingState.status;
  const shopifyStatusText = formatSourceFreshness(
    "Shopify trading",
    shopifyState,
    shopifyStatus?.lastUpdatedAt ?? tradingState.lastUpdatedAt,
    businessState.generatedAt,
  );
  const shopifyStatusColour = getSourceStatusColour(shopifyState);
  const tradingFreshness = formatSourceFreshness(
    "Trading",
    tradingState.status,
    tradingState.lastUpdatedAt,
    businessState.generatedAt,
  );
  const sevenDayDays = trading?.sevenDaySummary.days ?? [];
  const salesChartPaths = getSalesChartPaths(sevenDayDays);
  const websiteAnalyticsState = businessState.websiteAnalytics;
  const websiteAnalytics = websiteAnalyticsState.data;
  const websiteAnalyticsStatus = businessState.sourceStatuses.find(
    (source) => source.source === "website-analytics",
  );
  const websiteAnalyticsSourceState =
    websiteAnalyticsStatus?.status ?? websiteAnalyticsState.status;
  const websiteAnalyticsFreshness = formatSourceFreshness(
    "Website intelligence",
    websiteAnalyticsSourceState,
    websiteAnalyticsStatus?.lastUpdatedAt ??
      websiteAnalyticsState.lastUpdatedAt,
    businessState.generatedAt,
  );
  const websiteAnalyticsStatusColour =
    websiteAnalyticsSourceState === "unavailable"
      ? "var(--vault-muted)"
      : getSourceStatusColour(websiteAnalyticsSourceState);
  const websiteAnalyticsUnavailableText =
    websiteAnalyticsState.status === "error"
      ? "Website intelligence could not be loaded"
      : "Website intelligence is unavailable";
  const visitorMetrics = websiteAnalytics?.visitors ?? null;
  const financeState = businessState.finance;
  const finance = financeState.data;
  const metrics = [
    {
      label: "Cash Position",
      value: finance?.businessCash
        ? formatCurrency(
          finance.businessCash.amount,
          finance.businessCash.currency,
        )
        : "Unavailable",
      supportingText: finance?.businessCash
        ? "Available business cash"
        : financeState.status === "error"
          ? "Finance position could not be loaded"
          : "Awaiting finance position",
      emphasis: null,
      liveMetric: null,
      icon: "coins" as const,
      cashPosition: true,
    },
    {
      label: "Revenue Today",
      value: trading
        ? formatCurrency(trading.netRevenue, trading.currency)
        : "Unavailable",
      supportingText: trading
        ? `Gross ${formatCurrency(trading.grossRevenue, trading.currency)} · Refunds ${formatCurrency(trading.refunds, trading.currency)}`
        : tradingState.status === "error"
          ? "Trading data could not be loaded"
          : "Trading data is not available",
      emphasis: null,
      liveMetric: "revenue" as const,
      icon: "pound" as const,
    },
    {
      label: "Orders Today",
      value: trading ? String(trading.orderCount) : "Unavailable",
      supportingText: tradingFreshness,
      emphasis: null,
      liveMetric: "orders" as const,
      icon: "cart" as const,
    },
    {
      label: "Profit Today",
      value: "Unavailable",
      supportingText: "Awaiting trusted cost data",
      emphasis: null,
      liveMetric: null,
      icon: "coins" as const,
    },
    {
      label: "Website Intelligence",
      value: visitorMetrics?.estimatedTotal !== null &&
          visitorMetrics?.estimatedTotal !== undefined
        ? visitorMetrics.estimatedTotal.toLocaleString("en-GB")
        : "Unavailable",
      supportingText: visitorMetrics
        ? visitorMetrics.estimatedPrivacy !== null
          ? `${visitorMetrics.tracked?.toLocaleString("en-GB") ?? "Unavailable"} tracked visitors · ${visitorMetrics.estimatedPrivacy.toLocaleString("en-GB")} estimated privacy visitors`
          : `${visitorMetrics.tracked?.toLocaleString("en-GB") ?? "Unavailable"} tracked visitors · Privacy estimate unavailable`
        : websiteAnalyticsUnavailableText,
      emphasis: null,
      liveMetric: null,
      icon: "chart" as const,
      websiteAnalytics: true,
    },
  ];
  const inventoryState =
    businessState.inventory;
  const inventoryStatus =
    businessState.sourceStatuses.find(
      (source) => source.source === "inventory",
    );
  const inventoryStatusText =
    formatInventoryFreshness(
      inventoryState.status,
      inventoryStatus?.lastUpdatedAt ?? null,
      businessState.generatedAt,
    );
  const inventoryStatusColour =
    inventoryState.status === "live"
      ? "var(--vault-success)"
      : inventoryState.status === "stale"
        ? "var(--vault-warning)"
        : "var(--vault-error)";
  const inventory = inventoryState.data;
  const unavailableStockProducts = inventory
    ? inventory.outOfStockProducts +
      inventory.negativeStockProducts
    : null;
  const healthyPercentage = inventory
    ? getInventoryPercentage(
        inventory.healthyProducts,
        inventory.monitoredProducts,
      )
    : null;
  const lowStockPercentage = inventory
    ? getInventoryPercentage(
        inventory.lowStockProducts,
        inventory.monitoredProducts,
      )
    : null;
  const outOfStockPercentage =
    inventory && unavailableStockProducts !== null
      ? getInventoryPercentage(
          unavailableStockProducts,
          inventory.monitoredProducts,
        )
      : null;

  return (
    <VaultAppShell
      searchPlaceholder="Search anything..."
      notificationCount={3}
      systemStatusLabel="Vault systems healthy"
    >
      <CommandCentreLiveTrading
        revenueToday={trading?.netRevenue ?? null}
        revenueCurrency={trading?.currency ?? null}
        ordersToday={trading?.orderCount ?? null}
        recentOrders={recentOrders?.map((order) => ({
          identifier: order.id,
          changeSignature: JSON.stringify({
            amount: order.amount,
            currency: order.currency,
            financialStatus: order.financialStatus,
            fulfilmentStatus: order.fulfilmentStatus,
            createdAt: order.createdAt,
          }),
        })) ?? []}
        latestSynchronizationAt={
          shopifyStatus?.lastUpdatedAt ?? tradingState.lastUpdatedAt
        }
        tradingStatus={shopifyState}
      >
      <div className="vault-content">
          <section className="vault-main-column">
            <div className="vault-page-heading">
              <p className="vault-eyebrow">Vault Command</p>
              <h1>Command Centre</h1>
              <p>Good morning Tom <span aria-hidden>👋</span></p>
            </div>

            <CommandCentreBrainPriority />

            <section className="vault-status-strip">
              <span>
                <i
                  style={{
                    background: shopifyStatusColour,
                    boxShadow: `0 0 8px ${shopifyStatusColour}`,
                  }}
                />
                {shopifyStatusText}
              </span>
              <span>
                <i
                  style={{
                    background: inventoryStatusColour,
                    boxShadow: `0 0 8px ${inventoryStatusColour}`,
                  }}
                />
                {inventoryStatusText}
              </span>
              <span>
                <i
                  style={{
                    background: websiteAnalyticsStatusColour,
                    boxShadow: `0 0 8px ${websiteAnalyticsStatusColour}`,
                  }}
                />
                {websiteAnalyticsFreshness}
              </span>
              <span><i /> Vault Brain online</span>
              <span><i /> 0 sync errors</span>
            </section>

            <section className="vault-metrics">
              {metrics.map((metric) => (
                <article className="vault-card vault-metric-card" key={metric.label}>
                  <div className="vault-metric-label">
                    <span className="vault-card-icon">
                      <Icon name={metric.icon} />
                    </span>
                    <span>{metric.label}</span>
                  </div>

                  <strong>
                    {metric.liveMetric ? (
                      <CommandCentreLiveMetric metric={metric.liveMetric} />
                    ) : (
                      metric.value
                    )}
                  </strong>

                  <p>
                    {metric.emphasis ? (
                      <>
                        <span>{metric.emphasis}</span> {metric.supportingText}
                      </>
                    ) : (
                      metric.supportingText
                    )}
                  </p>
                  {metric.websiteAnalytics ? (
                    <div className="vault-analytics-meta">
                      <span
                        className={`vault-live-now is-${websiteAnalyticsState.status}`}
                      >
                        <i aria-hidden="true" />
                        {visitorMetrics?.liveTracked !== null &&
                            visitorMetrics?.liveTracked !== undefined
                          ? `Currently browsing · ${visitorMetrics.liveTracked.toLocaleString("en-GB")} tracked`
                          : "Currently browsing unavailable"}
                      </span>
                      {visitorMetrics?.estimatedTotal !== null &&
                          visitorMetrics?.estimatedTotal !== undefined ? (
                        <span>Estimated total</span>
                      ) : null}
                      {visitorMetrics?.trackedPercentage !== null &&
                          visitorMetrics?.trackedPercentage !== undefined ? (
                        <span>
                          {visitorMetrics.trackedPercentage.toLocaleString(
                            "en-GB",
                            { maximumFractionDigits: 1 },
                          )}% tracked visitors
                        </span>
                      ) : null}
                      {websiteAnalyticsState.status === "stale" ? (
                        <span className="is-stale">Stale analytics</span>
                      ) : null}
                    </div>
                  ) : null}
                  {metric.cashPosition ? (
                    <div className="vault-cash-meta">
                      <span>
                        Shopify balance{" "}
                        {finance?.shopifyPaymentsBalance
                          ? formatCurrency(
                            finance.shopifyPaymentsBalance.amount,
                            finance.shopifyPaymentsBalance.currency,
                          )
                          : "unavailable"}
                      </span>
                      <span>
                        {finance?.todayPayout ? (
                          <>
                            Today payout{" "}
                            {formatCurrency(
                              finance.todayPayout.amount,
                              finance.todayPayout.currency,
                            )}{" "}
                            <b className={getPayoutStatusClass(finance.todayPayout.status)}>
                              · {finance.todayPayout.status}
                            </b>
                          </>
                        ) : (
                          "No payout today"
                        )}
                      </span>
                      {financeState.status === "stale" ? (
                        <span className="cash-payout-warning">
                          Finance data partially stale
                        </span>
                      ) : null}
                      <a className="vault-cash-link" href="/commercial">
                        View finance
                      </a>
                    </div>
                  ) : null}
                </article>
              ))}
            </section>

            <section className="vault-panel vault-attention">
              <div className="vault-section-heading">
                <div>
                  <span className="vault-eyebrow">Attention Required</span>
                  <h2>Today&apos;s priorities</h2>
                </div>

                <button className="vault-text-button" type="button">
                  View all <Icon name="arrow" size={16} />
                </button>
              </div>

              <div className="vault-attention-grid">
                <article className="vault-action-card vault-action-card-primary">
                  <div className="vault-action-topline">
                    <span className="vault-badge">Exclusive</span>
                    <Icon name="warning" size={20} />
                  </div>

                  <h3>Moncler Black Badge</h3>
                  <p className="vault-action-title">Order 20 packs</p>
                  <p className="vault-muted">6 days of stock remaining</p>

                  <button className="vault-primary-button" type="button">
                    Generate WhatsApp
                    <Icon name="whatsapp" size={18} />
                  </button>
                </article>

                <article className="vault-action-card">
                  <span className="vault-card-kicker">Dropship partner</span>
                  <h3>Tony</h3>
                  <p className="vault-action-title">3 shoe orders</p>
                  <p className="vault-muted">Awaiting purchase</p>
                  <button className="vault-secondary-button" type="button">
                    View orders
                  </button>
                </article>

                <article className="vault-action-card">
                  <span className="vault-card-kicker">Shipment</span>
                  <div className="vault-inline-title">
                    <h3>UPS</h3>
                    <Icon name="truck" size={28} />
                  </div>
                  <p className="vault-action-title">Arrives tomorrow</p>
                  <p className="vault-muted">Expected at 12:10 PM</p>
                  <button className="vault-secondary-button" type="button">
                    Track shipment
                  </button>
                </article>

                <article className="vault-action-card">
                  <span className="vault-card-kicker">Trustpilot</span>
                  <h3>Excellent</h3>
                  <div className="vault-stars" aria-label="Five stars">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Icon key={index} name="star" size={22} />
                    ))}
                  </div>
                  <p className="vault-muted">New five-star review received</p>
                  <button className="vault-secondary-button" type="button">
                    View review
                  </button>
                </article>
              </div>
            </section>

            <section className="vault-lower-grid">
              <article className="vault-panel vault-sales-card">
                <div className="vault-section-heading">
                  <div>
                    <span className="vault-eyebrow">Sales Overview</span>
                    <h2>Last seven days</h2>
                  </div>
                  <button className="vault-filter-button" type="button">
                    7 Days⌄
                  </button>
                </div>

                <div
                  className="vault-chart"
                  aria-label={trading
                    ? `Seven-day net revenue chart. ${tradingFreshness}.`
                    : `Seven-day sales unavailable. ${tradingFreshness}.`}
                >
                  <div className="vault-chart-grid" />
                  {salesChartPaths ? (
                    <>
                      <svg
                        aria-hidden="true"
                        preserveAspectRatio="none"
                        viewBox="0 0 600 210"
                      >
                        <defs>
                          <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#d4a846" stopOpacity=".36" />
                            <stop offset="100%" stopColor="#d4a846" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path d={salesChartPaths.area} fill="url(#chartFill)" />
                        <path
                          d={salesChartPaths.line}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                      </svg>

                      <div className="vault-chart-labels">
                        {sevenDayDays.map((day) => (
                          <span key={day.date}>{formatChartDate(day.date)}</span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="vault-muted">
                      {tradingState.status === "error"
                        ? "Seven-day sales could not be loaded."
                        : "Seven-day sales are unavailable."}
                    </p>
                  )}
                </div>
              </article>

              <article className="vault-panel">
                <div className="vault-section-heading">
                  <div>
                    <span className="vault-eyebrow">Top Selling Products</span>
                    <h2>Product performance</h2>
                  </div>

                  <button className="vault-text-button" type="button">
                    View all <Icon name="arrow" size={16} />
                  </button>
                </div>

                <div className="vault-product-list">
                  {topProducts && topProducts.length > 0 ? (
                    topProducts.map((product, index) => (
                      <div className="vault-product-row" key={product.productId}>
                        <span className="vault-product-rank">{index + 1}</span>
                        <span className="vault-product-thumbnail">TFV</span>
                        <div>
                          <strong>{product.title}</strong>
                          <span>{product.quantitySold} sold</span>
                        </div>
                        <b>{formatCurrency(product.netRevenue, product.currency)}</b>
                      </div>
                    ))
                  ) : (
                    <p className="vault-muted">
                      {topProductsState.status === "error"
                        ? "Product performance could not be loaded."
                        : topProducts
                          ? "No product sales in the last seven days."
                          : "Product performance is unavailable."}
                    </p>
                  )}
                  {topProductsState.status === "stale" ? (
                    <p className="vault-muted">
                      {formatSourceFreshness(
                        "Product performance",
                        topProductsState.status,
                        topProductsState.lastUpdatedAt,
                        businessState.generatedAt,
                      )}
                    </p>
                  ) : null}
                </div>
              </article>
            </section>
          </section>

          <aside className="vault-right-column">
            <article className="vault-panel vault-health-card">
              <span className="vault-eyebrow">Inventory Health</span>

              <div className="vault-health-content">
                <div
                  className="vault-health-ring"
                  style={
                    inventory
                      ? {
                          background: `conic-gradient(
                            var(--vault-success) 0 ${healthyPercentage ?? 0}%,
                            var(--vault-warning) ${healthyPercentage ?? 0}% ${(healthyPercentage ?? 0) + (lowStockPercentage ?? 0)}%,
                            var(--vault-error) ${(healthyPercentage ?? 0) + (lowStockPercentage ?? 0)}% 100%
                          )`,
                        }
                      : {
                          background: "var(--vault-border)",
                        }
                  }
                >
                  <div>
                    <strong>
                      {inventory
                        ? `${inventory.healthScore}%`
                        : "—"}
                    </strong>
                    <span>
                      {inventory
                        ? `${inventory.monitoredProducts} monitored`
                        : inventoryState.status === "error"
                          ? "Error"
                          : "Unavailable"}
                    </span>
                  </div>
                </div>

                <div className="vault-health-legend">
                  {inventory ? (
                    <>
                      <span>
                        <i className="healthy" /> Healthy
                        <b>
                          {inventory.healthyProducts} · {healthyPercentage === null ? "—" : `${healthyPercentage}%`}
                        </b>
                      </span>
                      <span>
                        <i className="low" /> Low stock
                        <b>
                          {inventory.lowStockProducts} · {lowStockPercentage === null ? "—" : `${lowStockPercentage}%`}
                        </b>
                      </span>
                      <span>
                        <i className="out" /> Out of stock
                        <b>
                          {unavailableStockProducts} · {outOfStockPercentage === null ? "—" : `${outOfStockPercentage}%`}
                        </b>
                      </span>
                    </>
                  ) : (
                    <span>
                      <i className="out" />
                      {inventoryState.status === "error"
                        ? "Inventory data could not be loaded"
                        : "Inventory unavailable"}
                    </span>
                  )}
                </div>
              </div>
            </article>

            <article className="vault-panel">
              <div className="vault-section-heading compact">
                <span className="vault-eyebrow">Recent Orders</span>
                <button className="vault-text-button" type="button">
                  View all
                </button>
              </div>

              <div className="vault-orders-list">
                {recentOrders && recentOrders.length > 0 ? (
                  recentOrders.map((order) => {
                    const financialStatus = formatOrderStatus(
                      order.financialStatus,
                      "UNKNOWN",
                    );
                    const fulfilmentStatus = formatOrderStatus(
                      order.fulfilmentStatus,
                      "UNFULFILLED",
                    );

                    return (
                      <CommandCentreRecentOrderRow
                        key={order.id}
                        orderIdentifier={order.id}
                      >
                        <span>{order.orderName}</span>
                        <strong>
                          {order.customerName ?? "Customer unavailable"} · {formatRelativeTime(
                            order.createdAt,
                            businessState.generatedAt,
                          )}
                        </strong>
                        <span>{formatCurrency(order.amount, order.currency)}</span>
                        <em className="vault-order-status">
                          <span className={getFinancialStatusClass(financialStatus)}>
                            {financialStatus}
                          </span>
                          <span className="vault-order-status-separator"> · </span>
                          <span className={getFulfilmentStatusClass(fulfilmentStatus)}>
                            {fulfilmentStatus}
                          </span>
                        </em>
                      </CommandCentreRecentOrderRow>
                    );
                  })
                ) : (
                  <p className="vault-muted">
                    {recentOrdersState.status === "error"
                      ? "Recent orders could not be loaded."
                      : recentOrders
                        ? "No canonical Shopify orders are available."
                        : "Recent orders are unavailable."}
                  </p>
                )}
                {recentOrdersState.status === "stale" ? (
                  <p className="vault-muted">
                    {formatSourceFreshness(
                      "Recent orders",
                      recentOrdersState.status,
                      recentOrdersState.lastUpdatedAt,
                      businessState.generatedAt,
                    )}
                  </p>
                ) : null}
              </div>
            </article>

            <article className="vault-panel vault-advisor-card">
              <span className="vault-eyebrow">Vault Advisor</span>
              <div className="vault-advisor-icon">✦</div>
              <h3>3 recommendations ready</h3>
              <p>
                Inventory reorder, pricing opportunities and fulfilment actions
                are ready for review.
              </p>
              <button className="vault-primary-button" type="button">
                View Advisor
              </button>
            </article>
          </aside>
        </div>

        <footer className="vault-quick-actions">
          <span className="vault-eyebrow">Quick Actions</span>

          <div>
            <button type="button">＋ Add product</button>
            <button type="button">▣ Create order</button>
            <button type="button">◉ Message partner</button>
            <button type="button">▤ Generate report</button>
            <button type="button">⌁ View analytics</button>
          </div>
        </footer>
      </CommandCentreLiveTrading>
    </VaultAppShell>
  );
}
