import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);

test("Shopify catalogue ingestion persists source timestamps and idempotent publication observations", async () => {
  const [products, sync, migration] = await Promise.all([
    readFile(new URL("supabase/functions/_shared/shopify/products.ts", root), "utf8"),
    readFile(new URL("supabase/functions/shopify-sync/index.ts", root), "utf8"),
    readFile(new URL("supabase/migrations/20260929000000_style_trading_evidence.sql", root), "utf8"),
  ]);
  for (const field of ["createdAt", "publishedAt"]) assert.match(products, new RegExp(`\\b${field}\\b`));
  assert.match(sync, /shopify_created_at: product\.createdAt/);
  assert.match(sync, /shopify_online_store_published_at: product\.publishedAt/);
  assert.match(sync, /shopify_created_at: variant\.createdAt/);
  assert.match(sync, /vault_shopify_product_publication_observations/);
  assert.match(sync, /onConflict: "product_id, source, published_at_key, publication_state"/);
  assert.match(migration, /generated always as \(coalesce\(published_at, 'infinity'::timestamptz\)\) stored/);
  assert.match(migration, /unique \(product_id, source, published_at_key, publication_state\)/);
  assert.match(migration, /append-only/i);
});

test("trading evidence derives maturity only from source timestamps and successful coverage", async () => {
  const migration = await readFile(new URL("supabase/migrations/20260929000000_style_trading_evidence.sql", root), "utf8");
  assert.match(migration, /vault_style_trading_evidence/);
  assert.match(migration, /range_agg\(tstzrange\(created_from, created_before/);
  assert.match(migration, /canonical_order_evidence_max_age/);
  assert.match(migration, /interval '30 minutes'/);
  assert.match(migration, /order_evidence_fresh/);
  assert.match(migration, /first_positive_sale_at/);
  assert.match(migration, /LEARNING/);
  assert.match(migration, /DEVELOPING_EVIDENCE/);
  assert.match(migration, /SUFFICIENT_EVIDENCE/);
  assert.match(migration, /UNKNOWN/);
  assert.doesNotMatch(migration, /vault_products\.created_at/);
  assert.doesNotMatch(migration, /vault_shopify_catalogue_sync_runs/);
});
