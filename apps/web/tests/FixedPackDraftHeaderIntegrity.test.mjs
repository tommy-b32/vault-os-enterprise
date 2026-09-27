import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../../../supabase/migrations/20261049000000_reconcile_fixed_pack_draft_headers.sql", import.meta.url), "utf8");
const id = (value) => `00000000-0000-0000-0000-${String(value).padStart(12, "0")}`;

test("fixed-pack draft headers reconcile from persisted lines and repair drafts only", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.vault_purchase_orders (id uuid primary key, status text not null, total_packs integer, estimated_total_gbp numeric);
      create table public.vault_purchase_order_lines (id uuid primary key, purchase_order_id uuid not null, source_recommendation_type text not null, recommended_packs integer not null check (recommended_packs > 0), line_cost_gbp numeric not null check (line_cost_gbp >= 0));
      insert into public.vault_purchase_orders values ('${id(1)}', 'draft', 1, 10), ('${id(2)}', 'approved', 1, 10), ('${id(3)}', 'draft', 999, 999);
      insert into public.vault_purchase_order_lines values ('${id(101)}', '${id(1)}', 'fixed_pack_purchase_recommendation', 3, 30), ('${id(102)}', '${id(2)}', 'fixed_pack_purchase_recommendation', 3, 30);
    `);
    await db.exec(migration);

    await db.exec(`insert into public.vault_purchase_order_lines values ('${id(103)}', '${id(3)}', 'fixed_pack_purchase_recommendation', 2, 25);`);
    await db.exec(`insert into public.vault_purchase_order_lines values ('${id(104)}', '${id(3)}', 'fixed_pack_purchase_recommendation', 1, 12.5);`);
    await db.exec(`update public.vault_purchase_orders set total_packs = 100, estimated_total_gbp = 1000 where id = '${id(3)}';`);
    await db.exec(`insert into public.vault_purchase_order_lines values ('${id(105)}', '${id(3)}', 'fixed_pack_purchase_recommendation', 2, 10);`);

    await assert.rejects(() => db.exec(`insert into public.vault_purchase_order_lines values ('${id(106)}', '${id(3)}', 'fixed_pack_purchase_recommendation', 0, 10);`));
    const { rows } = await db.query(`select id, status, total_packs, estimated_total_gbp::text as estimated_total_gbp from public.vault_purchase_orders order by id`);
    assert.deepEqual(rows, [
      { id: id(1), status: "draft", total_packs: 3, estimated_total_gbp: "30.00" },
      { id: id(2), status: "approved", total_packs: 1, estimated_total_gbp: "10" },
      { id: id(3), status: "draft", total_packs: 5, estimated_total_gbp: "47.50" },
    ]);
  } finally {
    await db.close();
  }
});
