import assert from "node:assert/strict";
import test from "node:test";
import {
  SUPPLIER_STYLE_PACK_COMPOSITION_INTELLIGENCE_FIELDS,
  loadSupplierStylePackCompositionIntelligenceFrom,
} from "../lib/supplier-style-pack-composition.ts";

let assertionCount = 0;

function equal(actual, expected) {
  assertionCount += 1;
  assert.equal(actual, expected);
}

function deepEqual(actual, expected) {
  assertionCount += 1;
  assert.deepEqual(actual, expected);
}

async function rejects(operation, pattern) {
  assertionCount += 1;
  await assert.rejects(operation, pattern);
}

const fields = [
  "id",
  "supplier_id",
  "style_id",
  "parent_product_id",
  "normalized_size",
  "units_per_pack",
  "declared_units_per_pack",
  "commercial_units_per_pack",
  "composition_units_per_pack",
  "composition_complete",
  "composition_valid",
  "commercial_pack_consistent",
  "active",
  "updated_at",
  "missing_requirements",
];

const row = (overrides = {}) => ({
  id: "00000000-0000-0000-0000-000000000001",
  supplier_id: "00000000-0000-0000-0000-000000000010",
  style_id: "catalogue::Alpha",
  parent_product_id: "00000000-0000-0000-0000-000000000100",
  normalized_size: "M",
  units_per_pack: 2,
  declared_units_per_pack: 8,
  commercial_units_per_pack: 8,
  composition_units_per_pack: 8,
  composition_complete: true,
  composition_valid: true,
  commercial_pack_consistent: true,
  active: true,
  updated_at: "2026-09-13T12:00:00.000Z",
  missing_requirements: [],
  ...overrides,
});

const client = (data, error = null) => ({
  from: (relation) => ({
    select: async (columns) => {
      assert.equal(relation, "vault_supplier_style_pack_composition_intelligence");
      assert.equal(columns, fields.join(", "));
      return { data, error };
    },
  }),
});

test("loader maps the exact 15-field view contract", async () => {
  deepEqual(SUPPLIER_STYLE_PACK_COMPOSITION_INTELLIGENCE_FIELDS, fields);

  const source = row();
  const result = await loadSupplierStylePackCompositionIntelligenceFrom(client([source]));

  equal(result.length, 1);
  deepEqual(result[0], source);
  deepEqual(result[0].missing_requirements, []);
});

test("loader preserves nullable commercial data and all commercial consistency states", async () => {
  const nullCommercial = row({
    id: "00000000-0000-0000-0000-000000000002",
    style_id: "catalogue::Unavailable",
    commercial_units_per_pack: null,
    commercial_pack_consistent: null,
    missing_requirements: ["commercial_pack_size_unavailable"],
  });
  const inconsistentCommercial = row({
    id: "00000000-0000-0000-0000-000000000003",
    style_id: "catalogue::Mismatch",
    commercial_units_per_pack: 6,
    commercial_pack_consistent: false,
    missing_requirements: ["commercial_pack_size_mismatch"],
  });

  const result = await loadSupplierStylePackCompositionIntelligenceFrom(
    client([row(), nullCommercial, inconsistentCommercial]),
  );

  equal(result[0].commercial_pack_consistent, true);
  equal(result[1].commercial_units_per_pack, null);
  equal(result[1].commercial_pack_consistent, null);
  equal(result[2].commercial_pack_consistent, false);
  deepEqual(result[1].missing_requirements, ["commercial_pack_size_unavailable"]);
  deepEqual(result[2].missing_requirements, ["commercial_pack_size_mismatch"]);
});

test("loader preserves valid, invalid, incomplete, and Default-style rows without special casing", async () => {
  const defaultStyle = row({
    id: "00000000-0000-0000-0000-000000000004",
    supplier_id: "00000000-0000-0000-0000-000000000011",
    style_id: "catalogue::Default",
    normalized_size: "XL",
  });
  const noComposition = row({
    id: "00000000-0000-0000-0000-000000000005",
    supplier_id: "00000000-0000-0000-0000-000000000012",
    style_id: "catalogue::NoComposition",
    normalized_size: null,
    units_per_pack: null,
    composition_units_per_pack: 0,
    composition_complete: false,
    composition_valid: false,
    missing_requirements: ["composition_missing"],
  });

  const result = await loadSupplierStylePackCompositionIntelligenceFrom(
    client([defaultStyle, noComposition]),
  );

  equal(result.length, 2);
  equal(result[0].style_id, "catalogue::Default");
  equal(result[0].composition_complete, true);
  equal(result[0].composition_valid, true);
  equal(result[1].composition_complete, false);
  equal(result[1].composition_valid, false);
  equal(result[1].normalized_size, null);
  equal(result[1].units_per_pack, null);
  deepEqual(result[1].missing_requirements, ["composition_missing"]);
  deepEqual(
    result.map((entry) => [entry.supplier_id, entry.style_id]),
    [
      ["00000000-0000-0000-0000-000000000011", "catalogue::Default"],
      ["00000000-0000-0000-0000-000000000012", "catalogue::NoComposition"],
    ],
  );
});

test("loader propagates database errors", async () => {
  await rejects(
    () => loadSupplierStylePackCompositionIntelligenceFrom(client(null, { message: "view unavailable" })),
    /view unavailable/,
  );
});

test.after(() => {
  process.stdout.write(`loader assertions: ${assertionCount}\n`);
});
