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
  source_variant_id: string | null;
  product_id: string | null;
  model_design: string | null;
  normalized_size: string | null;
  identity_resolution_status: string;
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

const COLLECTOR_VERSION = "phase1b7e";

function londonEvidenceDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

function canonicalMembership(variant: VaultVariant) {
  const modelDesign = variant.model_design?.trim() || null;
  const normalizedSize = variant.normalized_size?.trim() || null;
  const resolved = variant.identity_resolution_status === "resolved" && variant.product_id && modelDesign && normalizedSize;
  return {
    parent_product_id: resolved ? variant.product_id : null,
    model_design: resolved ? modelDesign : null,
    normalized_size: resolved ? normalizedSize : null,
    canonical_style_id: resolved ? `${variant.product_id}::${modelDesign}` : null,
    canonical_mapping_status: resolved ? "resolved" : "unresolved_or_incomplete",
  };
}

async function updateGovernanceRun(supabase: SupabaseClient, runId: string, values: Record<string, unknown>) {
  const { error } = await supabase.from("vault_inventory_observation_governance_runs").update({ ...values, updated_at: new Date().toISOString() }).eq("inventory_sync_run_id", runId);
  if (error) throw error;
}

async function recordGovernanceExceptions(supabase: SupabaseClient, runId: string, variants: VaultVariant[], stage: "duplicate_inventory_item_mapping" | "shopify_not_returned" | "current_inventory_write_failed" | "history_write_failed") {
  if (!variants.length) return;
  const rows = variants.map((variant) => ({ inventory_sync_run_id: runId, variant_id: variant.id, shopify_inventory_item_id: variant.source_inventory_item_id, exception_stage: stage }));
  const { error } = await supabase.from("vault_inventory_observation_run_exceptions").upsert(rows, { onConflict: "inventory_sync_run_id,variant_id,shopify_inventory_item_id,exception_stage", ignoreDuplicates: true });
  if (error) throw error;
}

