export const INVENTORY_FRESHNESS_THRESHOLD_MS = 30 * 60 * 1000;

export type InventorySyncStatus = "syncing" | "current" | "delayed" | "failed";

export type InventoryFreshness = {
  lastInventorySync: string | null;
  syncStatus: InventorySyncStatus;
  syncDuration: number | null;
  productsProcessed: number | null;
  productsUpdated: number | null;
  syncStartedAt: string | null;
  syncCompletedAt: string | null;
  nextScheduledSync: string | null;
  inventorySource: "shopify";
  shopifyApiSuccess: boolean | null;
  errors: string[];
};

export type InventorySyncRun = {
  sync_status: InventorySyncStatus;
  sync_started_at: string;
  sync_completed_at: string | null;
};

export function deriveInventorySyncStatus({
  latestRun,
  latestSuccessfulRun,
  now,
}: {
  latestRun: InventorySyncRun | null;
  latestSuccessfulRun: InventorySyncRun | null;
  now: Date;
}): InventorySyncStatus {
  if (latestRun?.sync_status === "syncing") return "syncing";
  if (latestRun?.sync_status === "failed") return "failed";
  if (!latestSuccessfulRun?.sync_completed_at) return "delayed";
  return now.getTime() - Date.parse(latestSuccessfulRun.sync_completed_at) > INVENTORY_FRESHNESS_THRESHOLD_MS
    ? "delayed"
    : "current";
}
