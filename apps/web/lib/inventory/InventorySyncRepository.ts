import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  deriveInventorySyncStatus,
  type InventoryFreshness,
  type InventorySyncStatus,
} from "@/lib/inventory/InventoryFreshness";

export type { InventoryFreshness } from "@/lib/inventory/InventoryFreshness";

type InventorySyncRunRow = {
  sync_status: InventorySyncStatus;
  sync_started_at: string;
  sync_completed_at: string | null;
  sync_duration_ms: number | string | null;
  products_processed: number | null;
  products_updated: number | null;
  shopify_api_success: boolean | null;
  error_message: string | null;
};

function nullableNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Inventory sync contains an invalid duration");
  return parsed;
}

export const InventorySyncRepository = {
  async getFreshness(now = new Date()): Promise<InventoryFreshness> {
    const select = `
      sync_status,
      sync_started_at,
      sync_completed_at,
      sync_duration_ms,
      products_processed,
      products_updated,
      shopify_api_success,
      error_message
    `;
    const [latestResult, successfulResult] = await Promise.all([
      supabaseAdmin.from("vault_shopify_inventory_sync_runs")
        .select(select)
        .order("sync_started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin.from("vault_shopify_inventory_sync_runs")
        .select(select)
        .eq("sync_status", "current")
        .order("sync_completed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (latestResult.error) throw new Error(`Unable to read inventory sync status: ${latestResult.error.message}`);
    if (successfulResult.error) throw new Error(`Unable to read successful inventory sync: ${successfulResult.error.message}`);

    const latestRun = latestResult.data as InventorySyncRunRow | null;
    const latestSuccessfulRun = successfulResult.data as InventorySyncRunRow | null;
    const diagnosticRun = latestRun ?? latestSuccessfulRun;

    return {
      lastInventorySync: latestSuccessfulRun?.sync_completed_at ?? null,
      syncStatus: deriveInventorySyncStatus({ latestRun, latestSuccessfulRun, now }),
      syncDuration: nullableNumber(diagnosticRun?.sync_duration_ms ?? null),
      productsProcessed: diagnosticRun?.products_processed ?? null,
      productsUpdated: diagnosticRun?.products_updated ?? null,
      syncStartedAt: diagnosticRun?.sync_started_at ?? null,
      syncCompletedAt: diagnosticRun?.sync_completed_at ?? null,
      nextScheduledSync: null,
      inventorySource: "shopify",
      shopifyApiSuccess: diagnosticRun?.shopify_api_success ?? null,
      errors: diagnosticRun?.error_message ? [diagnosticRun.error_message] : [],
    };
  },
} as const;
