import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type ShopifyAnalyticsSnapshot = {
  availability: "live" | "stale" | "unavailable" | "pending_permission";
  fetchedAt: string | null;
  reportingTimezone: string | null;
  today: null | {
    sessions: number;
    visitors: number | null;
    cartAdditions: number;
    reachedCheckout: number;
    completedCheckout: number;
    conversionRate: number;
  };
  sessionTrend: Array<{ label: string; value: number }>;
};

function londonDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export const ShopifyAnalyticsRepository = {
  async getSnapshot(now = new Date()): Promise<ShopifyAnalyticsSnapshot> {
    const [{ data: state, error: stateError }, { data: days, error: daysError }] = await Promise.all([
      supabaseAdmin.from("vault_shopify_analytics_sync_state").select("availability, reporting_timezone, last_attempted_at, last_successful_at, failure_code").eq("singleton", true).maybeSingle(),
      supabaseAdmin.from("vault_shopify_analytics_daily").select("reporting_date, sessions, online_store_visitors, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout, conversion_rate, fetched_at").order("reporting_date", { ascending: false }).limit(7),
    ]);
    if (stateError || daysError) return { availability: "unavailable", fetchedAt: null, reportingTimezone: null, today: null, sessionTrend: [] };
    const latest = days?.[0] ?? null;
    const age = latest ? now.getTime() - Date.parse(latest.fetched_at) : Infinity;
    const availability = state?.availability === "pending_permission"
      ? "pending_permission"
      : state?.availability === "live" && latest && age <= 30 * 60_000
        ? "live"
        : latest ? "stale" : "unavailable";
    const today = days?.find((day) => day.reporting_date === londonDate(now)) ?? null;
    return {
      availability,
      fetchedAt: latest?.fetched_at ?? state?.last_successful_at ?? null,
      reportingTimezone: state?.reporting_timezone ?? null,
      today: today ? {
        sessions: today.sessions, visitors: today.online_store_visitors,
        cartAdditions: today.sessions_with_cart_additions,
        reachedCheckout: today.sessions_that_reached_checkout,
        completedCheckout: today.sessions_that_completed_checkout,
        conversionRate: Number(today.conversion_rate),
      } : null,
      sessionTrend: [...(days ?? [])].reverse().map((day) => ({ label: day.reporting_date, value: day.sessions })),
    };
  },
};
