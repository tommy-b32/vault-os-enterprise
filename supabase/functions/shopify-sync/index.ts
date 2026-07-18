import { createClient } from "npm:@supabase/supabase-js@2";

const API_VERSION = "2026-07";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ShopifyQuantity = {
  name: string;
  quantity: number;
};

type ShopifyInventoryLevel = {
  location: {
    id: string;
    name: string;
  };
  quantities: ShopifyQuantity[];
};

type ShopifyVariant = {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  compareAtPrice: string | null;
  availableForSale: boolean;
  selectedOptions: Array<{
    name: string;
    value: string;
  }>;
  inventoryItem: {
    id: string;
    inventoryLevels: {
      nodes: ShopifyInventoryLevel[];
    };
  } | null;
};

type ShopifyProduct = {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  status: string;
  updatedAt: string;
  featuredImage: {
    url: string;
  } | null;
  variants: {
    nodes: ShopifyVariant[];
  };
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

function cleanStoreDomain(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

function getQuantity(
  quantities: ShopifyQuantity[],
  name: string,
): number {
  return (
    quantities.find((item) => item.name === name)?.quantity ?? 0
  );
}

function getOption(
  selectedOptions: ShopifyVariant["selectedOptions"],
  index: number,
): string | null {
  return selectedOptions[index]?.value ?? null;
}

async function getShopifyAccessToken(
  storeDomain: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(
    `https://${storeDomain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    },
  );

  const payload = await response.json();

  if (!response.ok || !payload.access_token) {
    console.error("[Vault Shopify Authentication]", payload);

    throw new Error(
      payload?.error_description ||
        payload?.error ||
        "Shopify authentication failed",
    );
  }

  return payload.access_token;
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
    const clientId = Deno.env.get("SHOPIFY_CLIENT_ID");
    const clientSecret = Deno.env.get(
      "SHOPIFY_CLIENT_SECRET",
    );
    const storeDomainValue = Deno.env.get(
      "SHOPIFY_STORE_DOMAIN",
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");

    if (
      !clientId ||
      !clientSecret ||
      !storeDomainValue ||
      !supabaseUrl ||
      !serviceRoleKey
    ) {
      throw new Error(
        "One or more required environment variables are unavailable",
      );
    }

    const storeDomain = cleanStoreDomain(storeDomainValue);

    if (!storeDomain.endsWith(".myshopify.com")) {
      throw new Error(
        "SHOPIFY_STORE_DOMAIN must end with .myshopify.com",
      );
    }

    const accessToken = await getShopifyAccessToken(
      storeDomain,
      clientId,
      clientSecret,
    );

    const query = `
      query VaultCatalogueSync {
        products(first: 10, sortKey: UPDATED_AT, reverse: true) {
          nodes {
            id
            title
            handle
            vendor
            productType
            status
            updatedAt

            featuredImage {
              url
            }

            variants(first: 100) {
              nodes {
                id
                title
                sku
                barcode
                price
                compareAtPrice
                availableForSale

                selectedOptions {
                  name
                  value
                }

                inventoryItem {
                  id

                  inventoryLevels(first: 50) {
                    nodes {
                      location {
                        id
                        name
                      }

                      quantities(
                        names: [
                          "available"
                          "committed"
                          "incoming"
                          "on_hand"
                        ]
                      ) {
                        name
                        quantity
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const shopifyResponse = await fetch(
      `https://${storeDomain}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query }),
      },
    );

    const shopifyPayload = await shopifyResponse.json();

    if (!shopifyResponse.ok) {
      console.error("[Vault Shopify API]", shopifyPayload);
      throw new Error("Shopify Admin API request failed");
    }

    if (shopifyPayload.errors) {
      console.error(
        "[Vault Shopify GraphQL]",
        shopifyPayload.errors,
      );

      throw new Error(
        shopifyPayload.errors
          .map(
            (item: { message?: string }) =>
              item.message || "GraphQL error",
          )
          .join("; "),
      );
    }

    const products =
      shopifyPayload.data.products.nodes as ShopifyProduct[];

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

    let productsSynced = 0;
    let variantsSynced = 0;
    let locationsSynced = 0;
    let inventoryLevelsSynced = 0;

    const syncedLocationIds = new Set<string>();

    for (const product of products) {
      const { data: savedProduct, error: productError } =
        await supabase
          .from("vault_products")
          .upsert(
            {
              source: "shopify",
              source_product_id: product.id,
              title: product.title,
              handle: product.handle,
              vendor: product.vendor || null,
              product_type: product.productType || null,
              status: product.status,
              featured_image_url:
                product.featuredImage?.url ?? null,
              shopify_updated_at: product.updatedAt,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: "source,source_product_id",
            },
          )
          .select("id")
          .single();

      if (productError || !savedProduct) {
        throw productError ||
          new Error("Product could not be saved");
      }

      productsSynced += 1;

      for (const variant of product.variants.nodes) {
        const { data: savedVariant, error: variantError } =
          await supabase
            .from("vault_variants")
            .upsert(
              {
                product_id: savedProduct.id,
                source: "shopify",
                source_variant_id: variant.id,
                source_inventory_item_id:
                  variant.inventoryItem?.id ?? null,
                title: variant.title,
                sku: variant.sku || null,
                barcode: variant.barcode || null,
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
                price: Number(variant.price || 0),
                compare_at_price:
                  variant.compareAtPrice === null
                    ? null
                    : Number(variant.compareAtPrice),
                available_for_sale:
                  variant.availableForSale,
                updated_at: new Date().toISOString(),
              },
              {
                onConflict: "source,source_variant_id",
              },
            )
            .select("id")
            .single();

        if (variantError || !savedVariant) {
          throw variantError ||
            new Error("Variant could not be saved");
        }

        variantsSynced += 1;

        const inventoryLevels =
          variant.inventoryItem?.inventoryLevels.nodes ?? [];

        for (const level of inventoryLevels) {
          const { data: savedLocation, error: locationError } =
            await supabase
              .from("vault_locations")
              .upsert(
                {
                  source: "shopify",
                  source_location_id: level.location.id,
                  name: level.location.name,
                  active: true,
                  updated_at: new Date().toISOString(),
                },
                {
                  onConflict: "source,source_location_id",
                },
              )
              .select("id")
              .single();

          if (locationError || !savedLocation) {
            throw locationError ||
              new Error("Location could not be saved");
          }

          if (!syncedLocationIds.has(level.location.id)) {
            syncedLocationIds.add(level.location.id);
            locationsSynced += 1;
          }

          const { error: inventoryError } = await supabase
            .from("vault_inventory_levels")
            .upsert(
              {
                variant_id: savedVariant.id,
                location_id: savedLocation.id,
                available_quantity: getQuantity(
                  level.quantities,
                  "available",
                ),
                committed_quantity: getQuantity(
                  level.quantities,
                  "committed",
                ),
                incoming_quantity: getQuantity(
                  level.quantities,
                  "incoming",
                ),
                on_hand_quantity: getQuantity(
                  level.quantities,
                  "on_hand",
                ),
                synced_at: new Date().toISOString(),
              },
              {
                onConflict: "variant_id,location_id",
              },
            );

          if (inventoryError) {
            throw inventoryError;
          }

          inventoryLevelsSynced += 1;
        }
      }
    }

    return respond({
      success: true,
      sync_mode: "first_10_products",
      products_synced: productsSynced,
      variants_synced: variantsSynced,
      locations_synced: locationsSynced,
      inventory_levels_synced: inventoryLevelsSynced,
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Vault Shopify Sync]", error);

    return respond(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected Shopify synchronisation error",
      },
      500,
    );
  }
});