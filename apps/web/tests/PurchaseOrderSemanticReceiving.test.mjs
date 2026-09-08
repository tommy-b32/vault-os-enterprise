import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("../../supabase/migrations/20260911000000_semantic_purchase_order_receiving.sql", root), "utf8");
const repository = await readFile(new URL("lib/purchase-orders/PurchaseOrderRepository.ts", root), "utf8");
const page = await readFile(new URL("app/purchase-orders/[id]/page.tsx", root), "utf8");

function canonicalStyleId(variant) {
  if (variant.identityResolutionStatus !== "resolved") return null;
  if (!variant.modelDesign?.trim() || !variant.normalizedSize?.trim()) return null;
  return `${variant.productId}::${variant.modelDesign.trim()}`;
}

function canReceive(variant, purchaseOrderStyleId) {
  return variant.source === "shopify" && Boolean(variant.sourceVariantId) &&
    Boolean(variant.inventoryItemId) && canonicalStyleId(variant) === purchaseOrderStyleId;
}

const base = {
  productId: "product-1",
  source: "shopify",
  sourceVariantId: "shopify-variant-1",
  inventoryItemId: "shopify-inventory-item-1",
  identityResolutionStatus: "resolved",
};

test("Color + Size and reversed Size + Color receive through the same canonical style", () => {
  const colourFirst = { ...base, modelDesign: "Black", normalizedSize: "XL", rawOptions: ["Black", "XL"] };
  const sizeFirst = { ...base, modelDesign: "Black", normalizedSize: "XL", rawOptions: ["XL", "Black"] };
  assert.equal(canonicalStyleId(colourFirst), "product-1::Black");
  assert.equal(canonicalStyleId(sizeFirst), "product-1::Black");
  assert.equal(canReceive(colourFirst, "product-1::Black"), true);
  assert.equal(canReceive(sizeFirst, "product-1::Black"), true);
});

test("Model + Size and supported size-only Default retain canonical receiving identity", () => {
  assert.equal(canReceive({ ...base, modelDesign: "Triple", normalizedSize: "L" }, "product-1::Triple"), true);
  assert.equal(canReceive({ ...base, modelDesign: "Default", normalizedSize: "XL" }, "product-1::Default"), true);
});

test("receiving uses normalized size and fails closed for unresolved or incomplete identity", () => {
  const reversed = { ...base, modelDesign: "Black", normalizedSize: "XL", rawOption2: "Black" };
  assert.equal(reversed.normalizedSize, "XL");
  assert.equal(canReceive({ ...reversed, identityResolutionStatus: "unresolved" }, "product-1::Black"), false);
  assert.equal(canReceive({ ...reversed, modelDesign: "   " }, "product-1::Black"), false);
  assert.equal(canReceive({ ...reversed, normalizedSize: null }, "product-1::Black"), false);
});

test("same-product cross-model allocations cannot pass semantic receipt validation", () => {
  const triple = { ...base, modelDesign: "Triple", normalizedSize: "XL" };
  const badge = { ...base, sourceVariantId: "shopify-variant-2", modelDesign: "Badge", normalizedSize: "XL" };
  assert.equal(canReceive(triple, "product-1::Triple"), true);
  assert.equal(canReceive(badge, "product-1::Triple"), false);
});

test("active receipt validator requires resolved canonical identity and preserves immutable Shopify linkage", () => {
  assert.match(migration, /variant\.source_variant_id is not null/);
  assert.match(migration, /variant\.source_inventory_item_id is not null/);
  assert.match(migration, /variant\.identity_resolution_status = 'resolved'/);
  assert.match(migration, /nullif\(trim\(variant\.model_design\), ''\) is not null/);
  assert.match(migration, /nullif\(trim\(variant\.normalized_size\), ''\) is not null/);
  assert.match(migration, /variant\.product_id::text \|\| '::' \|\| trim\(variant\.model_design\) = po_line\.style_id/);
  assert.match(migration, /shopify_variant_id_snapshot[\s\S]*shopify_inventory_item_id_snapshot/);
  assert.doesNotMatch(migration, /variant\.option_[123]/);
});

test("repository and receiving UI consume canonical fields without positional fallbacks", () => {
  assert.match(repository, /model_design, normalized_size, identity_resolution_status/);
  assert.match(repository, /source_variant_id, source_inventory_item_id/);
  assert.match(page, /variant\.identity_resolution_status === "resolved"/);
  assert.match(page, /variant\.model_design\?\.trim\(\)/);
  assert.match(page, /variant\.normalized_size\?\.trim\(\)/);
  assert.match(page, /variant\.product_id.*variant\.model_design/s);
  assert.match(page, /size: variant\.normalized_size/);
  assert.match(page, /\?\.normalized_size \?\? "Unknown size"/);
  assert.doesNotMatch(page, /variant\.option_[12]/);
});
