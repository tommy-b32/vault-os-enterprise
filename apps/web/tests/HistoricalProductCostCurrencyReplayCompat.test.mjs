import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const replayBaseline = new URL("../../../.temp/supabase-baseline-replay/supabase/migrations/20260714000000_vault_legacy_schema_baseline.sql", import.meta.url);
const compatibilitySource = new URL("./fixtures/replay-compat/20260721120000_historical_product_cost_currency_compat.sql", import.meta.url);
const stagedMigration = new URL("../../../.temp/supabase-baseline-replay/supabase/migrations/20260721120000_historical_product_cost_currency_compat.sql", import.meta.url);

const expectedColumns = [
  "product_id", "product_name", "product_type", "shopify_status", "supplier_id", "supplier_company",
  "inventory_strategy", "restock_enabled", "pack_profile", "currency", "exchange_rate_to_gbp",
  "pack_cost", "shipping_cost_per_pack", "import_cost_per_pack", "units_per_pack",
  "landed_cost_per_pack", "landed_cost_per_pack_gbp", "landed_cost_per_unit",
  "average_selling_price", "estimated_gross_profit_per_unit", "estimated_margin_percent",
  "estimated_return_on_pack_capital_percent", "commercial_cost_trusted", "missing_commercial_requirements",
  "last_supplier_price_update", "commercial_notes", "cost_created_at", "cost_updated_at",
];

test("replay historical currency compatibility restores the complete database/019 commercial shape", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create table vault_product_master (
      product_id uuid primary key, product_name text, product_type text, status text,
      supplier_id uuid, supplier_company text, inventory_strategy text,
      restock_enabled boolean, pack_profile text
    );
    create table vault_product_costs (
      product_id uuid primary key, currency text, pack_cost numeric(12,2),
      shipping_cost_per_pack numeric(12,2), import_cost_per_pack numeric(12,2),
      units_per_pack integer, average_selling_price numeric(12,2),
      last_supplier_price_update date, notes text, created_at timestamptz, updated_at timestamptz
    );
  `);
  const baselineSql = await readFile(replayBaseline, "utf8");
  const commercialStart = baselineSql.indexOf("create or replace view public.vault_product_commercial_intelligence as");
  const commercialEnd = baselineSql.indexOf("-- database/009_inventory_intelligence.sql", commercialStart);
  assert.ok(commercialStart >= 0 && commercialEnd > commercialStart, "replay baseline must contain the recovered database/017 commercial view");
  await db.exec(baselineSql.slice(commercialStart, commercialEnd));
  await db.exec(await readFile(compatibilitySource, "utf8"));

  const columns = (await db.query(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'vault_product_commercial_intelligence'
    order by ordinal_position
  `)).rows.map((row) => row.column_name);
  assert.deepEqual(columns, expectedColumns);

  const fx = (await db.query(`
    select data_type, numeric_precision, numeric_scale, column_default
    from information_schema.columns
    where table_schema = 'public' and table_name = 'vault_product_costs'
      and column_name = 'exchange_rate_to_gbp'
  `)).rows[0];
  assert.deepEqual(fx, {
    data_type: "numeric", numeric_precision: 12, numeric_scale: 6, column_default: "1",
  });

  await db.exec(`
    insert into vault_product_master values
      ('00000000-0000-0000-0000-000000000001', 'Product', 'physical', 'ACTIVE',
       '00000000-0000-0000-0000-000000000002', 'Supplier', 'stocked', true, 'tee_5_piece');
    insert into vault_product_costs (
      product_id, currency, exchange_rate_to_gbp, pack_cost, shipping_cost_per_pack,
      import_cost_per_pack, units_per_pack, average_selling_price, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000001', 'EUR', 0.8, 100, 10, 5, 5, 50, now(), now()
    );
  `);
  const commercial = (await db.query(`
    select exchange_rate_to_gbp, landed_cost_per_pack, landed_cost_per_pack_gbp,
      landed_cost_per_unit, commercial_cost_trusted
    from vault_product_commercial_intelligence
  `)).rows[0];
  assert.deepEqual(commercial, {
    exchange_rate_to_gbp: "0.800000", landed_cost_per_pack: "115.00",
    landed_cost_per_pack_gbp: "92.00", landed_cost_per_unit: "18.40",
    commercial_cost_trusted: true,
  });

  const stagedSql = await readFile(stagedMigration, "utf8");
  assert.match(stagedSql, /exchange_rate_to_gbp numeric\(12, 6\)/);
  assert.match(stagedSql, /landed_cost_per_pack_gbp/);
  assert.match(stagedSql, /notify pgrst, 'reload schema';/);
});
