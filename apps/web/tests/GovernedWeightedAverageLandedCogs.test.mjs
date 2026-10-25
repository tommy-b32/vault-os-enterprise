import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migration = new URL("../../../supabase/migrations/20261103000000_governed_weighted_average_landed_cogs.sql", import.meta.url);

test("weighted-average COGS migration is sale-time governed and fail closed", async () => {
  const sql = await readFile(migration, "utf8");
  for (const text of [
    "vault_historical_delivery_cost_batches",
    "vault_governed_cost_pool_cutovers",
    "vault_historical_weighted_average_cogs_overrides",
    "received_at>sale.sale_at then 'POST_SALE'",
    "receipt_status<>'RECEIVED'",
    "validation_status<>'VALID'",
    "approval_status<>'APPROVED'",
    "POST_CUTOVER_HISTORICAL_SOURCE",
    "goods_cost_gbp + inbound_shipping_gbp + other_direct_landed_gbp",
    "unique (linked_purchase_order_receipt_id)",
    "NO_GOVERNED_COST_CLASS_AT_SALE",
  ]) assert.match(sql, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
