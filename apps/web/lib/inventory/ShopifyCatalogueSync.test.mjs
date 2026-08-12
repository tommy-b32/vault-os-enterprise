import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  classifyCatalogueWrites,
  findStaleCanonicalVariantIds,
} from "../../../../supabase/functions/_shared/shopify/catalogue-reconciliation.ts";

const repositoryRoot = new URL("../../../../", import.meta.url);
const readRepositoryFile = (path) => readFile(new URL(path, repositoryRoot), "utf8");

test("new parents and variants are classified without changing canonical identities", () => {
  assert.deepEqual(classifyCatalogueWrites(["product-1"], ["product-1", "product-2"]), {
    created: 1,
    updated: 1,
  });
  assert.deepEqual(classifyCatalogueWrites(["variant-1"], ["variant-1", "variant-2"]), {
    created: 1,
    updated: 1,
  });
});

test("repeat catalogue discovery is idempotently classified as updates", () => {
  assert.deepEqual(classifyCatalogueWrites(["product-1"], ["product-1"]), {
    created: 0,
    updated: 1,
  });
  assert.deepEqual(classifyCatalogueWrites(["variant-1"], ["variant-1"]), {
    created: 0,
    updated: 1,
  });
});

test("stale reconciliation selects only canonical variants absent from Shopify", () => {
  assert.deepEqual(findStaleCanonicalVariantIds([
    { id: "canonical-current", source_variant_id: "shopify-current" },
    { id: "canonical-stale", source_variant_id: "shopify-stale" },
  ], [
    { id: "shopify-current" },
  ]), ["canonical-stale"]);
});

test("stale reconciliation cannot run from a truncated Shopify variant connection", async () => {
  const products = await readRepositoryFile("supabase/functions/_shared/shopify/products.ts");

  assert.match(products, /variants\(first: 250\)/);
  assert.match(products, /product\.variants\.pageInfo\.hasNextPage/);
  assert.match(products, /catalogue reconciliation was not applied/);
});

test("catalogue reconciliation tombstones stale variants and preserves historical rows", async () => {
  const [sync, migration] = await Promise.all([
    readRepositoryFile("supabase/functions/shopify-sync/index.ts"),
    readRepositoryFile("supabase/migrations/20260818000000_shopify_catalogue_reconciliation.sql"),
  ]);

  assert.match(sync, /source_active:\s*false/);
  assert.match(sync, /source_deleted_at:\s*reconciledAt/);
  assert.match(sync, /from\("vault_inventory_levels"\)\.delete\(\)\.in\("variant_id", batch\)/);
  assert.doesNotMatch(sync, /from\("vault_variants"\)\.delete\(\)/);
  assert.match(migration, /source_active boolean not null default true/);
  assert.match(migration, /where p\.source = 'shopify'[\s\S]*v\.source_active = true/);
});

test("scheduled catalogue completion precedes inventory reconciliation without overlap", async () => {
  const [sync, migration, inventory] = await Promise.all([
    readRepositoryFile("supabase/functions/shopify-sync/index.ts"),
    readRepositoryFile("supabase/migrations/20260818000000_shopify_catalogue_reconciliation.sql"),
    readRepositoryFile("supabase/functions/shopify-inventory-sync/index.ts"),
  ]);

  const catalogueCompletion = sync.indexOf("sync_status: \"current\"");
  const inventoryInvocation = sync.indexOf('functions.invoke("shopify-inventory-sync"');
  assert.ok(catalogueCompletion > 0 && inventoryInvocation > catalogueCompletion);
  assert.match(migration, /unique index[\s\S]*where sync_status = 'syncing'/);
  assert.match(migration, /'vault-shopify-catalogue-sync',[\s\S]*'\*\/10 \* \* \* \*'/);
  assert.match(migration, /runInventoryAfterCatalogue/);
  assert.match(inventory, /\.eq\("source_active", true\)/);
});

test("catalogue diagnostics record successful and failed runs", async () => {
  const [sync, migration] = await Promise.all([
    readRepositoryFile("supabase/functions/shopify-sync/index.ts"),
    readRepositoryFile("supabase/migrations/20260818000000_shopify_catalogue_reconciliation.sql"),
  ]);

  for (const field of [
    "sync_started_at", "sync_completed_at", "sync_status",
    "shopify_products_processed", "shopify_variants_processed",
    "products_created", "products_updated", "variants_created", "variants_updated",
    "stale_variants_reconciled", "error_message",
  ]) assert.match(migration, new RegExp(field));
  assert.match(sync, /sync_status: "failed"/);
  assert.match(sync, /error_message: error instanceof Error/);
});

test("new styles naturally remain pending until operator-controlled Product Intelligence exists", async () => {
  const [catalogue, page, sync] = await Promise.all([
    readRepositoryFile("apps/web/lib/catalogue.ts"),
    readRepositoryFile("apps/web/app/catalogue/page.tsx"),
    readRepositoryFile("supabase/functions/shopify-sync/index.ts"),
  ]);

  assert.match(catalogue, /productVisionByProductId\.get\([\s\S]*style\.style_id/);
  assert.match(catalogue, /\?\?[\s\S]*null/);
  assert.match(page, /product\.product_vision !== null/);
  assert.doesNotMatch(sync, /vault_product_vision|ProductVision|product intelligence/i);
});

test("manual Inventory refresh truthfully remains inventory-only", async () => {
  const [panel, route] = await Promise.all([
    readRepositoryFile("apps/web/components/inventory/InventorySyncPanel.tsx"),
    readRepositoryFile("apps/web/app/api/inventory/refresh/route.ts"),
  ]);

  assert.match(panel, /Refresh Inventory Only/);
  assert.match(panel, /variants already known to Vault OS/);
  assert.match(route, /shopify-inventory-sync/);
  assert.doesNotMatch(route, /shopify-sync/);
});
