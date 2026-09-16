import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../../../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260930000000_style_trading_evidence_joined_recent_coverage.sql", root), "utf8");

async function database() {
  const db = new PGlite();
  await db.exec(`
    create table public.vault_shopify_order_sync_runs (
      id uuid primary key, sync_mode text not null, sync_days integer not null,
      orders_synced integer not null default 0, order_lines_synced integer not null default 0,
      created_from timestamptz, created_before timestamptz,
      started_at timestamptz not null default now(), completed_at timestamptz not null default now(), created_at timestamptz not null default now()
    );
    create table public.vault_products (id uuid primary key, source text, shopify_created_at timestamptz, shopify_online_store_published_at timestamptz);
    create table public.vault_variants (id uuid primary key, product_id uuid, source text, source_active boolean, identity_resolution_status text, model_design text, shopify_created_at timestamptz, source_variant_id text);
    create table public.vault_shopify_orders (id uuid primary key, shopify_created_at timestamptz, cancelled_at timestamptz, metadata jsonb);
    create table public.vault_shopify_order_lines (order_id uuid, shopify_variant_id text, quantity integer, refunded_quantity integer);
  `);
  await db.exec(migration);
  return db;
}

async function addStyle(db, id, liveAt) {
  const at = (await db.query(`select ${liveAt} as at`)).rows[0].at;
  await db.query(`insert into vault_products values ($1, 'shopify', $2, $2)`, [id, at]);
  await db.query(`insert into vault_variants values ($1, $2, 'shopify', true, 'resolved', $3, $4, $5)`, [id, id, `Style ${id.slice(-1)}`, at, `variant-${id}`]);
}

async function historical(db, from, before) {
  const bounds = (await db.query(`select ${from} as from_at, ${before} as before_at`)).rows[0];
  await db.query(`insert into vault_shopify_order_sync_runs (id,sync_mode,sync_days,created_from,created_before) values (gen_random_uuid(),'historical_orders_by_created_at',28,$1,$2)`, [bounds.from_at, bounds.before_at]);
}

async function recent(db, from, before, completed = "now()") {
  const bounds = (await db.query(`select ${from} as from_at, ${before} as before_at, ${completed} as completed_at`)).rows[0];
  await db.query(`insert into vault_shopify_order_sync_runs (id,sync_mode,sync_days,updated_from,updated_before,completed_at) values (gen_random_uuid(),'recent_orders_by_updated_at',7,$1,$2,$3)`, [bounds.from_at, bounds.before_at, bounds.completed_at]);
}

async function state(db, id) {
  return (await db.query(`select maturity_state, coverage_complete, order_evidence_fresh from vault_style_trading_evidence where parent_product_id = $1`, [id])).rows[0];
}

test("Trading Evidence joins only fresh, bounded recent coverage to historical coverage", async () => {
  const db = await database();
  try {
    const established = "00000000-0000-0000-0000-000000000001";
    await addStyle(db, established, "now() - interval '30 days'");
    await historical(db, "now() - interval '29 days'", "now() - interval '6 days'");
    await recent(db, "now() - interval '7 days'", "now() - interval '1 minute'");
    const joined = await state(db, established);
    assert.equal(joined.coverage_complete, true);
    assert.equal(joined.maturity_state, "SUFFICIENT_EVIDENCE");

    await db.query("delete from vault_shopify_order_sync_runs");
    await historical(db, "now() - interval '29 days'", "now() - interval '8 days'");
    await recent(db, "now() - interval '7 days'", "now() - interval '1 minute'");
    assert.equal((await state(db, established)).maturity_state, "UNKNOWN");

    await db.query("delete from vault_shopify_order_sync_runs");
    await historical(db, "now() - interval '29 days'", "now() - interval '6 days'");
    await recent(db, "now() - interval '7 days'", "now() - interval '1 minute'", "now() - interval '31 minutes'");
    assert.equal((await state(db, established)).maturity_state, "UNKNOWN");

    await db.query("delete from vault_shopify_order_sync_runs");
    await recent(db, "now() - interval '7 days'", "now() - interval '1 minute'");
    assert.equal((await state(db, established)).maturity_state, "UNKNOWN");
  } finally { await db.close(); }
});

test("new styles may learn from adequate bounded recent coverage, while zero sales still require coverage proof", async () => {
  const db = await database();
  try {
    const newStyle = "00000000-0000-0000-0000-000000000002";
    await addStyle(db, newStyle, "now() - interval '2 days'");
    await recent(db, "now() - interval '7 days'", "now() - interval '1 minute'");
    const learning = await state(db, newStyle);
    assert.equal(learning.coverage_complete, true);
    assert.equal(learning.maturity_state, "LEARNING");

    // No order or order-line rows exist: the state is valid only because the
    // persisted reconciliation range proves the zero-sales interval.
    await db.query("delete from vault_shopify_order_sync_runs");
    assert.equal((await state(db, newStyle)).maturity_state, "UNKNOWN");
  } finally { await db.close(); }
});
