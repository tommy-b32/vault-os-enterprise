import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const [products, sync, migration] = await Promise.all([
  readFile(new URL("supabase/functions/_shared/shopify/products.ts", root), "utf8"),
  readFile(new URL("supabase/functions/shopify-sync/index.ts", root), "utf8"),
  readFile(new URL("supabase/migrations/20260917000000_shopify_variant_images.sql", root), "utf8"),
]);

test("Shopify product sync requests parent and exact variant image URLs in its existing query", () => {
  assert.match(products, /featuredImage\s*\{\s*url\s*\}/);
  assert.match(products, /variants\(first: 250\)[\s\S]*?nodes\s*\{[\s\S]*?image\s*\{\s*url\s*\}/);
  assert.match(products, /image\?:\s*\{\s*url\?: string \| null;/);
  assert.equal((products.match(/query VaultProductSync/g) ?? []).length, 1);
});

test("variant image persistence is exact, nullable metadata on the existing source-variant upsert", () => {
  assert.match(migration, /add column if not exists shopify_image_url text null/i);
  const variantUpsert = sync.slice(sync.indexOf('from("vault_variants")', sync.indexOf("for (const variant")));
  assert.match(variantUpsert, /shopify_image_url:\s*variant\.image\?\.url \?\? null/);
  assert.match(variantUpsert, /onConflict:\s*"source,source_variant_id"/);
  for (const field of ["model_design: identity.modelDesign", "normalized_size: identity.normalizedSize", "identity_resolution_status: identity.resolution", "source_variant_id:", "source_inventory_item_id:"]) {
    assert.ok(variantUpsert.includes(field), `existing field retained: ${field}`);
  }
  assert.doesNotMatch(variantUpsert, /featuredImage|featured_image_url/);
});

test("image values remain isolated by exact Shopify variant ID, including nulls", () => {
  const persist = (variant) => ({
    source: "shopify",
    source_variant_id: variant.id,
    shopify_image_url: variant.image?.url ?? null,
  });
  const blackLarge = persist({ id: "gid://shopify/ProductVariant/1", image: { url: "https://example.com/black-large.jpg" } });
  const blackMedium = persist({ id: "gid://shopify/ProductVariant/2", image: null });
  const blackSmall = persist({ id: "gid://shopify/ProductVariant/3", image: { url: "https://example.com/black-small.jpg" } });
  assert.deepEqual(blackLarge, { source: "shopify", source_variant_id: "gid://shopify/ProductVariant/1", shopify_image_url: "https://example.com/black-large.jpg" });
  assert.equal(blackMedium.shopify_image_url, null);
  assert.notEqual(blackLarge.shopify_image_url, blackSmall.shopify_image_url);
  assert.notEqual(blackLarge.source_variant_id, blackSmall.source_variant_id);
});