async function recordDailyMemberAttestations(supabase: SupabaseClient, runId: string, evidenceDate: string, selectedAt: Date, variants: VaultVariant[], returnedInventoryItemIds: Set<string>, processedVariantIds: Set<string>, inventoryRows: PendingInventoryLevel[]) {
  const rows = variants
    .filter((variant) => returnedInventoryItemIds.has(variant.source_inventory_item_id) && processedVariantIds.has(variant.id))
    .map((variant) => ({
      evidence_date: evidenceDate,
      attesting_inventory_sync_run_id: runId,
      variant_id: variant.id,
      shopify_variant_id: variant.source_variant_id,
      shopify_inventory_item_id: variant.source_inventory_item_id,
      ...canonicalMembership(variant),
      observed_inventory_level_count: inventoryRows.filter((row) => row.variant_id === variant.id).length,
      observed_location_count: new Set(inventoryRows.filter((row) => row.variant_id === variant.id).map((row) => row.source_location_id)).size,
      attested_at: selectedAt.toISOString(),
    }));
  if (!rows.length) return;
  const { error } = await supabase
    .from("vault_inventory_observation_daily_member_attestations")
    .upsert(rows, {
      onConflict: "evidence_date,variant_id,shopify_inventory_item_id,parent_product_id,model_design,normalized_size,canonical_style_id,canonical_mapping_status",
      ignoreDuplicates: true,
    });
  if (error) throw error;
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
    selectionKnown: boolean;
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
      selectionKnown: false,
    };

    const { error: governanceRunError } = await supabase
      .from("vault_inventory_observation_governance_runs")
      .insert({ inventory_sync_run_id: run.id, collector_version: COLLECTOR_VERSION });
    if (governanceRunError) throw governanceRunError;

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
          "id, source_inventory_item_id, source_variant_id, product_id, model_design, normalized_size, identity_resolution_status, available_for_sale",
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

    const variantsByInventoryItemId = new Map<string, VaultVariant[]>();

    for (const variant of variants) {
      const mapped = variantsByInventoryItemId.get(variant.source_inventory_item_id) ?? [];
      mapped.push(variant);
      variantsByInventoryItemId.set(variant.source_inventory_item_id, mapped);
    }

    const duplicateInventoryItemIds = new Set(
      Array.from(variantsByInventoryItemId.entries())
        .filter(([, mapped]) => mapped.length > 1)
        .map(([inventoryItemId]) => inventoryItemId),
    );
    const duplicateMappingVariants = variants.filter((variant) =>
      duplicateInventoryItemIds.has(variant.source_inventory_item_id)
    );
    const processableVariants = variants.filter((variant) =>
      !duplicateInventoryItemIds.has(variant.source_inventory_item_id)
    );
    const variantByInventoryItemId = new Map(
      processableVariants.map((variant) => [variant.source_inventory_item_id, variant]),
    );
    const inventoryItemIds = Array.from(
      variantsByInventoryItemId.keys(),
    );

    const selectionRecordedAt = new Date();
    const evidenceDate = londonEvidenceDate(selectionRecordedAt);
    const expectedMemberRows = variants.map((variant) => ({
      evidence_date: evidenceDate,
      first_selected_inventory_sync_run_id: run.id,
      variant_id: variant.id,
      shopify_variant_id: variant.source_variant_id,
      shopify_inventory_item_id: variant.source_inventory_item_id,
      ...canonicalMembership(variant),
      collector_eligibility_basis: "shopify_active_variant_with_inventory_item",
      selected_at: selectionRecordedAt.toISOString(),
    }));
    if (expectedMemberRows.length) {
      const { error: expectedMemberError } = await supabase
        .from("vault_inventory_observation_daily_expected_members")
        .upsert(expectedMemberRows, {
          onConflict: "evidence_date,variant_id,shopify_inventory_item_id,parent_product_id,model_design,normalized_size,canonical_style_id,canonical_mapping_status",
          ignoreDuplicates: true,
        });
      if (expectedMemberError) throw expectedMemberError;
    }
    await updateGovernanceRun(supabase, run.id, {
      expected_population_known: true,
      expected_variant_count: variants.length,
      requested_inventory_item_count: inventoryItemIds.length,
      selection_recorded_at: selectionRecordedAt.toISOString(),
    });
    await recordGovernanceExceptions(
      supabase,
      run.id,
      duplicateMappingVariants,
      "duplicate_inventory_item_mapping",
    );
    runContext.selectionKnown = true;

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

    const orphanedVariantIds =
      findUnavailableInventoryVariantIds(
        variants,
        returnedInventoryItems,
      );
    const orphanedVariants = variants.filter((variant) => orphanedVariantIds.includes(variant.id));
    await recordGovernanceExceptions(supabase, run.id, orphanedVariants, "shopify_not_returned");
    await updateGovernanceRun(supabase, run.id, {
      returned_inventory_item_count: inventoryItemsFetched,
      processed_variant_count: new Set(inventoryRows.map((row) => row.variant_id)).size,
      observed_location_count: locationNames.size,
      reconciliation_state: orphanedVariantIds.length || duplicateMappingVariants.length ? "unreconciled" : "reconciled",
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
        const batchVariants = rowBatch.map((row) => variants.find((variant) => variant.id === row.variant_id)).filter((variant): variant is VaultVariant => Boolean(variant));
        await recordGovernanceExceptions(supabase, run.id, batchVariants, "current_inventory_write_failed");
        throw inventoryError;
      }
    }
    await updateGovernanceRun(supabase, run.id, { current_inventory_write_completed: true });

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

      if (snapshotError) {
        const batchVariants = snapshotBatch.map((row) => variants.find((variant) => variant.id === row.variant_id)).filter((variant): variant is VaultVariant => Boolean(variant));
        await recordGovernanceExceptions(supabase, run.id, batchVariants, "history_write_failed");
        if (snapshotError) throw snapshotError;
      }
      historyRowsInserted += Number(inserted ?? 0);
    }

    await updateGovernanceRun(supabase, run.id, { history_write_completed: true });

    /*
     * Shopify returns null for inventory-item IDs that no longer exist. Those
     * exact mappings cannot be treated as freshly synchronized, and their old
     * inventory rows must not keep presenting stale stock as current canonical
     * inventory. Reconcile only IDs included in this successful fetch; product
     * titles, option names and SKUs are deliberately not involved.
     */
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

    await updateGovernanceRun(supabase, run.id, {
      daily_baseline_completion_recorded:
        orphanedVariantIds.length === 0 && duplicateMappingVariants.length === 0,
      terminal_run_status: "current",
      completed_at: completedAt.toISOString(),
    });

    await recordDailyMemberAttestations(
      supabase,
      run.id,
      evidenceDate,
      completedAt,
      processableVariants,
      new Set(returnedInventoryItems.map((item) => item.id)),
      new Set(inventoryRows.map((row) => row.variant_id)),
      pendingLevels,
    );

    try {
      await emitCommandCentreRefreshEvent({
        supabase,
        domain: "inventory",
        eventType: "inventory-sync-completed",
        entityId: run.id,
        source: "shopify-inventory-sync",
      });
    } catch (eventError) {
      console.error("[Vault Shopify Inventory Sync] Completion event failed", eventError);
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
      try {
        await updateGovernanceRun(runContext.supabase, runContext.id, {
          daily_baseline_completion_recorded: false,
          terminal_run_status: "failed",
          completed_at: completedAt.toISOString(),
        });
      } catch (governanceError) {
        console.error("[Vault Shopify Inventory Sync] Governance failure capture failed", governanceError);
      }
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
