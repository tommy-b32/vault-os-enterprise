import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../../supabase/migrations/20261021000000_b7g_governed_size_demand_availability_evidence.sql", import.meta.url), "utf8");

test("B7G source contract preserves factual B7D/B7F grain, London dates, and unknown-vs-zero", () => {
  assert.match(migration, /create view public\.vault_governed_size_availability_member_location_daily/);
  assert.match(migration, /availability\.canonical_mapping_status = 'resolved'/);
  assert.match(migration, /availability\.available > 0 then 'positive'[\s\S]*?available = 0 then 'zero'[\s\S]*?else 'negative'/);
  assert.match(migration, /\(demand\.ordered_at at time zone 'Europe\/London'\)::date/);
  assert.match(migration, /from public\.vault_governed_size_demand_evidence demand/);
  assert.match(migration, /from public\.vault_governed_size_availability_member_location_daily availability/);
  assert.match(migration, /count\(distinct availability\.shopify_location_id\)/);
  assert.match(migration, /count\(\*\)::integer as observed_member_location_row_count/);
  assert.match(migration, /sum\(demand\.net_retained_units\)[\s\S]*?from public\.vault_governed_size_demand_evidence demand[\s\S]*?group by 1, 2, 3, 4/, "demand aggregates before the availability join");
  assert.match(migration, /sum\(availability\.observed_signed_available\)[\s\S]*?from public\.vault_governed_size_availability_member_location_daily availability[\s\S]*?group by 1, 2, 3, 4/, "availability aggregates independently before the join");
  assert.match(migration, /full outer join availability_daily/);
  assert.match(migration, /when demand\.operational_date is not null and availability\.operational_date is not null then 'governed_comparable'/);
  assert.match(migration, /when demand\.operational_date is not null then 'availability_unknown'/);
  assert.match(migration, /else 'availability_only'/);
  assert.match(migration, /observed_signed_available_total/);
  assert.match(migration, /availability\.observed_signed_available_total,/ , "unknown availability remains NULL because only demand metrics are coalesced");
  assert.match(migration, /coalesce\(demand\.net_retained_units, 0\)/);
  assert.match(migration, /financially_qualified_net_retained_units/);
  assert.doesNotMatch(migration, /as in_stock|as out_of_stock|availability_percentage|lost_sales|reorder_recommendation|forecast_/i);
  assert.doesNotMatch(migration, /insert into|update |delete from|create table|materialized view/i);
});
