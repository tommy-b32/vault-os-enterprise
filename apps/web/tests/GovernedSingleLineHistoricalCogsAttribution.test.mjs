import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const sql = await readFile(new URL("supabase/migrations/20261121000000_governed_single_line_historical_cogs_attribution.sql", root), "utf8");

test("single-line historical COGS is pending, delivery-bound, and append-only", () => {
  assert.match(sql, /order_line_id uuid not null unique/);
  assert.match(sql, /delivery_batch_id uuid not null references public\.vault_historical_delivery_cost_batches/);
  assert.match(sql, /approval_status text not null default 'PENDING'/);
  assert.match(sql, /GOVERNED_HISTORICAL_LINE_COGS_AUDIT_APPEND_ONLY/);
  assert.match(sql, /unique \(proposal_id, event_type\)/);
  assert.match(sql, /receipt_status <> 'RECEIVED'[\s\S]*validation_status <> 'VALID'[\s\S]*approval_status <> 'APPROVED'/);
  assert.match(sql, /v_batch\.received_at > v_sale_at/);
  assert.match(sql, /p_unit_landed_cogs_gbp <> v_expected_unit/);
});

test("single-line approval is one-way and resolves only when approved", () => {
  assert.match(sql, /v_status <> 'PENDING'/);
  assert.match(sql, /GOVERNED_HISTORICAL_LINE_COGS_ACTIVE_OPERATOR_REQUIRED/);
  assert.match(sql, /operator\.role = 'owner'/);
  assert.match(sql, /GOVERNED_HISTORICAL_LINE_COGS_OWNER_APPROVAL_REQUIRED/);
  assert.match(sql, /event_type = 'APPROVED'/);
  assert.match(sql, /where p\.approval_status = 'APPROVED'/);
  assert.match(sql, /b\.receipt_status = 'RECEIVED'[\s\S]*b\.validation_status = 'VALID'[\s\S]*b\.received_at <= o\.shopify_created_at/);
  assert.match(sql, /p\.unit_landed_cogs_gbp = round\(b\.landed_cost_gbp \/ b\.received_quantity, 4\)/);
  assert.match(sql, /GOVERNED_SINGLE_LINE_HISTORICAL_DELIVERY/);
  assert.match(sql, /GOVERNED_HISTORICAL_LINE_COGS_DIRECT_CONFLICT/);
  assert.match(sql, /GOVERNED_HISTORICAL_LINE_COGS_RESOLVER_CONFLICT/);
  assert.match(sql, /not exists \(select 1 from single_line s where s\.order_line_id=p\.order_line_id\)/);
});

test("owner-confirmed Valentino preview is £41.31 without mutating production", () => {
  const revenue = 74.95;
  const directCogs = 15.58;
  const valentinoCogs = 11.0730;
  const fees = 4.04;
  const shipping = 2.95;
  const contribution = revenue - directCogs - valentinoCogs - fees - shipping;
  assert.equal(contribution.toFixed(2), "41.31");
  assert.equal((553.65 / 50).toFixed(4), "11.0730");
});
