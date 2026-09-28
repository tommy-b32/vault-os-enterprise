import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const migration = await readFile(new URL("../../../supabase/migrations/20261053000000_governed_sweatshirt_product_type.sql", import.meta.url), "utf8");
const tracksuitMigration = await readFile(new URL("../../../supabase/migrations/20261054000000_governed_tracksuit_product_type.sql", import.meta.url), "utf8");
const repository = await readFile(new URL("../lib/purchase-orders/PendingCatalogueDraftRepository.ts", import.meta.url), "utf8");
const pendingMigration = await readFile(new URL("../../../supabase/migrations/20261051000000_governed_pending_catalogue_purchasing_intake.sql", import.meta.url), "utf8");
const require = createRequire(import.meta.url);

function loadRepository() {
  const output = ts.transpileModule(repository, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("require", "exports", output)((name) => ({ "server-only": {}, "@/lib/supabase-admin": {} })[name] ?? require(name), exports);
  return exports;
}

function optionClient(compatibilities) {
  const rows = {
    vault_supplier_product_type_cost_profiles: [{ cost_type_id: "sweatshirt", supplier_currency: "GBP", exchange_rate_to_gbp: 1, pack_cost: 20, shipping_cost_per_pack: 0, import_cost_per_pack: 0, units_per_pack: 5 }],
    vault_cost_types: [{ id: "sweatshirt", display_name: "Sweatshirt" }],
    vault_pack_profiles: [{ id: "tee_5_piece", display_name: "Tee", units_per_pack: 5 }, { id: "sweatshirt_5_piece", display_name: "Sweatshirt", units_per_pack: 5 }],
    vault_cost_type_pack_profile_compatibilities: compatibilities,
  };
  return { from(table) { const result = () => Promise.resolve({ data: rows[table], error: null }); const query = { select: () => query, eq: () => query, not: () => query, then: (resolve, reject) => result().then(resolve, reject) }; return query; } };
}

test("Sweatshirt has an explicit governed five-piece identity and Exclusive merchandise-only evidence", () => {
  assert.match(migration, /\('sweatshirt', 'Sweatshirt'\)/);
  assert.match(migration, /\('sweatshirt_5_piece', 'Sweatshirt', 5\)/);
  assert.match(migration, /\('sweatshirt', 'sweatshirt_5_piece'\)/);
  assert.match(migration, /vault_supplier_product_type_merchandise_cost_evidence/);
  assert.match(migration, /'USD', 80\.00, 'merchandise_only', 'unknown'/);
  assert.match(migration, /Owner-supplied Exclusive Sweatshirt merchandise cost: USD 80\.00 per five-unit pack; shipping evidence is not yet supplied\./);
  assert.doesNotMatch(migration, /insert into public\.vault_supplier_product_type_cost_profiles/i);
});

test("Tracksuit has the same explicit five-piece governance with independent merchandise-only evidence", () => {
  assert.match(tracksuitMigration, /\('tracksuit', 'Tracksuit'\)/);
  assert.match(tracksuitMigration, /\('tracksuit_5_piece', 'Tracksuit', 5\)/);
  assert.match(tracksuitMigration, /\('tracksuit', 'tracksuit_5_piece'\)/);
  assert.match(tracksuitMigration, /'USD', 175\.00, 'merchandise_only', 'unknown'/);
  assert.match(tracksuitMigration, /shipping is unknown and product-unallocated/);
});

test("pending intake permits only explicit active type-pack compatibility and retains commercial fail-closed behavior", () => {
  assert.match(migration, /vault_cost_type_pack_profile_compatibilities/);
  assert.match(migration, /PENDING_CATALOGUE_PACK_PROFILE_INCOMPATIBLE/);
  assert.match(pendingMigration, /PENDING_CATALOGUE_COMMERCIAL_PROFILE_UNAVAILABLE/);
  assert.match(repository, /from\("vault_cost_type_pack_profile_compatibilities"\)/);
  assert.match(repository, /compatiblePairs\.has\(`\$\{profile\.cost_type_id\}:\$\{pack\.id\}`\)/);
});

test("Sweatshirt merchandise evidence cannot claim shipping, FX, import, or a complete landed cost", () => {
  const evidence = migration.match(/create table public\.vault_supplier_product_type_merchandise_cost_evidence \(([\s\S]*?)\n\);/i)?.[1] ?? "";
  assert.match(evidence, /cost_scope text not null check \(cost_scope = 'merchandise_only'\)/);
  assert.match(evidence, /shipping_evidence_status text not null check \(shipping_evidence_status = 'unknown'\)/);
  assert.doesNotMatch(evidence, /shipping_cost_per_pack|import_cost_per_pack|exchange_rate_to_gbp|landed/i);
  assert.match(pendingMigration, /PENDING_CATALOGUE_COMMERCIAL_PROFILE_UNAVAILABLE/);
});

test("new supplier-product intake resolves the Sweatshirt pair and rejects equal-sized cross-pairs", async () => {
  const { loadPendingCatalogueGovernedOptions } = loadRepository();
  const valid = await loadPendingCatalogueGovernedOptions("supplier", optionClient([{ cost_type_id: "sweatshirt", pack_profile_id: "sweatshirt_5_piece" }]));
  assert.deepEqual(valid.map((option) => `${option.costTypeName}:${option.packProfileName}:${option.unitsPerPack}`), ["Sweatshirt:Sweatshirt:5"]);
  const invalid = await loadPendingCatalogueGovernedOptions("supplier", optionClient([]));
  assert.deepEqual(invalid, []);
});

test("a Sweatshirt five-piece composition is exactly S through XXL once each", () => {
  const composition = { S: 1, M: 1, L: 1, XL: 1, XXL: 1 };
  assert.equal(Object.values(composition).reduce((total, units) => total + units, 0), 5);
  assert.deepEqual(Object.keys(composition), ["S", "M", "L", "XL", "XXL"]);
});

test("existing compatible product types remain data-driven while equal-sized cross-pairs are excluded", () => {
  const compatible = new Set(["tee:tee_5_piece", "knit:knit_5_piece", "jacket:jacket_5_piece", "sweatshirt:sweatshirt_5_piece"]);
  assert.ok(compatible.has("tee:tee_5_piece"));
  assert.ok(compatible.has("knit:knit_5_piece"));
  assert.ok(compatible.has("jacket:jacket_5_piece"));
  assert.ok(compatible.has("sweatshirt:sweatshirt_5_piece"));
  assert.ok(!compatible.has("jacket:knit_5_piece"));
  assert.ok(!compatible.has("knit:jacket_5_piece"));
});
