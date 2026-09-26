import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../../../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20261036000000_governed_historical_vaultcare_service_treatment_foundation.sql", root), "utf8");

test("historical VaultCare service evidence is bounded, immutable, and isolated", () => {
  assert.match(migration, /create table public\.vault_historical_service_treatment_evidence/);
  assert.match(migration, /HISTORICAL_OWNER_ATTESTED_NO_DIRECT_COGS_AT_SALE/);
  assert.match(migration, /historical_no_direct_cogs_at_sale/);
  assert.match(migration, /direct_sale_time_cogs_gbp numeric\(14,2\) not null check \(direct_sale_time_cogs_gbp = 0\)/);
  assert.match(migration, /'2026-07-11','2026-09-05'/);
  assert.match(migration, /0df03817-3bd0-4a74-a3e4-488fc17fd59e/);
  assert.match(migration, /gid:\/\/shopify\/Product\/16145627939194/);
  assert.match(migration, /gid:\/\/shopify\/ProductVariant\/57053091955066/);
  assert.match(migration, /create trigger historical_service_treatment_evidence_immutable/);
  assert.match(migration, /conditional later costs are separate evidence/);
  assert.match(migration, /create view public\.vault_historical_vaultcare_service_treatment_line_attributions/);
  assert.match(migration, /security_invoker = true/);
  assert.match(migration, /line\.cogs_quantity \* evidence\.direct_sale_time_cogs_gbp/);
  assert.match(migration, /between evidence\.effective_from and evidence\.effective_through/);
  assert.match(migration, /orders\.cancelled_at is null/);
  assert.doesNotMatch(migration, /vault_product_financial_treatment_versions\s*(?:\(|set|insert|update)/i);
  assert.doesNotMatch(migration, /alter table public\.vault_shopify_order_lines/i);
  assert.doesNotMatch(migration, /vault_product_cost_versions\s*(?:\(|set|insert|update)/i);
  assert.doesNotMatch(migration, /vault_shopify_verified_order_operational_contributions/i);
  assert.doesNotMatch(migration, /vault_shopify_verified_product_profitability/i);
});

test("historical VaultCare attribution resolves only the exact service identity and period", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const product = "0df03817-3bd0-4a74-a3e4-488fc17fd59e";
  const variant = "00000000-0000-4000-a000-000000000001";
  await db.exec(`create function gen_random_uuid() returns uuid language sql as $$
      select (substr(md5(random()::text),1,8)||'-'||substr(md5(random()::text),1,4)||'-4'||substr(md5(random()::text),1,3)||'-a'||substr(md5(random()::text),1,3)||'-'||substr(md5(random()::text),1,12))::uuid
    $$;
    create role anon; create role authenticated; create role service_role;
    create table vault_products(id uuid primary key,source text not null,source_product_id text not null,title text not null);
    create table vault_variants(id uuid primary key,product_id uuid not null references vault_products(id),source text not null,source_variant_id text not null);
    create table vault_shopify_orders(id uuid primary key,source text not null,shopify_order_id text not null,shopify_created_at timestamptz not null,cancelled_at timestamptz,metadata jsonb not null);
    create table vault_shopify_order_lines(id uuid primary key,order_id uuid not null references vault_shopify_orders(id),shopify_product_id text,shopify_variant_id text,cogs_quantity integer not null,net_line_revenue numeric not null);
    insert into vault_products values ('${product}','shopify','gid://shopify/Product/16145627939194','VaultCare - Return Protection'),('00000000-0000-4000-a000-000000000002','shopify','gid://shopify/Product/other','Other');
    insert into vault_variants values ('${variant}','${product}','shopify','gid://shopify/ProductVariant/57053091955066'),('00000000-0000-4000-a000-000000000003','00000000-0000-4000-a000-000000000002','shopify','gid://shopify/ProductVariant/other');`);
  await db.exec(migration.replace("notify pgrst, 'reload schema';", ""));
  const add = async (id, soldAt, variantId = "gid://shopify/ProductVariant/57053091955066", productId = "gid://shopify/Product/16145627939194") => {
    await db.query("insert into vault_shopify_orders values($1,'shopify',$2,$3,null,$4)", [id, `gid://shopify/Order/${id.replaceAll('-', '')}`, soldAt, { test: false }]);
    await db.query("insert into vault_shopify_order_lines values(gen_random_uuid(),$1,$2,$3,1,4.95)", [id, productId, variantId]);
  };
  for (let i = 0; i < 8; i += 1) await add(`00000000-0000-4000-a000-0000000000${10 + i}`, `2026-08-${String(10 + i).padStart(2, "0")}T12:00:00Z`);
  await add("00000000-0000-4000-a000-000000000030", "2026-07-10T22:59:59Z");
  await add("00000000-0000-4000-a000-000000000031", "2026-09-06T00:00:00Z");
  await add("00000000-0000-4000-a000-000000000032", "2026-08-20T12:00:00Z", "gid://shopify/ProductVariant/other", "gid://shopify/Product/other");
  const rows = (await db.query("select direct_sale_time_cogs_gbp,evidence_method,total_direct_sale_time_cogs_gbp from vault_historical_vaultcare_service_treatment_line_attributions order by sale_timestamp")).rows;
  assert.equal(rows.length, 8);
  assert.ok(rows.every(row => row.direct_sale_time_cogs_gbp === "0.00" && row.total_direct_sale_time_cogs_gbp === "0.00" && row.evidence_method === "HISTORICAL_OWNER_ATTESTED_NO_DIRECT_COGS_AT_SALE"));
  await assert.rejects(db.query("update vault_historical_service_treatment_evidence set product_title='other'"), /immutable/);
});
