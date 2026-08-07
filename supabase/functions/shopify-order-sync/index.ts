import { createClient } from "npm:@supabase/supabase-js@2";

import {
  fetchHistoricalShopifyOrders,
  fetchRecentShopifyOrders,
  upsertShopifyOrder,
} from "../_shared/shopify/orders.ts";
import { emitCommandCentreRefreshEvent } from "../_shared/command-centre-refresh.ts";
import { parseOrderSyncRequest } from "./request.ts";

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
    const startedAt = new Date().toISOString();
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

    let requestInput: ReturnType<typeof parseOrderSyncRequest>;
    try {
      const requestText = await request.text();
      requestInput = parseOrderSyncRequest(
        requestText.trim() ? JSON.parse(requestText) : {},
      );
    } catch (error) {
      return respond({
        success: false,
        error: error instanceof Error ? error.message : "Invalid request body",
      }, 400);
    }

    const syncDays = requestInput.mode === "historical_backfill"
      ? Math.ceil(
          (Date.parse(requestInput.createdBefore) - Date.parse(requestInput.createdFrom)) /
            (24 * 60 * 60 * 1000),
        )
      : getSyncDays();
    const updatedSince = requestInput.mode === "reconciliation"
      ? new Date(Date.now() - syncDays * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    const orders = requestInput.mode === "historical_backfill"
      ? await fetchHistoricalShopifyOrders(
          requestInput.createdFrom,
          requestInput.createdBefore,
        )
      : await fetchRecentShopifyOrders(updatedSince as string);
    let linesSynced = 0;

    for (const order of orders) {
      const result = await upsertShopifyOrder(supabase, order);
      linesSynced += result.linesSynced;
    }

    const completedAt = new Date().toISOString();
    const { data: syncRun, error: syncRunError } = await supabase
      .from("vault_shopify_order_sync_runs")
      .insert({
        sync_mode: requestInput.mode === "historical_backfill"
          ? "historical_orders_by_created_at"
          : "recent_orders_by_updated_at",
        sync_days: syncDays,
        orders_synced: orders.length,
        order_lines_synced: linesSynced,
        started_at: startedAt,
        completed_at: completedAt,
      })
      .select("id")
      .single();

    if (syncRunError) {
      throw new Error(
        `Unable to record completed Shopify order sync: ${syncRunError.message}`,
      );
    }

    await emitCommandCentreRefreshEvent({
      supabase,
      domain: "trading",
      eventType: "order-sync-completed",
      entityId: syncRun.id,
      source: "shopify-order-sync",
    });

    return respond({
      success: true,
      sync_mode: requestInput.mode === "historical_backfill"
        ? "historical_orders_by_created_at"
        : "recent_orders_by_updated_at",
      sync_days: syncDays,
      updated_since: updatedSince,
      created_from: requestInput.mode === "historical_backfill"
        ? requestInput.createdFrom
        : null,
      created_before: requestInput.mode === "historical_backfill"
        ? requestInput.createdBefore
        : null,
      orders_synced: orders.length,
      order_lines_synced: linesSynced,
      completed_at: completedAt,
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
