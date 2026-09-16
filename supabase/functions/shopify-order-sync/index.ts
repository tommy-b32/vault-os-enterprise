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

    const reconciliationBefore = requestInput.mode === "reconciliation"
      ? startedAt
      : null;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let maintenanceWindow: { created_from: string; created_before: string } | null = null;
    if (requestInput.mode === "historical_maintenance") {
      const { data, error } = await supabase.rpc("get_shopify_historical_maintenance_window", { target_at: startedAt });
      if (error) throw new Error(`Unable to plan historical coverage maintenance: ${error.message}`);
      maintenanceWindow = data?.[0] ?? null;
      if (!maintenanceWindow) return respond({ success: true, sync_mode: "historical_maintenance", maintained: false, completed_at: startedAt });
    }
    const historicalWindow = requestInput.mode === "historical_backfill"
      ? { created_from: requestInput.createdFrom, created_before: requestInput.createdBefore }
      : maintenanceWindow;
    const syncDays = historicalWindow
      ? Math.ceil(
          (Date.parse(historicalWindow.created_before) - Date.parse(historicalWindow.created_from)) /
            (24 * 60 * 60 * 1000),
        )
      : getSyncDays();
    const updatedSince = reconciliationBefore
      ? new Date(Date.parse(reconciliationBefore) - syncDays * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const orders = historicalWindow
      ? await fetchHistoricalShopifyOrders(
          historicalWindow.created_from,
          historicalWindow.created_before,
        )
      : await fetchRecentShopifyOrders(updatedSince as string, reconciliationBefore as string);
    let linesSynced = 0;

    for (const order of orders) {
      const result = await upsertShopifyOrder(supabase, order, {
        omitCustomerData: Boolean(historicalWindow),
      });
      linesSynced += result.linesSynced;
    }

    const completedAt = new Date().toISOString();
    const { data: syncRun, error: syncRunError } = await supabase
      .from("vault_shopify_order_sync_runs")
      .insert({
        sync_mode: historicalWindow
          ? "historical_orders_by_created_at"
          : "recent_orders_by_updated_at",
        sync_days: syncDays,
        orders_synced: orders.length,
        order_lines_synced: linesSynced,
        created_from: historicalWindow
          ? historicalWindow.created_from
          : null,
        created_before: historicalWindow
          ? historicalWindow.created_before
          : null,
        updated_from: requestInput.mode === "reconciliation" ? updatedSince : null,
        updated_before: reconciliationBefore,
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
      sync_mode: historicalWindow
        ? "historical_orders_by_created_at"
        : "recent_orders_by_updated_at",
      sync_days: syncDays,
      updated_since: updatedSince,
      updated_before: reconciliationBefore,
      created_from: historicalWindow
        ? historicalWindow.created_from
        : null,
      created_before: historicalWindow
        ? historicalWindow.created_before
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
