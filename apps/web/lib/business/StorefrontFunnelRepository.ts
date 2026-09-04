import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type StorefrontFunnelSnapshot = {
  trackedSessions: number | null;
  addToCartSessions: number | null;
  checkoutStartedSessions: number | null;
  checkoutCompletedSessions: number | null;
  abandonedCheckouts: number | null;
  addToCartRate: number | null;
  checkoutRate: number | null;
  conversionRate: number | null;
  latestActivityAt: string | null;
  stale: boolean;
};

type FunnelRow = {
  tracked_sessions: number | string | null;
  add_to_cart_sessions: number | string | null;
  checkout_started_sessions: number | string | null;
  checkout_completed_sessions: number | string | null;
  abandoned_checkouts: number | string | null;
  add_to_cart_rate: number | string | null;
  checkout_rate: number | string | null;
  conversion_rate: number | string | null;
  latest_activity_at: string | null;
};

const FUNNEL_FRESHNESS_THRESHOLD_MS = 30 * 60 * 1000;

function canonicalCount(value: number | string | null): number | null {
  if (value === null) return null;

  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Canonical storefront funnel contains an invalid count");
  }

  return count;
}

function canonicalRate(value: number | string | null): number | null {
  if (value === null) return null;

  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new Error("Canonical storefront funnel contains an invalid rate");
  }

  return rate;
}

export const StorefrontFunnelRepository = {
  async getToday(): Promise<StorefrontFunnelSnapshot> {
    const { data, error } = await supabaseAdmin
      .from("vault_storefront_funnel_today")
      .select(`
        tracked_sessions,
        add_to_cart_sessions,
        checkout_started_sessions,
        checkout_completed_sessions,
        abandoned_checkouts,
        add_to_cart_rate,
        checkout_rate,
        conversion_rate,
        latest_activity_at
      `)
      .single();

    if (error) {
      throw new Error(`Unable to read canonical storefront funnel: ${error.message}`);
    }

    const row = data as FunnelRow;
    const latestActivityAt = row.latest_activity_at;
    const latestActivityTime = latestActivityAt === null
      ? Number.NaN
      : Date.parse(latestActivityAt);
    return {
      trackedSessions: canonicalCount(row.tracked_sessions),
      addToCartSessions: canonicalCount(row.add_to_cart_sessions),
      checkoutStartedSessions: canonicalCount(row.checkout_started_sessions),
      checkoutCompletedSessions: canonicalCount(row.checkout_completed_sessions),
      abandonedCheckouts: canonicalCount(row.abandoned_checkouts),
      addToCartRate: canonicalRate(row.add_to_cart_rate),
      checkoutRate: canonicalRate(row.checkout_rate),
      conversionRate: canonicalRate(row.conversion_rate),
      latestActivityAt,
      stale: !Number.isFinite(latestActivityTime) ||
        Date.now() - latestActivityTime > FUNNEL_FRESHNESS_THRESHOLD_MS,
    };
  },
} as const;
