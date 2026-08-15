import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("../../supabase/migrations/20260825000000_purchase_order_inventory_postings.sql", root), "utf8");
const edge = await readFile(new URL("../../supabase/functions/shopify-post-received-inventory/index.ts", root), "utf8");
const helper = await readFile(new URL("../../supabase/functions/_shared/shopify/inventory-adjustment.ts", root), "utf8");
const sync = await readFile(new URL("../../supabase/functions/shopify-inventory-sync/index.ts", root), "utf8");
const repository = await readFile(new URL("lib/purchase-orders/PurchaseOrderRepository.ts", root), "utf8");
const component = await readFile(new URL("components/purchase-orders/PurchaseOrderReceiving.tsx", root), "utf8");

test("posting reserves exact allocation remainder and supports partial quantities", () => {
  assert.match(migration, /receipt_allocation_id uuid not null references public\.vault_purchase_order_receipt_allocations/);
  assert.match(migration, /target_quantity > unavailable/);
  assert.match(migration, /Posting exceeds the accepted sellable allocation remainder/);
  assert.match(component, /max={remaining}/);
});

test("current mappings and Shopify identities are revalidated without cross-variant leakage", () => {
  assert.match(migration, /source_variant_id = allocation\.shopify_variant_id_snapshot/);
  assert.match(migration, /source_inventory_item_id = allocation\.shopify_inventory_item_id_snapshot/);
  assert.match(migration, /source_location_id = receipt\.shopify_location_id_snapshot/);
  assert.match(helper, /variantsByItem\.get\(change\.inventoryItemId\) !== change\.variantId/);
});

test("Shopify 2026-07 adjustment uses required native idempotency and fails closed on scope", () => {
  assert.match(helper, /inventoryAdjustQuantities/);
  assert.match(helper, /@idempotent\(key: \$idempotencyKey\)/);
  assert.match(helper, /write_inventory/);
  assert.match(edge, /posting_state === "succeeded"/);
  assert.match(edge, /pending or unknown; retry is blocked/);
});

test("posting evidence is append-only and records response/reference and failures", () => {
  assert.match(migration, /vault_purchase_order_inventory_posting_events/);
  assert.match(migration, /before update or delete on public\.vault_purchase_order_inventory_posting_events/);
  assert.match(migration, /shopify_reference text null/);
  assert.match(migration, /response_payload jsonb null/);
  assert.match(edge, /shopify_succeeded/);
  assert.match(edge, /shopify_failed/);
  assert.match(edge, /shopify_outcome_unknown/);
});

test("damaged units are excluded and Vault inventory remains sync-derived", () => {
  assert.doesNotMatch(migration + edge + helper + repository + component, /non_sellable_quantity[\s\S]{0,120}(?:delta|inventoryAdjust)/);
  assert.doesNotMatch(migration + edge + helper + repository + component, /(?:insert into|update|upsert)[\s\S]{0,100}vault_inventory_levels/i);
  assert.doesNotMatch(migration + edge + helper + repository + component, /vault_inventory_level_snapshots/);
  assert.match(sync, /from\(\s*"vault_inventory_levels"[\s\S]*\.upsert/);
  assert.match(edge, /functions\.invoke\("shopify-inventory-sync"/);
});

test("posting does not touch wallet, payment, demand, or purchasing intelligence", () => {
  assert.doesNotMatch(migration + edge + helper + component, /vault_cash_transactions|paid_amount_gbp|DemandIntelligenceEngine|SupplierBasketIntelligenceEngine|PurchaseIntelligenceEngine/);
});
