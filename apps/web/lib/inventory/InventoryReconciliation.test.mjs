import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  findUnavailableInventoryVariantIds,
} from "../../../../supabase/functions/_shared/shopify/inventory-reconciliation.ts";

const repositoryRoot = new URL("../../../../", import.meta.url);

test("exact returned inventory-item IDs preserve mapped variants", () => {
  const variants = [
    { id: "of-white-white-black-s", source_inventory_item_id: "gid://shopify/InventoryItem/1" },
    { id: "balencia-black-matte-s", source_inventory_item_id: "gid://shopify/InventoryItem/2" },
  ];

  assert.deepEqual(findUnavailableInventoryVariantIds(variants, [
    { id: "gid://shopify/InventoryItem/1" },
    { id: "gid://shopify/InventoryItem/2" },
  ]), []);
});

test("missing Shopify nodes identify only their exact canonical variants", () => {
  const variants = [
    { id: "mapped", source_inventory_item_id: "gid://shopify/InventoryItem/1" },
    { id: "orphaned", source_inventory_item_id: "gid://shopify/InventoryItem/2" },
  ];

  assert.deepEqual(findUnavailableInventoryVariantIds(variants, [
    { id: "gid://shopify/InventoryItem/1" },
  ]), ["orphaned"]);
});

test("the five known stale style groups reconcile their 25 proven orphaned variants", () => {
  const canonicalVariantIds = [
    "67b31eb0-50f9-4eba-af5c-0d8445cd796a", "1d1e9dd6-10fd-4477-8196-50d253eaec6c",
    "23ef0ffa-6d31-40c9-b9c2-826f35d03696", "646ea23c-14d2-4a84-a46d-4a8277bd07ef",
    "0fcec79d-fb00-46be-90cb-70b076efb3e2", "8939e6fc-0c5c-46d2-8864-265fb4077358",
    "cdbfcff7-3881-4035-92db-f938765c8e7a", "810c963e-621b-46c3-aa96-72f05c639c38",
    "478aee0a-0286-4ba0-875a-766d38ff26c0", "33ca05f5-8f5f-4110-b8a1-76cf7a863db9",
    "4e944281-3d05-4213-bc45-eb1ba8e662ae", "4970165d-7c27-4cf9-a39d-758e42520186",
    "50ca49ad-b955-4872-bd8e-363299ff8b6b", "d881c746-1a3b-4b53-9b56-396790a147bc",
    "4bbd254a-71ac-4994-8c33-31e42088e2f5", "66d5bc1c-df43-40c0-8988-a99be52ad2be",
    "e6da54ea-dd0c-4b43-ba89-6e43c0adfdd2", "b214d99f-4cdb-4b75-9e9d-1d5b35f91567",
    "c47418cf-4463-4613-b9e2-c12a31a453a5", "a7b677c4-fa73-4eb1-9190-203bf862c610",
    "1560be40-b86a-4737-a80f-3dd540e0f5cb", "3f57714b-9534-4e9b-a9ea-61cf205a22e6",
    "bc60868b-ffad-4d74-8a64-084c5cdcb2ad", "7757223b-b79a-43a7-b7b9-d0f8afbb6df2",
    "cf290365-b4c1-442e-99bf-031905fe23ee",
  ];
  const variants = canonicalVariantIds.map((id, index) => ({
    id,
    source_inventory_item_id: `gid://shopify/InventoryItem/${index + 1}`,
  }));

  assert.deepEqual(
    findUnavailableInventoryVariantIds(variants, []),
    canonicalVariantIds,
  );
});

test("successful mapped processing refreshes provenance even when quantities are unchanged", async () => {
  const sync = await readFile(
    new URL("supabase/functions/shopify-inventory-sync/index.ts", repositoryRoot),
    "utf8",
  );

  assert.match(sync, /const syncedAt\s*=\s*new Date\(\)\.toISOString\(\)/);
  assert.match(sync, /synced_at:\s*syncedAt/);
  assert.match(sync, /\.upsert\(rowBatch,[\s\S]*onConflict:\s*"variant_id,location_id"/);
  const currentInventoryWrite = sync.match(/\.from\(\s*"vault_inventory_levels"[\s\S]*?if \(inventoryError\)/)?.[0] ?? "";
  assert.doesNotMatch(currentInventoryWrite, /ignoreDuplicates\s*:\s*true/);
});

test("orphaned mappings lose stale rows without receiving fabricated freshness", async () => {
  const sync = await readFile(
    new URL("supabase/functions/shopify-inventory-sync/index.ts", repositoryRoot),
    "utf8",
  );

  assert.match(sync, /findUnavailableInventoryVariantIds\([\s\S]*variants,[\s\S]*returnedInventoryItems/);
  assert.match(sync, /from\("vault_inventory_levels"\)[\s\S]*\.delete\(\)[\s\S]*\.in\("variant_id", variantIdBatch\)/);
  assert.doesNotMatch(sync, /orphanedVariantIds[\s\S]{0,300}synced_at/);
  assert.doesNotMatch(sync, /product_name|product_title|colour_design|fuzzy|\bsku\b/i);
});

test("replenishment freshness cannot be masked by newer order history", async () => {
  const migration = await readFile(
    new URL("supabase/migrations/20260809000000_truthful_replenishment_freshness.sql", repositoryRoot),
    "utf8",
  );

  assert.match(migration, /inventory\.last_inventory_sync as freshness/i);
  assert.match(migration, /sync\.completed_at as order_history_freshness/i);
  assert.doesNotMatch(migration, /greatest\(sync\.completed_at,\s*inventory\.last_inventory_sync\)/i);
  assert.match(migration, /inventory\.last_inventory_sync is null then 'inventory_freshness_unavailable'/i);
  assert.match(migration, /inventory\.last_inventory_sync < now\(\) - interval '30 minutes' then 'inventory_stale'/i);
});

test("Advisor and classifier continue consuming the existing inventory-stale reason", async () => {
  const [advisor, classifier] = await Promise.all([
    readFile(new URL("apps/web/app/advisor/page.tsx", repositoryRoot), "utf8"),
    readFile(new URL("apps/web/lib/brain/TrustedBuyingCandidateClassifier.ts", repositoryRoot), "utf8"),
  ]);

  assert.match(advisor, /diagnostics\.staleInventory > 0/);
  assert.match(classifier, /missing\.includes\("inventory_stale"\)/);
});
