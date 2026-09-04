import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

import {
  fetchShopifyInventoryItems,
  type ShopifyInventoryQuantity,
} from "../_shared/shopify/inventory.ts";
import {
  findUnavailableInventoryVariantIds,
} from "../_shared/shopify/inventory-reconciliation.ts";
import { emitCommandCentreRefreshEvent } from "../_shared/command-centre-refresh.ts";

const SHOPIFY_BATCH_SIZE = 20;
const DATABASE_PAGE_SIZE = 200;
const DATABASE_WRITE_SIZE = 500;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type VaultVariant = {
  id: string;
  source_inventory_item_id: string;
  available_for_sale: boolean | null;
};

type PendingInventoryLevel = {
  variant_id: string;
  source_location_id: string;
  available_quantity: number;
  committed_quantity: number;
  incoming_quantity: number;
  on_hand_quantity: number;
  available_for_sale: boolean | null;
  inventory_tracked: boolean;
};

function respond(
  body: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(body, null, 2),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    },
  );
}

function getQuantity(
  quantities: ShopifyInventoryQuantity[],
  name: string,
): number {
  return (
    quantities.find(
      (item) => item.name === name,
    )?.quantity ?? 0
  );
}

function chunk<T>(
  items: T[],
  size: number,
): T[][] {
  const chunks: T[][] = [];

  for (
    let index = 0;
    index < items.length;
    index += size
  ) {
    chunks.push(
      items.slice(index, index + size),
    );
  }

  return chunks;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return respond(
      {
        success: false,
        error: "Method not allowed",
      },
      405,
    );
  }

  let runContext: {
    supabase: SupabaseClient;
    id: string;
    startedAtMs: number;
  } | null = null;

  try {
    const supabaseUrl =
      Deno.env.get("SUPABASE_URL");

    const serviceRoleKey =
      Deno.env.get("SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        "Required Supabase environment variables are unavailable",
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const startedAt = new Date();
    const { data: run, error: runError } = await supabase
      .from("vault_shopify_inventory_sync_runs")
      .insert({
        sync_status: "syncing",
        sync_started_at: startedAt.toISOString(),
        shopify_api_success: null,
      })
      .select("id")
      .single();

    if (runError) {
      if (runError.code === "23505") {
        return respond({
          success: false,
          sync_status: "syncing",
          error: "An inventory synchronisation is already running",
        }, 409);
      }
      throw runError;
    }

    runContext = {
      supabase,
      id: run.id,
      startedAtMs: startedAt.getTime(),
    };

    await emitCommandCentreRefreshEvent({
      supabase,
      domain: "inventory",
      eventType: "inventory-sync-started",
      entityId: run.id,
      source: "shopify-inventory-sync",
    });

    /*
     * Read every Shopify variant that has an
     * associated inventory-item ID.
     */
    const variants: VaultVariant[] = [];

    let databasePage = 0;

    while (true) {
      const from =
        databasePage * DATABASE_PAGE_SIZE;

      const to =
        from + DATABASE_PAGE_SIZE - 1;

      const {
        data,
        error,
      } = await supabase
        .from("vault_variants")
        .select(
          "id, source_inventory_item_id, available_for_sale",
        )
        .eq("source", "shopify")
        .eq("source_active", true)
        .not(
          "source_inventory_item_id",
          "is",
          null,
        )
        .range(from, to);

      if (error) {
        throw error;
      }

      const page =
        (data ?? []) as VaultVariant[];

      variants.push(...page);

      if (page.length < DATABASE_PAGE_SIZE) {
        break;
      }

      databasePage += 1;

      if (databasePage > 100) {
        throw new Error(
          "Variant database pagination exceeded its safety limit",
        );
      }
    }

    const variantByInventoryItemId =
      new Map<string, VaultVariant>();

    for (const variant of variants) {
      variantByInventoryItemId.set(
        variant.source_inventory_item_id,
        variant,
      );
    }

    const inventoryItemIds = Array.from(
      variantByInventoryItemId.keys(),
    );

    const locationNames =
      new Map<string, string>();

    const pendingLevels:
      PendingInventoryLevel[] = [];

    let shopifyBatchesFetched = 0;
    let inventoryItemsFetched = 0;
    const returnedInventoryItems: Array<{
      id: string;
    }> = [];

    for (
      const idBatch of chunk(
        inventoryItemIds,
        SHOPIFY_BATCH_SIZE,
      )
    ) {
      const inventoryItems =
        await fetchShopifyInventoryItems(
          idBatch,
        );

      shopifyBatchesFetched += 1;
      inventoryItemsFetched +=
        inventoryItems.length;

      for (
        const inventoryItem of inventoryItems
      ) {
        returnedInventoryItems.push({
          id: inventoryItem.id,
        });

        const variant =
          variantByInventoryItemId.get(
            inventoryItem.id,
          );

        if (!variant) {
          continue;
        }

        for (
          const level of
            inventoryItem.inventoryLevels.nodes
        ) {
          locationNames.set(
            level.location.id,
            level.location.name,
          );

          pendingLevels.push({
            variant_id: variant.id,
            source_location_id:
              level.location.id,
            available_quantity:
              getQuantity(
                level.quantities,
                "available",
              ),
            committed_quantity:
              getQuantity(
                level.quantities,
                "committed",
              ),
            incoming_quantity:
              getQuantity(
                level.quantities,
                "incoming",
              ),
            on_hand_quantity:
              getQuantity(
                level.quantities,
                "on_hand",
              ),
            available_for_sale:
              variant.available_for_sale,
            inventory_tracked:
              inventoryItem.tracked,
          });
        }
      }
    }

    /*
     * Save each unique Shopify location.
     */
    const locationRows =
      Array.from(
        locationNames.entries(),
      ).map(
        ([
          sourceLocationId,
          name,
        ]) => ({
          source: "shopify",
          source_location_id:
            sourceLocationId,
          name,
          active: true,
          updated_at:
            new Date().toISOString(),
        }),
      );

    if (locationRows.length > 0) {
      const { error: locationError } =
        await supabase
          .from("vault_locations")
          .upsert(locationRows, {
            onConflict:
              "source,source_location_id",
          });

      if (locationError) {
        throw locationError;
      }
    }

    /*
     * Retrieve local UUIDs for those locations.
     */
    const {
      data: savedLocations,
      error: savedLocationsError,
    } = await supabase
      .from("vault_locations")
      .select(
        "id, source_location_id",
      )
      .eq("source", "shopify");

    if (savedLocationsError) {
      throw savedLocationsError;
    }

    const locationIdMap =
      new Map<string, string>();

    for (
      const location of
        savedLocations ?? []
    ) {
      locationIdMap.set(
        location.source_location_id,
        location.id,
      );
    }

    const syncedAt =
      new Date().toISOString();

    const inventoryRows =
      pendingLevels.map((level) => {
        const locationId =
          locationIdMap.get(
            level.source_location_id,
          );

        if (!locationId) {
          throw new Error(
            `No Vault location found for ${level.source_location_id}`,
          );
        }

        return {
          variant_id:
            level.variant_id,
          location_id:
            locationId,
          available_quantity:
            level.available_quantity,
          committed_quantity:
            level.committed_quantity,
          incoming_quantity:
            level.incoming_quantity,
          on_hand_quantity:
            level.on_hand_quantity,
          synced_at: syncedAt,
        };
      });

    const snapshotRows = inventoryRows.map((row) => {
      const observation = pendingLevels.find((level) =>
        level.variant_id === row.variant_id &&
        locationIdMap.get(level.source_location_id) === row.location_id
      );
      if (!observation) throw new Error(`Inventory observation unavailable for ${row.variant_id}`);
      return {
        inventory_sync_run_id: run.id,
        variant_id: row.variant_id,
        location_id: row.location_id,
        observed_at: syncedAt,
        available: row.available_quantity,
        committed: row.committed_quantity,
        incoming: row.incoming_quantity,
        on_hand: row.on_hand_quantity,
        available_for_sale: observation.available_for_sale,
        inventory_tracked: observation.inventory_tracked,
      };
    });

    /*
     * Save inventory in bulk rather than one
     * database request per variant.
     */
    for (
      const rowBatch of chunk(
        inventoryRows,
        DATABASE_WRITE_SIZE,
      )
    ) {
      const { error: inventoryError } =
        await supabase
          .from(
            "vault_inventory_levels",
          )
          .upsert(rowBatch, {
            onConflict:
              "variant_id,location_id",
          });

      if (inventoryError) {
        throw inventoryError;
      }
    }

    /*
     * Persist only quantity transitions plus one Europe/London daily baseline.
     * The database function serialises overlapping writers and remains
     * idempotent for retries. Current inventory and sync freshness are still
     * updated on every successful Shopify refresh above.
     */
    let historyRowsInserted = 0;
    for (const snapshotBatch of chunk(snapshotRows, DATABASE_WRITE_SIZE)) {
      const { data: inserted, error: snapshotError } = await supabase.rpc(
        "record_inventory_level_history",
        {
          target_sync_run_id: run.id,
          target_observed_at: syncedAt,
          observations: snapshotBatch,
        },
      );

      if (snapshotError) throw snapshotError;
      historyRowsInserted += Number(inserted ?? 0);
    }

    /*
     * Shopify returns null for inventory-item IDs that no longer exist. Those
     * exact mappings cannot be treated as freshly synchronized, and their old
     * inventory rows must not keep presenting stale stock as current canonical
     * inventory. Reconcile only IDs included in this successful fetch; product
     * titles, option names and SKUs are deliberately not involved.
     */
    const orphanedVariantIds =
      findUnavailableInventoryVariantIds(
        variants,
        returnedInventoryItems,
      );

    for (
      const variantIdBatch of chunk(
        orphanedVariantIds,
        DATABASE_WRITE_SIZE,
      )
    ) {
      const { error: orphanCleanupError } =
        await supabase
          .from("vault_inventory_levels")
          .delete()
          .in("variant_id", variantIdBatch);

      if (orphanCleanupError) {
        throw orphanCleanupError;
      }
    }

    const completedAt = new Date();
    const productsUpdated = new Set(
      inventoryRows.map((row) => row.variant_id),
    ).size;
    const syncDurationMs = completedAt.getTime() - startedAt.getTime();
    const { error: completionError } = await supabase
      .from("vault_shopify_inventory_sync_runs")
      .update({
        sync_status: "current",
        sync_completed_at: completedAt.toISOString(),
        sync_duration_ms: syncDurationMs,
        products_processed: variants.length,
        products_updated: productsUpdated,
        shopify_api_success: true,
        error_message: null,
      })
      .eq("id", run.id);

    if (completionError) throw completionError;

    await emitCommandCentreRefreshEvent({
      supabase,
      domain: "inventory",
      eventType: "inventory-sync-completed",
      entityId: run.id,
      source: "shopify-inventory-sync",
    });

    return respond({
      success: true,
      sync_mode:
        "full_inventory",
      variants_examined:
        variants.length,
      inventory_items_requested:
        inventoryItemIds.length,
      inventory_items_fetched:
        inventoryItemsFetched,
      shopify_batches_fetched:
        shopifyBatchesFetched,
      locations_synced:
        locationNames.size,
      inventory_levels_synced:
        inventoryRows.length,
      inventory_history_rows_inserted:
        historyRowsInserted,
      inventory_mappings_unavailable:
        orphanedVariantIds.length,
      sync_status: "current",
      sync_duration_ms: syncDurationMs,
      products_processed: variants.length,
      products_updated: productsUpdated,
      completed_at: completedAt.toISOString(),
    });
  } catch (error) {
    console.error(
      "[Vault Shopify Inventory Sync]",
      error,
    );

    if (runContext) {
      const completedAt = new Date();
      const { error: failureUpdateError } = await runContext.supabase
        .from("vault_shopify_inventory_sync_runs")
        .update({
          sync_status: "failed",
          sync_completed_at: completedAt.toISOString(),
          sync_duration_ms: completedAt.getTime() - runContext.startedAtMs,
          shopify_api_success: false,
          error_message: error instanceof Error
            ? error.message
            : "Unexpected inventory synchronisation error",
        })
        .eq("id", runContext.id);

      if (!failureUpdateError) {
        await emitCommandCentreRefreshEvent({
          supabase: runContext.supabase,
          domain: "inventory",
          eventType: "inventory-sync-failed",
          entityId: runContext.id,
          source: "shopify-inventory-sync",
        });
      }
    }

    return respond(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected inventory synchronisation error",
      },
      500,
    );
  }
});
