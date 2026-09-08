import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assessModels, resolveCanonicalCatalogueVariantStructure } from "../lib/intelligence/CatalogueVariantStructure.ts";

const store = await readFile(new URL("../lib/intelligence/StoreIntelligence.ts", import.meta.url), "utf8");

const variant = (id, modelDesign, normalizedSize, identityResolutionStatus = "resolved", raw = {}) => ({
  id,
  productId: "product-1",
  sourceVariantId: `shopify-${id}`,
  option1: raw.option1 ?? null,
  option2: raw.option2 ?? null,
  option3: null,
  modelDesign,
  normalizedSize,
  identityResolutionStatus,
  sourceActive: true,
  availableForSale: true,
  available: 5,
});

test("Store Intelligence queries and uses canonical Shopify semantic fields", () => {
  assert.match(store, /model_design, normalized_size, identity_resolution_status/);
  assert.match(store, /const semanticVariants = allVariants\.filter\(hasResolvedSemanticIdentity\)/);
  assert.match(store, /size: variant\.normalized_size/);
  assert.doesNotMatch(store, /size: variant\.option_2/);
  assert.match(store, /resolveCanonicalCatalogueVariantStructure/);
});

test("Color + Size, Size + Color, and Model + Size use canonical normalized sizes", () => {
  const structure = resolveCanonicalCatalogueVariantStructure("product-1", [
    variant("colour-first", "Black", "XL", "resolved", { option1: "Black", option2: "XL" }),
    variant("size-first", "Black", "XL", "resolved", { option1: "XL", option2: "Black" }),
    variant("model", "Triple", "L", "resolved", { option1: "Triple", option2: "L" }),
  ]);
  assert.equal(structure.state, "resolved");
  assert.deepEqual(structure.variants.map((row) => row.size), ["XL", "XL", "L"]);
  assert.deepEqual(structure.variants.map((row) => row.descriptor), ["Black", "Black", "Triple"]);
  assert.equal(structure.variants[1].size, "XL");
});

test("size-only Default is canonical while unresolved and incomplete identity fails closed", () => {
  const structure = resolveCanonicalCatalogueVariantStructure("product-1", [
    variant("default", "Default", "M"),
    variant("shoe", null, null, "unresolved", { option1: "9", option2: "Black" }),
    variant("title", null, null, "unresolved", { option1: "Default" }),
    variant("blank-model", "   ", "L"),
    variant("blank-size", "Black", "  "),
  ]);
  assert.equal(structure.state, "resolved");
  assert.equal(structure.variants.length, 1);
  assert.equal(structure.variants[0].descriptor, "Default");
  assert.equal(structure.variants[0].size, "M");
});

test("canonical model identity isolates same-parent models and preserves source variant sales mapping", () => {
  const structure = resolveCanonicalCatalogueVariantStructure("product-1", [
    variant("triple-xl", "Triple", "XL"),
    variant("triple-l", "Triple", "L"),
    variant("badge-xl", "Badge", "XL"),
  ]);
  const models = assessModels(structure, new Map([
    ["shopify-triple-xl", { sold7: 2, sold14: 4, previous14: 3 }],
    ["shopify-triple-l", { sold7: 1, sold14: 2, previous14: 2 }],
    ["shopify-badge-xl", { sold7: 3, sold14: 6, previous14: 5 }],
  ]), "current");
  const byModel = new Map(models.map((model) => [model.descriptor, model]));
  assert.equal(byModel.get("Triple")?.sold14, 6);
  assert.equal(byModel.get("Badge")?.sold14, 6);
  assert.notEqual(byModel.get("Triple")?.key, byModel.get("Badge")?.key);
});
