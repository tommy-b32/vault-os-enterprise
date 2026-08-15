import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("../../supabase/migrations/20260824000000_purchase_order_receipt_variant_allocations.sql", root), "utf8");
const repository = await readFile(new URL("lib/purchase-orders/PurchaseOrderRepository.ts", root), "utf8");
const actions = await readFile(new URL("app/purchase-orders/actions.ts", root), "utf8");
const page = await readFile(new URL("app/purchase-orders/[id]/page.tsx", root), "utf8");
const component = await readFile(new URL("components/purchase-orders/PurchaseOrderReceiving.tsx", root), "utf8");
const inventorySync = await readFile(new URL("../../supabase/functions/shopify-inventory-sync/index.ts", root), "utf8");
const inventorySchema = await readFile(new URL("../../database/008_shopify_catalog_sync.sql", root), "utf8");

test("current PO identity is style-level while Shopify stock identity is size-variant-level", () => {
  assert.match(migration, /po_line\.style_id/);
  assert.match(inventorySchema, /option_1 text[\s\S]*option_2 text/);
  assert.match(page, /variant\.option_2/);
  assert.match(page, /variant\.product_id.*variant\.option_1/s);
});

test("preparatory receipt evidence binds exact variant, inventory item, and Shopify location", () => {
  assert.match(migration, /vault_purchase_order_receipt_allocations/);
  assert.match(migration, /variant_id uuid not null\s+references public\.vault_variants/);
  assert.match(migration, /received_location_id uuid null\s+references public\.vault_locations/);
  assert.match(migration, /check \(received_location_id is not null\) not valid/);
  assert.match(migration, /shopify_location_id_snapshot text null/);
  assert.match(migration, /shopify_location_id_snapshot is not null/);
  assert.match(migration, /shopify_variant_id_snapshot text not null/);
  assert.match(migration, /shopify_inventory_item_id_snapshot text not null/);
  assert.match(repository, /source_variant_id, source_inventory_item_id/);
  assert.match(repository, /\.eq\("source_active", true\)/);
  assert.match(migration, /variant\.source_inventory_item_id is not null/);
  assert.match(migration, /location\.source = 'shopify' and location\.active/);
});

test("database validation prevents cross-style variant leakage", () => {
  assert.match(migration, /variant\.product_id::text \|\| '::' \|\| coalesce\(nullif\(trim\(variant\.option_1\), ''\), 'Default'\) = po_line\.style_id/);
  assert.match(migration, /Variant allocation does not exactly match the persisted PO style/);
  assert.match(migration, /unique \(receipt_line_id, variant_id\)/);
});

test("accepted allocations cannot exceed canonical received or ordered quantities", () => {
  assert.match(migration, /sum\(\(allocation->>'quantity_received'\)::integer\)/);
  assert.match(migration, /already_received \+ target_quantity > ordered_quantity/);
  assert.match(migration, /Variant allocation quantities must be positive/);
});

test("non-sellable units are separate, require explanation, and never enter allocations", () => {
  assert.match(migration, /non_sellable_quantity integer not null default 0/);
  assert.match(migration, /non_sellable_quantity = 0 or discrepancy_note is not null/);
  assert.match(component, /Damaged, wrong, or otherwise non-sellable units/);
  assert.doesNotMatch(migration.match(/create table if not exists public\.vault_purchase_order_receipt_allocations[\s\S]*?\);/)?.[0] ?? "", /non_sellable/);
});

test("no Shopify posting action is exposed while historical receipt evidence lacks allocation", () => {
  assert.doesNotMatch(actions + repository, /inventoryAdjustQuantities|inventorySetQuantities|Post Received Stock/);
  assert.match(component, /Shopify posting is unavailable/);
  assert.doesNotMatch(component, />Post Received Stock to Shopify</);
});

test("only canonical inventory sync writes Vault inventory levels and snapshots", () => {
  assert.match(inventorySync, /from\(\s*"vault_inventory_levels"[\s\S]*\.upsert/);
  assert.match(inventorySync, /from\("vault_inventory_level_snapshots"\)[\s\S]*\.upsert/);
  assert.doesNotMatch(migration + actions + repository + component, /(?:insert into|update|upsert)[\s\S]{0,120}vault_inventory_levels/i);
  assert.doesNotMatch(migration + actions + repository + component, /vault_inventory_level_snapshots/);
});

test("preparatory workflow remains outside wallet, payment, demand, and purchasing intelligence", () => {
  const allocationSection = migration.slice(
    migration.indexOf("create table if not exists public.vault_purchase_order_receipt_allocations"),
    migration.indexOf("-- A fully received PO"),
  );
  assert.doesNotMatch(allocationSection + actions + component, /vault_cash_transactions|paid_amount_gbp\s*=|DemandIntelligenceEngine|SupplierBasketIntelligenceEngine|PurchaseIntelligenceEngine/);
});
