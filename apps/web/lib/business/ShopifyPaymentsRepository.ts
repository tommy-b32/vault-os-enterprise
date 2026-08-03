import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type ShopifyPaymentsMoney = {
  amount: number;
  currency: string;
};

export type ShopifyPaymentsPayout = ShopifyPaymentsMoney & {
  status: string;
  issuedAt: string;
};

export type ShopifyPaymentsSnapshot = {
  activated: boolean;
  defaultCurrency: string;
  balances: ShopifyPaymentsMoney[];
  todayPayout: ShopifyPaymentsPayout | null;
  nextScheduledPayout: ShopifyPaymentsPayout | null;
  latestSuccessfulPayout: ShopifyPaymentsPayout | null;
  synchronizedAt: string;
  sourceState: "live" | "stale";
  message: string | null;
};

type StoredSnapshot = {
  activated: boolean;
  default_currency: string;
  balances: unknown;
  today_payout: unknown;
  next_scheduled_payout: unknown;
  latest_successful_payout: unknown;
  synced_at: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function money(value: unknown): ShopifyPaymentsMoney {
  if (!isRecord(value)) throw new Error("Invalid Shopify Payments money data");
  const amount = Number(value.amount);

  if (!Number.isFinite(amount) || typeof value.currency !== "string") {
    throw new Error("Invalid Shopify Payments money data");
  }

  return { amount, currency: value.currency };
}

function payout(value: unknown): ShopifyPaymentsPayout | null {
  if (value === null) return null;
  const parsed = money(value);

  if (
    !isRecord(value) ||
    typeof value.status !== "string" ||
    typeof value.issuedAt !== "string"
  ) {
    throw new Error("Invalid Shopify Payments payout data");
  }

  return { ...parsed, status: value.status, issuedAt: value.issuedAt };
}

function mapStored(
  row: StoredSnapshot,
  sourceState: "live" | "stale",
  message: string | null,
): ShopifyPaymentsSnapshot {
  if (!Array.isArray(row.balances)) {
    throw new Error("Invalid Shopify Payments balance data");
  }

  return {
    activated: row.activated,
    defaultCurrency: row.default_currency,
    balances: row.balances.map(money),
    todayPayout: payout(row.today_payout),
    nextScheduledPayout: payout(row.next_scheduled_payout),
    latestSuccessfulPayout: payout(row.latest_successful_payout),
    synchronizedAt: row.synced_at,
    sourceState,
    message,
  };
}

export const ShopifyPaymentsRepository = {
  async getSnapshot({
    refreshFromShopify = true,
  }: {
    refreshFromShopify?: boolean;
  } = {}): Promise<ShopifyPaymentsSnapshot> {
    const syncSecret = process.env.VAULT_FINANCE_SYNC_SECRET;
    const syncResult = refreshFromShopify && syncSecret
      ? await supabaseAdmin.functions.invoke(
        "shopify-payments-sync",
        {
          method: "POST",
          headers: { "X-Vault-Finance-Sync-Secret": syncSecret },
        },
      )
      : {
        data: null,
        error: new Error(
          refreshFromShopify
            ? "VAULT_FINANCE_SYNC_SECRET is unavailable"
            : "Using the stored Shopify Payments snapshot",
        ),
      };

    if (!syncResult.error && isRecord(syncResult.data?.snapshot)) {
      const snapshot = syncResult.data.snapshot;

      return {
        activated: snapshot.activated === true,
        defaultCurrency: String(snapshot.defaultCurrency),
        balances: Array.isArray(snapshot.balances)
          ? snapshot.balances.map(money)
          : [],
        todayPayout: payout(snapshot.todayPayout),
        nextScheduledPayout: payout(snapshot.nextScheduledPayout),
        latestSuccessfulPayout: payout(snapshot.latestSuccessfulPayout),
        synchronizedAt: String(snapshot.synchronizedAt),
        sourceState: "live",
        message: null,
      };
    }

    const { data, error } = await supabaseAdmin
      .from("vault_shopify_payments_snapshots")
      .select(`
        activated,
        default_currency,
        balances,
        today_payout,
        next_scheduled_payout,
        latest_successful_payout,
        synced_at
      `)
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to read Shopify Payments cache: ${error.message}`);
    }

    if (!data) {
      throw new Error(
        syncResult.error?.message ?? "Shopify Payments has not synchronized",
      );
    }

    return mapStored(
      data as StoredSnapshot,
      refreshFromShopify ? "stale" : "live",
      refreshFromShopify
        ? "Live Shopify Payments refresh failed; showing the latest cached snapshot."
        : null,
    );
  },
} as const;
