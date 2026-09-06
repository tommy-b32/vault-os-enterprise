import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../../../../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260908170000_shopify_today_performance.sql", root), "utf8");
const component = await readFile(new URL("../../components/command-centre/CommandCentreCockpit.tsx", import.meta.url), "utf8");

async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table vault_shopify_orders(id uuid primary key, source text, shopify_order_id text, shopify_created_at timestamptz, cancelled_at timestamptz, currency text, net_revenue numeric, metadata jsonb, synced_at timestamptz);`);
  await db.exec(migration);
  let sequence = 0;
  return { db, add: async (at, revenue, options = {}) => {
    sequence += 1;
    await db.query("insert into vault_shopify_orders values ($1,'shopify',$2,$3,$4,$5,$6,$7,$8)", [
      `00000000-0000-0000-0000-${String(sequence).padStart(12, "0")}`, `gid://shopify/Order/${sequence}`, at,
      options.cancelled ? at : null, options.currency ?? "GBP", revenue, JSON.stringify({ test: options.test ?? false }), options.syncedAt ?? "2026-09-01T12:00:00Z",
    ]);
  } };
}

test("uses the latest twelve valid matching weekdays, excludes 3 May, and projects from completion fractions", async () => {
  const { db, add } = await database();
  try {
    for (let index = 0; index < 13; index += 1) {
      const date = new Date(Date.UTC(2026, 4, 3 + index * 7)).toISOString().slice(0, 10);
      await add(`${date}T08:00:00Z`, index === 0 ? 999 : 20);
      await add(`${date}T16:00:00Z`, index === 0 ? 999 : 80);
    }
    await add("2026-08-02T08:00:00Z", 10);
    await add("2026-08-02T11:00:00Z", 20);
    await add("2026-08-02T16:00:00Z", 70);
    const row = (await db.query("select * from get_shopify_today_performance('2026-08-02T12:00:00Z')")).rows[0];
    assert.equal(row.availability, "available");
    assert.equal(Number(row.baseline_sample_count), 12);
    assert.equal(Number(row.today_revenue_gbp), 30);
    assert.equal(Number(row.expected_revenue_gbp), 20);
    assert.equal(Number(row.revenue_pace_percent), 150);
    assert.equal(Number(row.today_orders), 2);
    assert.equal(Number(row.expected_orders), 1);
    assert.equal(Number(row.today_aov_gbp), 15);
    assert.equal(Number(row.historical_aov_gbp), 20);
    assert.equal(Number(row.projected_revenue_gbp), 150);
  } finally { await db.close(); }
});

test("requires four samples and excludes test, cancelled, non-GBP and invalid completion days", async () => {
  const { db, add } = await database();
  try {
    for (let index = 1; index <= 3; index += 1) await add(`2026-06-${String(7 + index * 7).padStart(2, "0")}T09:00:00Z`, 100);
    await add("2026-06-07T09:00:00Z", 100, { test: true });
    await add("2026-06-07T09:00:00Z", 100, { cancelled: true });
    await add("2026-06-07T09:00:00Z", 100, { currency: "EUR" });
    const row = (await db.query("select * from get_shopify_today_performance('2026-07-05T12:00:00Z')")).rows[0];
    assert.equal(row.availability, "unavailable");
    assert.equal(Number(row.baseline_sample_count), 3);
    assert.equal(row.today_revenue_gbp, null);
  } finally { await db.close(); }
});

test("uses the matching London local clock time across DST", async () => {
  const { db, add } = await database();
  try {
    for (const date of ["2026-09-27", "2026-09-20", "2026-09-13", "2026-09-06"]) {
      await add(`${date}T10:45:00Z`, 25); // 11:45 BST: included before a 12:00 London cutoff.
      await add(`${date}T12:00:00Z`, 75); // 13:00 BST: excluded from the same-time baseline.
    }
    await add("2026-10-25T11:00:00Z", 25);
    const row = (await db.query("select * from get_shopify_today_performance('2026-10-25T12:00:00Z')")).rows[0];
    assert.equal(row.availability, "available");
    assert.equal(Number(row.expected_revenue_gbp), 25);
  } finally { await db.close(); }
});

test("card follows Profit Today and labels pace, projected revenue and baseline evidence", () => {
  assert.ok(component.indexOf("<ProfitTodayCard data={data} />") < component.indexOf("<TodayPerformanceCard data={data} />"));
  for (const text of ["Today’s Performance", "Ahead of pace", "On pace", "Behind pace", "Projected revenue", "Historical AOV", "matching weekdays · Europe/London"]) assert.ok(component.includes(text));
});
