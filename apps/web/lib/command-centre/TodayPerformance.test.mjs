import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../../../../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260909000000_shopify_verified_coverage_forecast.sql", root), "utf8");
const component = await readFile(new URL("../../components/command-centre/CommandCentreCockpit.tsx", import.meta.url), "utf8");

async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table vault_shopify_orders(id uuid primary key, source text, shopify_order_id text, shopify_created_at timestamptz, cancelled_at timestamptz, currency text, net_revenue numeric, metadata jsonb, synced_at timestamptz);
    create table vault_shopify_order_sync_runs(id uuid primary key, sync_mode text, sync_days integer, orders_synced integer, order_lines_synced integer, created_from timestamptz, created_before timestamptz, started_at timestamptz, completed_at timestamptz, created_at timestamptz);`);
  await db.exec(migration);
  await db.query(`insert into vault_shopify_order_sync_runs values ('00000000-0000-0000-0000-000000000001','historical_orders_by_created_at',180,0,0,'2026-05-01T00:00:00Z','2026-12-01T00:00:00Z','2026-09-01T12:00:00Z','2026-09-01T12:00:00Z','2026-09-01T12:00:00Z')`);
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
    await db.query("delete from vault_shopify_order_sync_runs");
    await db.query(`insert into vault_shopify_order_sync_runs values ('00000000-0000-0000-0000-000000000002','historical_orders_by_created_at',21,0,0,'2026-06-13T23:00:00Z','2026-06-28T23:00:00Z','2026-09-01T12:00:00Z','2026-09-01T12:00:00Z','2026-09-01T12:00:00Z')`);
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

test("counts a covered zero-order weekday, but never an uncovered one", async () => {
  const { db, add } = await database();
  try {
    for (const date of ["2026-06-07", "2026-06-14", "2026-06-21"]) await add(`${date}T09:00:00Z`, 100);
    const before = (await db.query("select * from get_shopify_today_performance('2026-07-05T12:00:00Z')")).rows[0];
    assert.equal(Number(before.baseline_sample_count), 8); // Covered Sundays with no rows are genuine £0 days.
    await db.query("delete from vault_shopify_order_sync_runs");
    await db.query(`insert into vault_shopify_order_sync_runs values ('00000000-0000-0000-0000-000000000002','historical_orders_by_created_at',1,0,0,'2026-06-06T23:00:00Z','2026-06-27T23:00:00Z','2026-09-01T12:00:00Z','2026-09-01T12:00:00Z','2026-09-01T12:00:00Z')`);
    const after = (await db.query("select * from get_shopify_today_performance('2026-07-05T12:00:00Z')")).rows[0];
    assert.equal(Number(after.baseline_sample_count), 3);
    assert.equal(after.availability, "unavailable");
  } finally { await db.close(); }
});

test("forecast excludes 3 May, uses only the latest twelve, rejects mixed currency, and requires every weekday", async () => {
  const { db, add } = await database();
  try {
    for (let index = 0; index < 13; index += 1) {
      const date = new Date(Date.UTC(2026, 4, 3 + index * 7)).toISOString().slice(0, 10);
      await add(`${date}T09:00:00Z`, index === 0 ? 999 : 100);
    }
    for (let weekday = 1; weekday <= 6; weekday += 1) {
      for (let week = 0; week < 4; week += 1) {
        const date = new Date(Date.UTC(2026, 7, 3 + weekday - 1 + week * 7)).toISOString().slice(0, 10);
        await add(`${date}T09:00:00Z`, 100);
      }
    }
    const row = (await db.query("select * from get_shopify_seven_day_forecast('2026-08-30T12:00:00Z')")).rows[0];
    assert.equal(row.availability, "available");
    assert.equal(Number(row.maximum_sample_count), 12);
    await add("2026-08-23T09:00:00Z", 10, { currency: "EUR" });
    const mixed = (await db.query("select * from get_shopify_seven_day_forecast('2026-08-30T12:00:00Z')")).rows[0];
    const samples = (await db.query("select business_date from get_shopify_verified_weekday_samples('2026-08-30T12:00:00Z', 0)")).rows;
    assert.ok(!samples.some((sample) => sample.business_date === "2026-08-23"));
    assert.equal(mixed.availability, "available");
    await db.query("delete from vault_shopify_order_sync_runs");
    await db.query(`insert into vault_shopify_order_sync_runs values ('00000000-0000-0000-0000-000000000009','historical_orders_by_created_at',1,0,0,'2026-08-20T23:00:00Z','2026-08-23T23:00:00Z','2026-09-01T12:00:00Z','2026-09-01T12:00:00Z','2026-09-01T12:00:00Z')`);
    const insufficient = (await db.query("select * from get_shopify_seven_day_forecast('2026-08-30T12:00:00Z')")).rows[0];
    assert.equal(insufficient.availability, "unavailable");
  } finally { await db.close(); }
});

test("uses the matching London local clock time across DST", async () => {
  const { db, add } = await database();
  try {
    await db.query("delete from vault_shopify_order_sync_runs");
    for (const [id, from, before] of [["3", "2026-09-05T23:00:00Z", "2026-09-06T23:00:00Z"], ["4", "2026-09-12T23:00:00Z", "2026-09-13T23:00:00Z"], ["5", "2026-09-19T23:00:00Z", "2026-09-20T23:00:00Z"], ["6", "2026-09-26T23:00:00Z", "2026-09-27T23:00:00Z"]]) {
      await db.query("insert into vault_shopify_order_sync_runs values ($1,'historical_orders_by_created_at',1,0,0,$2,$3,'2026-09-01T12:00:00Z','2026-09-01T12:00:00Z','2026-09-01T12:00:00Z')", [`00000000-0000-0000-0000-00000000000${id}`, from, before]);
    }
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

test("cards retain Today’s Performance and add Forecast immediately after it", () => {
  assert.ok(component.indexOf("<ProfitTodayCard data={data} />") < component.indexOf("<TodayPerformanceCard data={data} />"));
  assert.ok(component.indexOf("<TodayPerformanceCard data={data} />") < component.indexOf("<SevenDayForecastCard data={data} />"));
  for (const text of ["Today’s Performance", "Ahead of pace", "On pace", "Behind pace", "Projected revenue", "Historical AOV", "matching weekdays · Europe/London"]) assert.ok(component.includes(text));
});
