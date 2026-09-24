import assert from "node:assert/strict";
import test from "node:test";
import { resolveShopifyOptionIdentity } from "../../../shared/shopify/option-roles.ts";

const identity = (size, colour = "black") => resolveShopifyOptionIdentity([{ name: "Shoe size", value: size }, { name: "Color", value: colour }]);

test("UK Shoe size 7–11 resolves as first-class footwear identity", () => {
  for (const size of ["7", "8", "9", "10", "11"]) assert.deepEqual(identity(size), {
    optionNames: ["Shoe size", "Color", null], modelDesign: "black", normalizedSize: `UK ${size}`,
    sizeDomain: "footwear", sizeSystem: "UK", resolution: "resolved",
  });
});

test("footwear identity does not collide with other systems or unrelated numbers", () => {
  const uk = identity("9");
  const us = { ...uk, normalizedSize: "US 9", sizeSystem: "US" };
  const eu = { ...uk, normalizedSize: "EU 9", sizeSystem: "EU" };
  assert.notDeepEqual(uk, us); assert.notDeepEqual(uk, eu); assert.notDeepEqual(us, eu);
  assert.equal(resolveShopifyOptionIdentity([{ name: "Length", value: "9" }, { name: "Color", value: "black" }]).resolution, "unresolved");
});

test("apparel identity remains unchanged and affected Shopify structure resolves", () => {
  assert.deepEqual(resolveShopifyOptionIdentity([{ name: "Size", value: "XL" }, { name: "Color", value: "cream" }]), {
    optionNames: ["Size", "Color", null], modelDesign: "cream", normalizedSize: "XL", sizeDomain: "apparel", sizeSystem: "apparel", resolution: "resolved",
  });
  for (const colour of ["black", "cream", "light-blue", "red"]) for (const size of ["7", "8", "9", "10", "11"]) assert.equal(identity(size, colour).resolution, "resolved");
});
