import { createClient } from "npm:@supabase/supabase-js@2";

import {
  fetchAllShopifyProducts,
  type ShopifyVariantNode,
} from "../_shared/shopify/products.ts";
import {
  classifyCatalogueWrites,
  findStaleCanonicalVariantIds,
} from "../_shared/shopify/catalogue-reconciliation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getOption(
  selectedOptions: ShopifyVariantNode["selectedOptions"],
  index: number,
): string | null {
  return selectedOptions[index]?.value ?? null;
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

  let runContext: { supabase: ReturnType<typeof createClient>; id: string; startedAtMs: number } | null = null;

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

    let runInventoryAfterCatalogue = false;
    try {
      const body = await request.json();
      runInventoryAfterCatalogue = body?.runInventoryAfterCatalogue === true;
    } catch {
      // Empty manual requests remain catalogue-only.
    }

    const startedAt = new Date();
    const { data: run, error: runError } = await supabase
      .from("vault_shopify_catalogue_sync_runs")
      .insert({ sync_status: "syncing", sync_started_at: startedAt.toISOString(), shopify_api_success: null })
      .select("id")
      .single();
    if (runError) {
      if (runError.code === "23505") return respond({ success: false, sync_status: "syncing", error: "A catalogue synchronisation is already running" }, 409);
      throw runError;
    }
    runContext = { supabase, id: run.id, startedAtMs: startedAt.getTime() };

    const [{ data: existingProducts, error: existingProductsError }, { data: existingVariants, error: existingVariantsError }] = await Promise.all([
      supabase.from("vault_products").select("source_product_id").eq("source", "shopify"),
      supabase.from("vault_variants").select("id, source_variant_id, source_active").eq("source", "shopify"),
    ]);
    if (existingProductsError || existingVariantsError) throw existingProductsError ?? existingVariantsError;

    const products =
      await fetchAllShopifyProducts();

    const shopifyVariants = products.flatMap((product) => product.variants.nodes);
    const productWrites = classifyCatalogueWrites((existingProducts ?? []).map((product) => product.source_product_id), products.map((product) => product.id));
    const variantWrites = classifyCatalogueWrites((existingVariants ?? []).map((variant) => variant.source_variant_id), shopifyVariants.map((variant) => variant.id));

    let productsSynced = 0;
    let variantsSynced = 0;

    for (const product of products) {
      const {
        data: savedProduct,
        error: productError,
      } = await supabase
        .from("vault_products")
        .upsert(
          {
            source: "shopify",
            source_product_id: product.id,
            title: product.title,
            handle: product.handle,
            vendor: product.vendor || null,
            product_type:
              product.productType || null,
            status: product.status,
            featured_image_url:
              product.featuredImage?.url ?? null,
            shopify_updated_at:
              product.updatedAt,
            updated_at:
              new Date().toISOString(),
          },
          {
            onConflict:
              "source,source_product_id",
          },
        )
        .select("id")
        .single();

      if (productError || !savedProduct) {
        console.error(
          "[Vault Product Sync]",
          productError,
        );

        throw (
          productError ||
          new Error(
            `Unable to save product: ${product.title}`,
          )
        );
      }

      productsSynced += 1;

      for (const variant of product.variants.nodes) {
        const { error: variantError } =
          await supabase
            .from("vault_variants")
            .upsert(
              {
                product_id: savedProduct.id,
                source: "shopify",
                source_variant_id:
                  variant.id,
                source_inventory_item_id:
                  variant.inventoryItem?.id ??
                  null,
                title: variant.title,
                sku: variant.sku || null,
                barcode:
                  variant.barcode || null,
                option_1: getOption(
                  variant.selectedOptions,
                  0,
                ),
                option_2: getOption(
                  variant.selectedOptions,
                  1,
                ),
                option_3: getOption(
                  variant.selectedOptions,
                  2,
                ),
                price:
                  Number(variant.price || 0),
                compare_at_price:
                  variant.compareAtPrice === null
                    ? null
                    : Number(
                        variant.compareAtPrice,
                      ),
                available_for_sale:
                  variant.availableForSale,
                source_active: true,
                source_deleted_at: null,
                updated_at:
                  new Date().toISOString(),
              },
              {
                onConflict:
                  "source,source_variant_id",
              },
            );

        if (variantError) {
          console.error(
            "[Vault Variant Sync]",
            variantError,
          );

          throw variantError;
        }

        variantsSynced += 1;
      }
    }

    const staleVariantIds = findStaleCanonicalVariantIds(
      (existingVariants ?? []).filter((variant) => variant.source_active),
      shopifyVariants,
    );
    const reconciledAt = new Date().toISOString();
    for (let index = 0; index < staleVariantIds.length; index += 500) {
      const batch = staleVariantIds.slice(index, index + 500);
      const { error: retireError } = await supabase.from("vault_variants").update({ source_active: false, source_deleted_at: reconciledAt, available_for_sale: false }).in("id", batch);
      if (retireError) throw retireError;
      const { error: inventoryCleanupError } = await supabase.from("vault_inventory_levels").delete().in("variant_id", batch);
      if (inventoryCleanupError) throw inventoryCleanupError;
    }

    const completedAt = new Date();
    const { error: completionError } = await supabase.from("vault_shopify_catalogue_sync_runs").update({
      sync_status: "current", sync_completed_at: completedAt.toISOString(), sync_duration_ms: completedAt.getTime() - startedAt.getTime(),
      shopify_products_processed: products.length, shopify_variants_processed: shopifyVariants.length,
      products_created: productWrites.created, products_updated: productWrites.updated,
      variants_created: variantWrites.created, variants_updated: variantWrites.updated,
      stale_variants_reconciled: staleVariantIds.length, shopify_api_success: true,
      inventory_sync_requested: runInventoryAfterCatalogue, error_message: null,
    }).eq("id", run.id);
    if (completionError) throw completionError;

    let inventorySync: unknown = null;
    if (runInventoryAfterCatalogue) {
      const { data, error } = await supabase.functions.invoke("shopify-inventory-sync", { body: {} });
      if (error) {
        return respond({
          success: false,
          catalogue_sync: "current",
          error: `Catalogue sync completed, but inventory sync could not start: ${error.message}`,
        }, 502);
      }
      inventorySync = data;
    }

    return respond({
      success: true,
      sync_mode: runInventoryAfterCatalogue
        ? "full_catalogue_then_inventory"
        : "full_catalogue_without_inventory",
      products_synced: productsSynced,
      variants_synced: variantsSynced,
      products_created: productWrites.created,
      products_updated: productWrites.updated,
      variants_created: variantWrites.created,
      variants_updated: variantWrites.updated,
      stale_variants_reconciled: staleVariantIds.length,
      inventory_sync: runInventoryAfterCatalogue ? inventorySync : "not_requested",
      completed_at:
        new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "[Vault Shopify Product Sync]",
      error,
    );

    if (runContext) {
      const failedAt = new Date();
      await runContext.supabase.from("vault_shopify_catalogue_sync_runs").update({
        sync_status: "failed", sync_completed_at: failedAt.toISOString(),
        sync_duration_ms: failedAt.getTime() - runContext.startedAtMs,
        shopify_api_success: false,
        error_message: error instanceof Error ? error.message : "Unexpected product synchronisation error",
      }).eq("id", runContext.id);
    }

    return respond(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected product synchronisation error",
      },
      500,
    );
  }
});
