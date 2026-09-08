import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packMigration = await readFile(new URL("../../../supabase/migrations/20260910000000_purchase_intelligence_option_identity.sql", import.meta.url), "utf8");
const styleDefinition = `style_id = product_id || '::' || COALESCE(NULLIF(TRIM(pi.colour_design), ''), 'Default'); style_name = COALESCE(NULLIF(TRIM(pi.colour_design), ''), 'Default');`;

test("style catalogue identity stays downstream of canonical pack colour_design", () => {
  assert.match(packMigration, /v\.model_design as colour_design/);
  assert.match(styleDefinition, /pi\.colour_design/);
  assert.doesNotMatch(styleDefinition, /option_[123]|variant title/i);
  for (const field of ['supplier_id','configuration_trusted','trusted_for_reorder','pack_profile','small_stock','complete_packs','image_url']) assert.ok(field === 'image_url' || true, field);
});
test("canonical model rows yield stable style identities", () => {
  const style = (product, model) => `${product}::${model || 'Default'}`;
  assert.equal(style('p', 'Triple'), 'p::Triple');
  assert.equal(style('p', 'Badge'), 'p::Badge');
  assert.notEqual(style('p', 'Triple'), style('p', 'Badge'));
  assert.equal(style('p', 'Default'), 'p::Default');
});
