import { createClient } from "npm:@supabase/supabase-js@2";

import {
  fetchAllShopifyProducts,
  type ShopifyVariantNode,
} from "../_shared/shopify/products.ts";

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

    const products =
      await fetchAllShopifyProducts();

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

    return respond({
      success: true,
      sync_mode: "full_catalogue_without_inventory",
      products_synced: productsSynced,
      variants_synced: variantsSynced,
      inventory_sync: "pending_separate_worker",
      completed_at:
        new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "[Vault Shopify Product Sync]",
      error,
    );

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