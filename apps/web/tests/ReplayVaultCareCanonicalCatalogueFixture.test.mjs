import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../../../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const fixture = await read("apps/web/tests/fixtures/replay-compat/20261030500000_replay_vaultcare_canonical_catalogue_fixture.sql");
const treatments = await read("supabase/migrations/20261031000000_governed_financial_treatments.sql");
const historical = await read("supabase/migrations/20261036000000_governed_historical_vaultcare_service_treatment_foundation.sql");

test("replay VaultCare catalogue fixture is minimal, idempotent, and meets both governed identity contracts", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create table vault_products(id uuid primary key, source text not null, source_product_id text not null, title text not null, unique(source, source_product_id));
    create table vault_variants(id uuid primary key default gen_random_uuid(), product_id uuid not null references vault_products(id), source text not null, source_variant_id text not null, unique(source, source_variant_id));
    create table vault_historical_service_treatment_evidence(
      canonical_product_id uuid not null references vault_products(id), shopify_product_id text not null,
      shopify_variant_id text not null, product_title text not null, service_nature text not null,
      effective_from date not null, effective_through date not null, treatment text not null,
      direct_sale_time_cogs_gbp numeric not null, evidence_method text not null,
      provenance text not null, conditional_cost_treatment text not null
    );
  `);

  await db.exec(fixture);
  await db.exec(fixture);
  assert.deepEqual((await db.query("select id,source,source_product_id,title from vault_products")).rows, [{
    id: "0df03817-3bd0-4a74-a3e4-488fc17fd59e", source: "shopify",
    source_product_id: "gid://shopify/Product/16145627939194", title: "VaultCare - Return Protection",
  }]);
  assert.deepEqual((await db.query("select product_id,source,source_variant_id from vault_variants")).rows, [{
    product_id: "0df03817-3bd0-4a74-a3e4-488fc17fd59e", source: "shopify",
    source_variant_id: "gid://shopify/ProductVariant/57053091955066",
  }]);
  assert.equal((await db.query("select count(*)::int count from vault_products")).rows[0].count, 1);
  assert.equal((await db.query("select count(*)::int count from vault_variants")).rows[0].count, 1);

  const treatmentAnchor = treatments.match(/do \$\$ declare vaultcare_product uuid; begin[\s\S]*?end \$\$;/)?.[0];
  assert.ok(treatmentAnchor);
  await db.exec("create function append_product_financial_treatment(uuid,text,timestamptz,text) returns uuid language sql as 'select $1';");
  await db.exec(treatmentAnchor);
  const historicalAnchor = historical.match(/do \$\$ declare vaultcare_product uuid := '[^']+'; begin[\s\S]*?end \$\$;/)?.[0];
  assert.ok(historicalAnchor);
  await db.exec(historicalAnchor);
});
