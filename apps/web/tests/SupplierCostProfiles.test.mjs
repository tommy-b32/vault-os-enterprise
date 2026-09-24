import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../../../supabase/migrations/20260928000000_supplier_product_type_replacement_cost_profiles.sql", import.meta.url), "utf8");
const tab = readFileSync(new URL("../components/catalogue/editor/ProductCommercialTab.tsx", import.meta.url), "utf8");
const catalogue = readFileSync(new URL("../lib/catalogue.ts", import.meta.url), "utf8");
const action = readFileSync(new URL("../app/catalogue/commercial-actions.ts", import.meta.url), "utf8");
const profileAction = readFileSync(new URL("../app/commercial/actions.ts", import.meta.url), "utf8");
const profileEditor = readFileSync(new URL("../components/commercial/SupplierCostProfiles.tsx", import.meta.url), "utf8");

test("supplier/type profiles are governed, explicit, versioned and never inferred from raw Shopify type", () => {
  assert.match(migration, /create table public\.vault_cost_types/);
  assert.match(migration, /vault_product_cost_type_assignments/);
  assert.match(migration, /vault_supplier_product_type_cost_profile_versions/);
  assert.match(migration, /one_active/);
  assert.match(migration, /inherit_pack_cost boolean not null default false/);
  assert.doesNotMatch(migration, /legacy\.product_type\s*=/);
});

test("resolution preserves product values by default and only requests a matching active profile explicitly", () => {
  assert.match(migration, /case when inherit_pack_cost then profile_pack_cost else pack_cost end/);
  assert.match(migration, /profile\.supplier_id = legacy\.supplier_id/);
  assert.match(migration, /profile\.cost_type_id = assignment\.cost_type_id/);
  assert.match(migration, /'product_override'/);
  assert.match(migration, /'inherited'/);
  assert.match(migration, /'mixed'/);
  assert.match(migration, /'unavailable'/);
});

test("profile changes append immutable parent cost snapshots without rewriting raw parent costs", () => {
  assert.match(migration, /append_product_cost_version\(parent\.product_id, 'supplier_cost_profile:'/);
  assert.match(migration, /matched_profile_version_id as effective_profile_version_id/);
  assert.match(migration, /Supplier cost profile versions are immutable/);
  assert.doesNotMatch(migration, /update public\.vault_product_costs/);
});

test("profile creation inserts a governed identity while edits update that exact active profile", () => {
  assert.match(profileAction, /const profileId = text\(formData, "profile_id"\)/);
  assert.match(profileAction, /editedProfile\.data\?\.supplier_id/);
  assert.match(profileAction, /editedProfile\.data\?\.cost_type_id/);
  assert.match(profileAction, /\.update\(profile\)\.eq\("id", existing\.data\.id\)/);
  assert.match(profileAction, /\.insert\(\{ \.\.\.profile, created_by_operator_id: operator\.id \}\)/);
  assert.match(profileAction, /effective_from: new Date\(\)\.toISOString\(\)/);
});

test("profile editing locks supplier and canonical type, and ambiguous active identities fail closed", () => {
  assert.match(profileEditor, /name="profile_id" type="hidden" value=\{selected\.id\}/);
  assert.match(profileEditor, /disabled=\{Boolean\(selected\)\} name="supplier_id"/);
  assert.match(profileEditor, /disabled=\{Boolean\(selected\)\} name="cost_type_id"/);
  assert.match(profileAction, /supplier and canonical cost type cannot change during edit/);
  assert.match(profileAction, /identity is ambiguous and must be remediated before saving/);
  assert.match(migration, /on public\.vault_supplier_product_type_cost_profiles\(supplier_id, cost_type_id\) where active/);
});

test("product inheritance resolves a single active profile by profile identity and canonical supplier/type", () => {
  assert.match(migration, /on profile\.id = inheritance\.profile_id and profile\.active/);
  assert.match(migration, /profile\.supplier_id = legacy\.supplier_id and profile\.cost_type_id = assignment\.cost_type_id/);
  assert.match(migration, /vault_supplier_product_type_cost_profile_versions/);
});

test("physical pack conflicts remain an explicit commercial-trust failure", () => {
  assert.match(migration, /physical_pack_conflict/);
  assert.match(migration, /'physical_pack_definition'/);
});

test("Catalogue exposes source provenance and requires a selected matching profile for inheritance", () => {
  for (const field of ["pack_cost_source", "shipping_cost_source", "import_cost_source", "units_source", "fx_source", "commercial_cost_resolution_mode"]) assert.match(catalogue, new RegExp(field));
  assert.match(tab, /EFFECTIVE REPLACEMENT COST/);
  assert.match(tab, /Use supplier profile/);
  assert.match(action, /must be active and match this parent/);
});

test("transfer fees have no replacement-cost input and cannot be submitted as import cost by this feature", () => {
  assert.doesNotMatch(tab, /transfer.*fee/i);
  assert.match(migration, /import_cost_per_pack/);
  assert.doesNotMatch(migration, /transfer_fee/);
});
