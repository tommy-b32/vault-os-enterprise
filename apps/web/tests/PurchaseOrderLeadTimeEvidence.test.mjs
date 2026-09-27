import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../../../supabase/migrations/20261050000000_governed_purchase_order_lead_time_evidence.sql", import.meta.url), "utf8");
const id = (value) => `00000000-0000-0000-0000-${String(value).padStart(12, "0")}`;

test("ordered purchase orders capture immutable governed supplier lead-time evidence", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.vault_operators (id uuid primary key, is_active boolean not null);
      create table public.vault_suppliers (id uuid primary key, is_active boolean not null, default_lead_time_days integer);
      create table public.vault_purchase_orders (id uuid primary key, supplier_id uuid not null references public.vault_suppliers(id), status text not null, ordered_by_operator_id uuid references public.vault_operators(id), ordered_at timestamptz, received_at timestamptz);
      insert into public.vault_operators values ('${id(1)}', true), ('${id(2)}', false);
      insert into public.vault_suppliers values ('${id(11)}', true, 10), ('${id(12)}', true, null), ('${id(13)}', true, 0), ('${id(14)}', false, 10), ('${id(15)}', true, -1);
      insert into public.vault_purchase_orders values ('${id(101)}', '${id(11)}', 'approved', null, null, null), ('${id(102)}', '${id(11)}', 'draft', null, null, null), ('${id(103)}', '${id(12)}', 'approved', null, null, null), ('${id(104)}', '${id(13)}', 'approved', null, null, null), ('${id(105)}', '${id(14)}', 'approved', null, null, null), ('${id(106)}', '${id(11)}', 'cancelled', null, null, null), ('${id(108)}', '${id(15)}', 'approved', null, null, null);
    `);
    await db.exec(migration);

    const ordered = await db.query(`select * from public.mark_vault_purchase_order_ordered('${id(101)}', '${id(1)}')`);
    assert.equal(ordered.rows[0].transitioned, true);
    const evidence = await db.query(`select supplier_id, expected_lead_time_days, source_field from public.vault_purchase_order_expected_lead_time_evidence where purchase_order_id='${id(101)}'`);
    assert.deepEqual(evidence.rows, [{ supplier_id: id(11), expected_lead_time_days: 10, source_field: "vault_suppliers.default_lead_time_days" }]);
    await db.exec(`update public.vault_suppliers set default_lead_time_days = 7 where id='${id(11)}'`);
    assert.equal((await db.query(`select expected_lead_time_days from public.vault_purchase_order_expected_lead_time_evidence where purchase_order_id='${id(101)}'`)).rows[0].expected_lead_time_days, 10);
    assert.equal((await db.query(`select transitioned from public.mark_vault_purchase_order_ordered('${id(101)}', '${id(1)}')`)).rows[0].transitioned, false);

    for (const po of [id(103), id(104), id(105), id(108), id(102), id(106)]) {
      await assert.rejects(() => db.query(`select * from public.mark_vault_purchase_order_ordered('${po}', '${id(1)}')`));
    }
    assert.equal((await db.query(`select count(*)::int as count from public.vault_purchase_order_expected_lead_time_evidence where purchase_order_id in ('${id(102)}','${id(103)}','${id(104)}','${id(105)}','${id(106)}','${id(108)}')`)).rows[0].count, 0);
    await assert.rejects(() => db.exec(`update public.vault_purchase_orders set status='ordered', ordered_by_operator_id='${id(1)}', ordered_at=clock_timestamp() where id='${id(103)}'`));
    await assert.rejects(() => db.exec(`update public.vault_purchase_order_expected_lead_time_evidence set expected_lead_time_days=9 where purchase_order_id='${id(101)}'`));
    await assert.rejects(() => db.exec(`delete from public.vault_purchase_order_expected_lead_time_evidence where purchase_order_id='${id(101)}'`));

    await db.exec(`insert into public.vault_purchase_orders values ('${id(107)}', '${id(11)}', 'ordered', '${id(1)}', clock_timestamp() - interval '2 days', null)`);
    await assert.rejects(() => db.query(`select * from public.mark_vault_purchase_order_ordered('${id(107)}', '${id(1)}')`));
    await db.exec(`update public.vault_purchase_orders set received_at=ordered_at + interval '2 days' where id='${id(101)}'`);
    const elapsed = await db.query(`select extract(epoch from received_at - ordered_at) / 86400 as elapsed_days from public.vault_purchase_orders where id='${id(101)}'`);
    assert.equal(Number(elapsed.rows[0].elapsed_days), 2);
    assert.equal((await db.query(`select count(*)::int as count from public.vault_purchase_order_expected_lead_time_evidence where purchase_order_id='${id(101)}'`)).rows[0].count, 1);
  } finally {
    await db.close();
  }
});
