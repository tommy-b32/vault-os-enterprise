import { createClient } from "npm:@supabase/supabase-js@2";

import {
  fetchShopifyInventoryItems,
  type ShopifyInventoryQuantity,
} from "../_shared/shopify/inventory.ts";

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
};

type PendingInventoryLevel = {
  variant_id: string;
  source_location_id: string;
  available_quantity: number;
  committed_quantity: number;
  incoming_quantity: number;
  on_hand_quantity: number;
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
          "id, source_inventory_item_id",
        )
        .eq("source", "shopify")
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
      completed_at:
        new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "[Vault Shopify Inventory Sync]",
      error,
    );

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