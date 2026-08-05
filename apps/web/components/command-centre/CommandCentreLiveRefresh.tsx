"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { isCommandCentreRefreshEvent } from "@/lib/command-centre/CommandCentreRefreshEvents";
import {
  decideRefreshRequest,
  RECOVERY_REFRESH_MS,
  REFRESH_DEBOUNCE_MS,
  shouldScheduleFinalRefresh,
} from "@/lib/command-centre/CommandCentreLiveRefreshPolicy";
import { supabase } from "@/lib/supabase";

const UPDATED_VISIBLE_MS = 1_500;
const REFRESH_TABLE = "vault_command_centre_refresh_events";

export type CommandCentreLiveStatus =
  | "connecting"
  | "live"
  | "refreshing"
  | "updated"
  | "reconnecting"
  | "delayed"
  | "unavailable";

const STATUS_LABELS: Record<CommandCentreLiveStatus, string> = {
  connecting: "Connecting…",
  live: "Live",
  refreshing: "Refreshing…",
  updated: "Updated",
  reconnecting: "Reconnecting…",
  delayed: "Delayed",
  unavailable: "Unavailable",
};

export function CommandCentreLiveRefresh({
  generatedAt,
}: {
  generatedAt: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [status, setStatus] = useState<CommandCentreLiveStatus>("connecting");
  const previousGeneratedAtRef = useRef(generatedAt);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updatedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const recoveryRequiredRef = useRef(false);
  const subscriptionConfirmedRef = useRef(false);
  const lastRefreshCompletedAtRef = useRef(0);

  const clearDebounce = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const clearUpdatedTimer = useCallback(() => {
    if (updatedTimerRef.current) {
      clearTimeout(updatedTimerRef.current);
      updatedTimerRef.current = null;
    }
  }, []);

  const startRefresh = useCallback(() => {
    if (document.hidden) {
      recoveryRequiredRef.current = true;
      return;
    }
    if (!navigator.onLine) {
      recoveryRequiredRef.current = true;
      setStatus("unavailable");
      return;
    }
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }

    clearUpdatedTimer();
    refreshInFlightRef.current = true;
    recoveryRequiredRef.current = false;
    setStatus("refreshing");
    startTransition(() => router.refresh());
  }, [clearUpdatedTimer, router]);

  const requestDebouncedRefresh = useCallback(() => {
    const decision = decideRefreshRequest({
      hidden: document.hidden,
      online: navigator.onLine,
      refreshInFlight: refreshInFlightRef.current,
    });

    if (decision === "defer") {
      recoveryRequiredRef.current = true;
      if (!navigator.onLine) setStatus("unavailable");
      return;
    }
    if (decision === "queue") {
      refreshQueuedRef.current = true;
      return;
    }

    clearDebounce();
    setStatus("refreshing");
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      startRefresh();
    }, REFRESH_DEBOUNCE_MS);
  }, [clearDebounce, startRefresh]);

  useEffect(() => {
    if (previousGeneratedAtRef.current === generatedAt) return;
    previousGeneratedAtRef.current = generatedAt;
    lastRefreshCompletedAtRef.current = Date.now();

    if (!refreshInFlightRef.current) return;

    refreshInFlightRef.current = false;
    const finalRefreshRequired = shouldScheduleFinalRefresh(refreshQueuedRef.current);
    refreshQueuedRef.current = false;
    setStatus("updated");
    clearUpdatedTimer();

    updatedTimerRef.current = setTimeout(() => {
      updatedTimerRef.current = null;
      if (!finalRefreshRequired) {
        setStatus(subscriptionConfirmedRef.current ? "live" : "reconnecting");
      }
    }, UPDATED_VISIBLE_MS);

    if (finalRefreshRequired) requestDebouncedRefresh();
  }, [clearUpdatedTimer, generatedAt, requestDebouncedRefresh]);

  useEffect(() => {
    const stopRecoveryTimer = () => {
      if (recoveryTimerRef.current) {
        clearInterval(recoveryTimerRef.current);
        recoveryTimerRef.current = null;
      }
    };

    const startRecoveryTimer = () => {
      stopRecoveryTimer();
      if (document.hidden || !navigator.onLine) return;

      // Realtime is an acceleration layer rather than a durable queue. One
      // visible-page refresh every 90 seconds recovers a missed notification.
      recoveryTimerRef.current = setInterval(() => {
        if (
          document.hidden ||
          !navigator.onLine ||
          refreshInFlightRef.current ||
          Date.now() - lastRefreshCompletedAtRef.current < RECOVERY_REFRESH_MS
        ) {
          return;
        }
        startRefresh();
      }, RECOVERY_REFRESH_MS);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopRecoveryTimer();
        return;
      }

      startRecoveryTimer();
      recoveryRequiredRef.current = false;
      startRefresh();
    };

    const handleOffline = () => {
      subscriptionConfirmedRef.current = false;
      recoveryRequiredRef.current = true;
      setStatus("unavailable");
      stopRecoveryTimer();
    };

    const handleOnline = () => {
      recoveryRequiredRef.current = true;
      setStatus("reconnecting");
      startRecoveryTimer();
    };

    lastRefreshCompletedAtRef.current = Date.now();
    if (!navigator.onLine) queueMicrotask(handleOffline);

    const channel = supabase
      .channel("command-centre-refresh-events")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: REFRESH_TABLE,
        },
        (payload) => {
          if (isCommandCentreRefreshEvent(payload.new)) {
            requestDebouncedRefresh();
          }
        },
      )
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === "SUBSCRIBED") {
          const needsRecovery = recoveryRequiredRef.current;
          subscriptionConfirmedRef.current = true;
          setStatus(refreshInFlightRef.current ? "refreshing" : "live");
          if (needsRecovery) startRefresh();
          return;
        }

        subscriptionConfirmedRef.current = false;
        recoveryRequiredRef.current = true;
        if (!navigator.onLine) {
          setStatus("unavailable");
        } else if (subscriptionStatus === "TIMED_OUT") {
          setStatus("delayed");
        } else if (
          subscriptionStatus === "CHANNEL_ERROR" ||
          subscriptionStatus === "CLOSED"
        ) {
          setStatus("reconnecting");
        }
      });

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    startRecoveryTimer();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      stopRecoveryTimer();
      clearDebounce();
      clearUpdatedTimer();
      refreshQueuedRef.current = false;
      refreshInFlightRef.current = false;
      void supabase.removeChannel(channel);
    };
  }, [clearDebounce, clearUpdatedTimer, requestDebouncedRefresh, startRefresh]);

  return (
    <span
      aria-atomic="true"
      aria-label={`Command Centre live refresh: ${STATUS_LABELS[status]}`}
      aria-live="polite"
      className={`cc-live-refresh is-${status}`}
      role="status"
    >
      <i aria-hidden="true">●</i> {STATUS_LABELS[status]}
    </span>
  );
}
