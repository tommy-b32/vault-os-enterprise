import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const root = new URL("../../../", import.meta.url);
const fixture = await readFile(new URL("apps/web/tests/fixtures/replay-compat/20261047500000_replay_exclusive_tee_operational_profile_fixture.sql", root), "utf8");
const governed = await readFile(new URL("supabase/migrations/20261048000000_govern_exclusive_tee_profile_inheritance.sql", root), "utf8");
const targets = [['5c9318eb-d273-44dc-b732-aeddaaa59d0b',14],['c8b33e7e-f3d2-4a2b-84c9-51c1942e3e5c',14],['23d19fdb-5e74-4609-9009-6b36cdc0b7d5',7],['7d8fe898-fa72-43b4-9ab9-c7067e7287c6',7],['224f4683-8147-4e93-a5ec-5a381ff8a1aa',7],['746d5f16-614e-490e-b509-a0e61b0c2393',7],['f75e4ab7-8431-4076-8aa2-c92fa5dad9f6',7],['274e89ef-1532-410b-bdcd-866e9b4f32d4',5],['87b460bb-b8b2-4dd9-b347-d39245ec69ca',7],['4b5652fa-3e28-4c9b-8b7c-97319ed895ad',7],['9c2f40f9-aed9-42ab-8008-4b3421d7ba11',7],['a85a5c1a-291a-4c2f-81aa-f2b287d63432',7],['5e39ef85-f024-44cb-b159-8bd57fe20692',7],['55d7735f-4bb3-4d18-a0bc-e34793c53a1c',7],['d508fd80-e4e8-4813-be92-eb24814b8f5c',7]];
test('Exclusive tee operational replay fixture is exact and isolated', () => {
  for (const value of ['5eec6ed8-16af-4024-8f02-e43fdf5c8cd7', "'USD'", '50.00', '23.25', '0.745755', "date '2026-09-16'", "timestamptz '2026-09-16T12:00:00Z'"]) assert.ok(fixture.includes(value));
  assert.equal((fixture.match(/::uuid,[0-9]+\)/g) ?? []).length, 15);
  for (const [id, days] of targets) { assert.ok(governed.includes(id)); assert.ok(fixture.includes(`${id}'::uuid,${days}`)); }
  assert.doesNotMatch(fixture, /insert into public\.vault_product_cost_type_assignments|insert into public\.vault_product_cost_profile_inheritance|insert into public\.vault_supplier_product_type_cost_profile_versions/i);
  assert.doesNotMatch(fixture, /dfd40a5b-38f4-4ebe-b76e-8daf5a260694|92aada38-cd9d-4f9c-9786-9597afa26ca3|374eca12-5ca5-466e-aa0d-194ffbc86aa4|093fbada-eba4-4594-a47d-6aea4abea85d/);
  assert.match(fixture, /conflicting supplier profile/); assert.match(fixture, /conflicting product settings/);
});
