import { createClient } from "npm:@supabase/supabase-js@2";

import {
  fetchRecentShopifyOrders,
  upsertShopifyOrder,
} from "../_shared/shopify/orders.ts";

const DEFAULT_SYNC_DAYS = 7;
const MAX_SYNC_DAYS = 90;

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function getSyncDays(): number {
  const configured = Number(
    Deno.env.get("SHOPIFY_ORDER_SYNC_DAYS") ?? DEFAULT_SYNC_DAYS,
  );

  if (!Number.isInteger(configured) || configured < 1) {
    throw new Error("SHOPIFY_ORDER_SYNC_DAYS must be a positive integer");
  }

  return Math.min(configured, MAX_SYNC_DAYS);
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }

  return difference === 0;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return respond({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const configuredSyncSecret = Deno.env.get("VAULT_ORDER_SYNC_SECRET");
    const providedSyncSecret = request.headers.get("x-vault-sync-secret");

    if (!configuredSyncSecret) {
      throw new Error("VAULT_ORDER_SYNC_SECRET is unavailable");
    }

    if (
      !providedSyncSecret ||
      !constantTimeEqual(providedSyncSecret, configuredSyncSecret)
    ) {
      return respond({ success: false, error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Required Supabase environment variables are unavailable");
    }

    const syncDays = getSyncDays();
    const updatedSince = new Date(
      Date.now() - syncDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    const orders = await fetchRecentShopifyOrders(updatedSince);
    let linesSynced = 0;

    for (const order of orders) {
      const result = await upsertShopifyOrder(supabase, order);
      linesSynced += result.linesSynced;
    }

    return respond({
      success: true,
      sync_mode: "recent_orders_by_updated_at",
      sync_days: syncDays,
      updated_since: updatedSince,
      orders_synced: orders.length,
      order_lines_synced: linesSynced,
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "[Vault Shopify Order Sync]",
      error instanceof Error ? error.message : "Unexpected error",
    );

    return respond(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected order synchronisation error",
      },
      500,
    );
  }
});
