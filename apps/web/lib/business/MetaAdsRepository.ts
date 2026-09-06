import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type MetaAdsSnapshot = {
  availability: "live" | "stale" | "unavailable" | "pending_configuration";
  fetchedAt: string | null;
  reportingTimezone: string | null;
  currency: string | null;
  previous7Days: { roas: number | null; costPerPurchase: number | null } | null;
  roasChangePercent: number | null;
  costPerPurchaseChangePercent: number | null;
  today: null | {
    spend: number;
    attributedRevenue: number;
    roas: number;
    impressions: number;
    ctr: number;
    cpc: number;
    purchases: number;
    linkClicks: number;
    landingPageViews: number;
    costPerPurchase: number | null;
    cpm: number | null;
    landingPageViewRate: number | null;
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
        .select("reporting_date, spend, impressions, link_clicks, landing_page_views, ctr, cpc, purchases, purchase_value, roas, fetched_at")
        .order("reporting_date", { ascending: false })
        .limit(8),
    ]);

    if (stateError || daysError) {
      return {
        availability: "unavailable",
        fetchedAt: null,
        reportingTimezone: null,
        currency: null,
        today: null,
        previous7Days: null,
        roasChangePercent: null,
        costPerPurchaseChangePercent: null,
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
    const todayDate = dateInTimezone(now, timezone);
    const today = days?.find((day) => day.reporting_date === todayDate) ?? null;
    // Step through calendar dates, not 24-hour intervals in the account timezone (DST).
    const previousDates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(`${todayDate}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - index - 1);
      return date.toISOString().slice(0, 10);
    });
    const previousDays = previousDates.map((date) => days?.find((day) => day.reporting_date === date));
    const complete = previousDays.every((day) => day &&
      [day.spend, day.purchase_value, day.purchases].every((value) =>
        value != null && Number.isFinite(Number(value)) && Number(value) >= 0));
    const total = (key: "spend" | "purchase_value" | "purchases") =>
      previousDays.reduce((sum, day) => sum + Number(day?.[key]), 0);
    const ratio = (numerator: number, denominator: number): number | null =>
      Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
        ? numerator / denominator : null;
    const previous7Days = complete ? {
      roas: ratio(total("purchase_value"), total("spend")),
      costPerPurchase: ratio(total("spend"), total("purchases")),
    } : null;
    const change = (current: number | null, baseline: number | null | undefined) =>
      current != null && baseline != null && baseline > 0
        ? ((current - baseline) / baseline) * 100 : null;
    const todayRoas = today ? ratio(Number(today.purchase_value), Number(today.spend)) : null;
    const todayCpp = today ? ratio(Number(today.spend), Number(today.purchases)) : null;

    return {
      availability,
      fetchedAt: latest?.fetched_at ?? state?.last_successful_at ?? null,
      reportingTimezone: state?.reporting_timezone ?? null,
      currency: state?.currency ?? null,
      previous7Days,
      roasChangePercent: change(todayRoas, previous7Days?.roas),
      costPerPurchaseChangePercent: change(todayCpp, previous7Days?.costPerPurchase),
      today: today
        ? {
            spend: Number(today.spend),
            attributedRevenue: Number(today.purchase_value),
            roas: Number(today.roas),
            impressions: Number(today.impressions),
            ctr: Number(today.ctr),
            cpc: Number(today.cpc),
            purchases: Number(today.purchases),
            linkClicks: Number(today.link_clicks),
            landingPageViews: Number(today.landing_page_views),
            costPerPurchase: Number(today.purchases) > 0
              ? Number(today.spend) / Number(today.purchases)
              : null,
            cpm: Number(today.impressions) > 0
              ? (Number(today.spend) / Number(today.impressions)) * 1000
              : null,
            landingPageViewRate: Number(today.link_clicks) > 0
              ? (Number(today.landing_page_views) / Number(today.link_clicks)) * 100
              : null,
          }
        : null,
    };
  },
};
