import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type MetaAdsSnapshot = {
  availability: "live" | "stale" | "unavailable" | "pending_configuration";
  fetchedAt: string | null;
  reportingTimezone: string | null;
  currency: string | null;
  today: null | {
    spend: number;
    attributedRevenue: number;
    roas: number;
    impressions: number;
    ctr: number;
    cpc: number;
    purchases: number;
  };
};

function dateInTimezone(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export const MetaAdsRepository = {
  async getSnapshot(now = new Date()): Promise<MetaAdsSnapshot> {
    const [{ data: state, error: stateError }, { data: days, error: daysError }] = await Promise.all([
      supabaseAdmin
        .from("vault_meta_ads_sync_state")
        .select("availability, reporting_timezone, currency, last_attempted_at, last_successful_at, failure_code")
        .eq("singleton", true)
        .maybeSingle(),
      supabaseAdmin
        .from("vault_meta_ads_daily")
        .select("reporting_date, spend, impressions, ctr, cpc, purchases, purchase_value, roas, fetched_at")
        .order("reporting_date", { ascending: false })
        .limit(7),
    ]);

    if (stateError || daysError) {
      return {
        availability: "unavailable",
        fetchedAt: null,
        reportingTimezone: null,
        currency: null,
        today: null,
      };
    }

    const latest = days?.[0] ?? null;
    const age = latest ? now.getTime() - Date.parse(latest.fetched_at) : Infinity;

    const availability =
      state?.availability === "pending_configuration"
        ? "pending_configuration"
        : state?.availability === "live" && latest && age <= 30 * 60_000
          ? "live"
          : latest
            ? "stale"
            : "unavailable";

    const timezone = state?.reporting_timezone ?? "Europe/London";
    const today = days?.find((day) => day.reporting_date === dateInTimezone(now, timezone)) ?? null;

    return {
      availability,
      fetchedAt: latest?.fetched_at ?? state?.last_successful_at ?? null,
      reportingTimezone: state?.reporting_timezone ?? null,
      currency: state?.currency ?? null,
      today: today
        ? {
            spend: Number(today.spend),
            attributedRevenue: Number(today.purchase_value),
            roas: Number(today.roas),
            impressions: Number(today.impressions),
            ctr: Number(today.ctr),
            cpc: Number(today.cpc),
            purchases: Number(today.purchases),
          }
        : null,
    };
  },
};
