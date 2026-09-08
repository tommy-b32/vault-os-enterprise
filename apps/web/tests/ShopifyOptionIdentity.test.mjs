import assert from "node:assert/strict";
import test from "node:test";
import { resolveShopifyOptionIdentity } from "../../../supabase/functions/_shared/shopify/option-roles.ts";

const resolve = (...options) => resolveShopifyOptionIdentity(options.map(([name, value]) => ({ name, value })));
test("semantic Shopify option identity is position-independent", () => {
  for (const options of [[['Model', 'Black'], ['Size', 'XL']], [['Size', 'XL'], ['Model', 'Black']]]) {
    assert.deepEqual(resolve(...options), { optionNames: options.map(([name]) => name).concat([null]).slice(0, 3), modelDesign: 'Black', normalizedSize: 'XL', resolution: 'resolved' });
  }
});
test("design and style aliases plus size-only products resolve safely", () => {
  assert.equal(resolve(['Design', 'Triple'], ['Size', 'M']).modelDesign, 'Triple');
  assert.equal(resolve(['Style', 'Logo'], ['Size', '2XL']).normalizedSize, '2XL');
  assert.deepEqual(resolve(['Size', 'L']), { optionNames: ['Size', null, null], modelDesign: 'Default', normalizedSize: 'L', resolution: 'resolved' });
});
test("Color and Colour are case-insensitive model aliases while shoe sizes and Title fail closed", () => {
  for (const name of ['Color', 'color', 'COLOR', 'Colour', 'colour']) {
    assert.deepEqual(resolve([name, 'Black Clouds'], ['Size', 'XL']), {
      optionNames: [name, 'Size', null], modelDesign: 'Black Clouds', normalizedSize: 'XL', resolution: 'resolved',
    });
    assert.equal(resolve(['Size', 'M'], [name, 'Black']).modelDesign, 'Black');
  }
  assert.equal(resolve(['Shoe size', '42']).resolution, 'unresolved');
  assert.equal(resolve(['Shoe size', '42'], ['Color', 'Black']).resolution, 'unresolved');
  assert.equal(resolve(['Title', 'Default Title']).resolution, 'unresolved');
});
test("ambiguous or unsupported option roles fail closed", () => {
  for (const options of [[['Model', 'A'], ['Design', 'B'], ['Size', 'M']], [['Material', 'Cotton'], ['Size', 'M']], [['Model', 'A'], ['Size', 'Unknown']]]) {
    assert.equal(resolve(...options).resolution, 'unresolved');
  }
});
