import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type StorefrontFunnelSnapshot = {
  addToCartSessions: number | null;
  abandonedCheckouts: number | null;
  latestActivityAt: string | null;
};

type FunnelRow = {
  add_to_cart_sessions: number | string | null;
  abandoned_checkouts: number | string | null;
  latest_activity_at: string | null;
};

function canonicalCount(value: number | string | null): number | null {
  if (value === null) return null;

  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Canonical storefront funnel contains an invalid count");
  }

  return count;
}

export const StorefrontFunnelRepository = {
  async getToday(): Promise<StorefrontFunnelSnapshot> {
    const { data, error } = await supabaseAdmin
      .from("vault_storefront_funnel_today")
      .select("add_to_cart_sessions, abandoned_checkouts, latest_activity_at")
      .single();

    if (error) {
      throw new Error(`Unable to read canonical storefront funnel: ${error.message}`);
    }

    const row = data as FunnelRow;
    return {
      addToCartSessions: canonicalCount(row.add_to_cart_sessions),
      abandonedCheckouts: canonicalCount(row.abandoned_checkouts),
      latestActivityAt: row.latest_activity_at,
    };
  },
} as const;
