import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260917000000_shopify_variant_images.sql", root), "utf8");
const container = `vault-variant-image-${process.pid}`;
let started = false;

function docker(args, input) {
  const result = spawnSync("docker", args, { input, encoding: "utf8" });
  if (result.status) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

function sql(statement) {
  return docker(["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "variant_images", "-t", "-A"], statement);
}

test("variant-image migration adds a nullable column without rewriting existing rows", async (t) => {
  t.after(() => { if (started) docker(["rm", "-f", container]); });
  docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=x", "-e", "POSTGRES_DB=variant_images", "postgres:17"]);
  started = true;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { sql("select 1"); break; } catch (error) { if (attempt === 39) throw error; await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  sql("create table public.vault_variants(id text primary key, source text not null, source_variant_id text not null, title text not null); insert into public.vault_variants values ('variant-1','shopify','gid://shopify/ProductVariant/1','Existing');");
  sql(migration);
  assert.equal(sql("select is_nullable || '|' || data_type from information_schema.columns where table_schema='public' and table_name='vault_variants' and column_name='shopify_image_url'"), "YES|text");
  assert.equal(sql("select title || '|' || coalesce(shopify_image_url, 'NULL') from public.vault_variants where id='variant-1'"), "Existing|NULL");
});
