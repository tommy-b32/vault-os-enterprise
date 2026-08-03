"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  CommandCentreLiveRefresh,
} from "@/components/command-centre/CommandCentreLiveRefresh";

type TradingStatus = "live" | "stale" | "unavailable" | "error";
type TradingToast = "refreshing" | "updated" | null;

type LiveTradingContextValue = {
  revenueToday: number | null;
  revenueCurrency: string | null;
  ordersToday: number | null;
  highlightedOrderIdentifiers: ReadonlySet<string>;
};

type CommandCentreLiveTradingProps = {
  revenueToday: number | null;
  revenueCurrency: string | null;
  ordersToday: number | null;
  recentOrders: Array<{
    identifier: string;
    changeSignature: string;
  }>;
  latestSynchronizationAt: string | null;
  tradingStatus: TradingStatus;
  children: ReactNode;
};

type CommandCentreLiveMetricProps = {
  metric: "revenue" | "orders";
  unavailableLabel?: string;
};

type CommandCentreRecentOrderRowProps = {
  orderIdentifier: string;
  children: ReactNode;
};

const METRIC_ANIMATION_MS = 600;
const ORDER_HIGHLIGHT_MS = 2_500;
const ACTIVITY_TOAST_MS = 3_000;
const UPDATED_TOAST_MS = 2_000;

const LiveTradingContext = createContext<LiveTradingContextValue | null>(null);

function useLiveTradingContext(): LiveTradingContextValue {
  const value = useContext(LiveTradingContext);

  if (!value) {
    throw new Error(
      "Live trading presentation must be rendered inside CommandCentreLiveTrading",
    );
  }

  return value;
}

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(query.matches);

    updatePreference();
    query.addEventListener("change", updatePreference);

    return () => query.removeEventListener("change", updatePreference);
  }, []);

  return reducedMotion;
}

function useAnimatedNumber(
  target: number | null,
  wholeNumber: boolean,
): number | null {
  const [displayedValue, setDisplayedValue] = useState(target);
  const displayedValueRef = useRef(target);
  const initialRenderRef = useRef(true);
  const animationFrameRef = useRef<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (initialRenderRef.current) {
      initialRenderRef.current = false;
      return;
    }

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (target === null || reducedMotion) {
      animationFrameRef.current = requestAnimationFrame(() => {
        displayedValueRef.current = target;
        setDisplayedValue(target);
        animationFrameRef.current = null;
      });

      return () => {
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };
    }

    const startingValue = displayedValueRef.current ?? target;

    if (startingValue === target) {
      return;
    }

    const startedAt = performance.now();
    const animate = (timestamp: number) => {
      const progress = Math.min(1, (timestamp - startedAt) / METRIC_ANIMATION_MS);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const nextValue = startingValue + (target - startingValue) * easedProgress;
      const presentedValue = wholeNumber ? Math.round(nextValue) : nextValue;

      displayedValueRef.current = presentedValue;
      setDisplayedValue(presentedValue);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [reducedMotion, target, wholeNumber]);

  return displayedValue;
}

function formatCurrency(value: number, currency: string | null): string {
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

export function CommandCentreLiveTrading({
  revenueToday,
  revenueCurrency,
  ordersToday,
  recentOrders,
  latestSynchronizationAt,
  tradingStatus,
  children,
}: CommandCentreLiveTradingProps) {
  const [toast, setToast] = useState<TradingToast>(null);
  const [highlightedOrderIdentifiers, setHighlightedOrderIdentifiers] =
    useState<ReadonlySet<string>>(new Set());
  const previousOrderSignaturesRef = useRef<ReadonlyMap<string, string> | null>(null);
  const previousTradingSignatureRef = useRef<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearToastTimer = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, []);

  const showActivityToast = useCallback(() => {
    clearToastTimer();
    setToast("refreshing");
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, ACTIVITY_TOAST_MS);
  }, [clearToastTimer]);

  const showUpdatedToast = useCallback(() => {
    clearToastTimer();
    setToast("updated");
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, UPDATED_TOAST_MS);
  }, [clearToastTimer]);

  useEffect(() => {
    const nextSignatures = new Map(
      recentOrders.map((order) => [order.identifier, order.changeSignature]),
    );

    if (previousOrderSignaturesRef.current === null) {
      previousOrderSignaturesRef.current = nextSignatures;
      return;
    }

    const newIdentifiers = new Set(
      recentOrders
        .filter((order) =>
          previousOrderSignaturesRef.current?.get(order.identifier) !==
          order.changeSignature)
        .map((order) => order.identifier),
    );

    previousOrderSignaturesRef.current = nextSignatures;

    if (newIdentifiers.size === 0) {
      return;
    }

    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }

    setHighlightedOrderIdentifiers(newIdentifiers);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedOrderIdentifiers(new Set());
      highlightTimerRef.current = null;
    }, ORDER_HIGHLIGHT_MS);
  }, [recentOrders]);

  useEffect(() => {
    const nextSignature = JSON.stringify({
      revenueToday,
      ordersToday,
      latestSynchronizationAt,
      tradingStatus,
    });

    if (previousTradingSignatureRef.current === null) {
      previousTradingSignatureRef.current = nextSignature;
      return;
    }

    previousTradingSignatureRef.current = nextSignature;
  }, [latestSynchronizationAt, ordersToday, revenueToday, tradingStatus]);

  useEffect(() => {
    return () => {
      clearToastTimer();

      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    };
  }, [clearToastTimer]);

  return (
    <LiveTradingContext.Provider
      value={{
        revenueToday,
        revenueCurrency,
        ordersToday,
        highlightedOrderIdentifiers,
      }}
    >
      <CommandCentreLiveRefresh
        onActivityDetected={showActivityToast}
        onRefreshComplete={showUpdatedToast}
      />

      {toast ? (
        <div
          className={`vault-live-trading-toast is-${toast}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="vault-live-trading-indicator" aria-hidden="true" />
          <div>
            <strong>
              {toast === "refreshing"
                ? "New Shopify activity detected"
                : "Command Centre updated"}
            </strong>
            {toast === "refreshing" ? (
              <p>Refreshing live trading data…</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {children}
    </LiveTradingContext.Provider>
  );
}

export function CommandCentreLiveMetric({
  metric,
  unavailableLabel = "Unavailable",
}: CommandCentreLiveMetricProps) {
  const { revenueToday, revenueCurrency, ordersToday } =
    useLiveTradingContext();
  const target = metric === "revenue" ? revenueToday : ordersToday;
  const displayedValue = useAnimatedNumber(target, metric === "orders");

  if (displayedValue === null) {
    return <span className="vault-live-metric-value">{unavailableLabel}</span>;
  }

  return (
    <span className="vault-live-metric-value">
      {metric === "revenue"
        ? formatCurrency(displayedValue, revenueCurrency)
        : Math.round(displayedValue).toLocaleString("en-GB")}
    </span>
  );
}

export function CommandCentreRecentOrderRow({
  orderIdentifier,
  children,
}: CommandCentreRecentOrderRowProps) {
  const { highlightedOrderIdentifiers } = useLiveTradingContext();
  const isHighlighted = highlightedOrderIdentifiers.has(orderIdentifier);

  return (
    <div
      className={`vault-order-row${isHighlighted ? " is-live-updated" : ""}`}
    >
      {children}
    </div>
  );
}
