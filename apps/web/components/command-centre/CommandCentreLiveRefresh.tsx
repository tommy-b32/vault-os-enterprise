"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

const TRADING_TOPIC = "vault-os:trading";
const TRADING_EVENT = "trading-changed";
const REFRESH_DEBOUNCE_MS = 750;
const STORED_DATA_REFRESH_MS = 30_000;

type CommandCentreLiveRefreshProps = {
  onActivityDetected: () => void;
  onRefreshComplete: () => void;
};

export function CommandCentreLiveRefresh({
  onActivityDetected,
  onRefreshComplete,
}: CommandCentreLiveRefreshProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const announceRefreshRef = useRef(false);

  useEffect(() => {
    if (isPending || !refreshInFlightRef.current) {
      return;
    }

    refreshInFlightRef.current = false;
    if (announceRefreshRef.current) {
      announceRefreshRef.current = false;
      onRefreshComplete();
    }

    if (refreshQueuedRef.current) {
      refreshQueuedRef.current = false;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;

        if (document.hidden) {
          announceRefreshRef.current = false;
          return;
        }

        if (refreshInFlightRef.current) {
          refreshQueuedRef.current = true;
          return;
        }

        refreshInFlightRef.current = true;
        startTransition(() => router.refresh());
      }, REFRESH_DEBOUNCE_MS);
    }
  }, [isPending, onRefreshComplete, router, startTransition]);

  useEffect(() => {
    const startRefresh = (announce: boolean) => {
      if (document.hidden) {
        return;
      }

      if (refreshInFlightRef.current) {
        refreshQueuedRef.current = true;
        announceRefreshRef.current ||= announce;
        return;
      }

      announceRefreshRef.current ||= announce;
      refreshInFlightRef.current = true;
      startTransition(() => router.refresh());
    };

    const requestBroadcastRefresh = () => {
      if (!timerRef.current && !refreshInFlightRef.current) {
        onActivityDetected();
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        timerRef.current = null;

        startRefresh(true);
      }, REFRESH_DEBOUNCE_MS);
    };

    const stopPolling = () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };

    const startPolling = (refreshImmediately: boolean) => {
      stopPolling();

      if (document.hidden) {
        return;
      }

      if (refreshImmediately) {
        startRefresh(false);
      }

      pollingTimerRef.current = setInterval(() => {
        startRefresh(false);
      }, STORED_DATA_REFRESH_MS);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
        return;
      }

      startPolling(true);
    };

    const channel = supabase
      .channel(TRADING_TOPIC, {
        config: {
          private: false,
        },
      })
      .on("broadcast", { event: TRADING_EVENT }, requestBroadcastRefresh)
      .subscribe();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    startPolling(false);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopPolling();

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      refreshQueuedRef.current = false;
      refreshInFlightRef.current = false;
      announceRefreshRef.current = false;
      void supabase.removeChannel(channel);
    };
  }, [onActivityDetected, router, startTransition]);

  return null;
}
