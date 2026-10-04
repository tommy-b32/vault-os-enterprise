import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../../../", import.meta.url);
const fixture = await readFile(new URL("apps/web/tests/fixtures/replay-compat/20261034500000_replay_exclusive_historical_catalogue_fixture.sql", root), "utf8");
const teeFoundation = await readFile(new URL("supabase/migrations/20261035000000_governed_historical_exclusive_tee_cogs_foundation.sql", root), "utf8");
const poloFoundation = await readFile(new URL("supabase/migrations/20261037000000_governed_historical_exclusive_polo_cogs_foundation.sql", root), "utf8");

const products = [
  ['5c9318eb-d273-44dc-b732-aeddaaa59d0b', 'gid://shopify/Product/16086093234554', 'Amir Domino Tee'], ['c8b33e7e-f3d2-4a2b-84c9-51c1942e3e5c', 'gid://shopify/Product/16086093169018', 'Balencia Tee'], ['23d19fdb-5e74-4609-9009-6b36cdc0b7d5', 'gid://shopify/Product/16086092841338', "Bamain Tee's"], ['7d8fe898-fa72-43b4-9ab9-c7067e7287c6', 'gid://shopify/Product/16086092775802', "BBerry Tee's"], ['224f4683-8147-4e93-a5ec-5a381ff8a1aa', 'gid://shopify/Product/16093419012474', "Casa Tee's"], ['746d5f16-614e-490e-b509-a0e61b0c2393', 'gid://shopify/Product/16086092710266', "CD Tee's"], ['f75e4ab7-8431-4076-8aa2-c92fa5dad9f6', 'gid://shopify/Product/16086093136250', "D&G Tee's"], ['274e89ef-1532-410b-bdcd-866e9b4f32d4', 'gid://shopify/Product/16093411770746', "Hrmes Tee's"], ['87b460bb-b8b2-4dd9-b347-d39245ec69ca', 'gid://shopify/Product/16086092513658', "LVE Tee's"], ['dfd40a5b-38f4-4ebe-b76e-8daf5a260694', 'gid://shopify/Product/16185906758010', 'Mnclr 1952'], ['4b5652fa-3e28-4c9b-8b7c-97319ed895ad', 'gid://shopify/Product/16086092644730', "Mnclr Black Badge Tee's"], ['9c2f40f9-aed9-42ab-8008-4b3421d7ba11', 'gid://shopify/Product/16086092579194', "Mnclr classic Tee's"], ['4e3dcdf3-13be-4f9c-8df6-2ec325f92dd6', 'gid://shopify/Product/16185913573754', 'Mnclr Double Badge Tee'], ['a85a5c1a-291a-4c2f-81aa-f2b287d63432', 'gid://shopify/Product/16093502800250', 'Mnclr Stripe'], ['5e39ef85-f024-44cb-b159-8bd57fe20692', 'gid://shopify/Product/16086092939642', "Of White Tee's"], ['55d7735f-4bb3-4d18-a0bc-e34793c53a1c', 'gid://shopify/Product/16093347938682', "Prda Tee's"], ['d508fd80-e4e8-4813-be92-eb24814b8f5c', 'gid://shopify/Product/16093390537082', "Ucci Tee's"], ['92aada38-cd9d-4f9c-9786-9597afa26ca3', 'gid://shopify/Product/16208544530810', "Valentino Tee's"], ['374eca12-5ca5-466e-aa0d-194ffbc86aa4', 'gid://shopify/Product/16132354376058', "Monc Polo's"], ['093fbada-eba4-4594-a47d-6aea4abea85d', 'gid://shopify/Product/16132348608890', "Fred P Polo's"],
];

test('replay Exclusive historical catalogue fixture is exact, isolated, idempotent, and meets foundation preconditions', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create table vault_suppliers(id uuid primary key, supplier_name text not null, is_active boolean not null default true, currency_code text not null); create table vault_products(id uuid primary key, source text not null, source_product_id text not null, title text not null, unique(source, source_product_id)); create table unrelated_rows(id int primary key); insert into unrelated_rows values (1);`);
  await db.exec(fixture);
  await db.exec(fixture);
  assert.deepEqual((await db.query('select id,supplier_name,is_active,currency_code from vault_suppliers')).rows, [{ id: '751bb88d-9f16-4663-a17c-f36a7618e780', supplier_name: 'Exclusive', is_active: true, currency_code: 'GBP' }]);
  assert.deepEqual((await db.query('select id,source_product_id,title from vault_products order by id')).rows, products.map(([id, source_product_id, title]) => ({ id, source_product_id, title })).sort((a, b) => a.id.localeCompare(b.id)));
  assert.equal((await db.query('select count(*)::int count from vault_products')).rows[0].count, 20);
  assert.equal((await db.query('select count(*)::int count from unrelated_rows')).rows[0].count, 1);
  for (const [id] of products) assert.match(teeFoundation + poloFoundation, new RegExp(id));
  assert.match(teeFoundation, /requires exactly 18 attested Exclusive Tee products/);
  assert.match(poloFoundation, /requires exactly the two owner-attested canonical products/);
});
