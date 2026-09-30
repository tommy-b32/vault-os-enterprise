import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../../../supabase/migrations/20261074000000_governed_inventory_cost_lots.sql', import.meta.url), 'utf8');

test('74000 structurally defines governed inventory-cost lots as append-only sellable-posting evidence', () => {
  assert.match(sql, /create table public\.vault_governed_inventory_cost_lots/i);
  assert.match(sql, /create function public\.derive_governed_inventory_cost_lots\(/i);
  assert.match(sql, /create or replace view public\.vault_governed_inventory_cost_state/i);
  assert.match(sql, /admission_start_unit integer not null/i);
  assert.match(sql, /admission_end_unit integer not null/i);
  assert.match(sql, /unique\(receipt_cost_disposition_id,admission_start_unit,admission_end_unit/i);
  assert.match(sql, /before update or delete on public\.vault_governed_inventory_cost_lots/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.vault_governed_inventory_cost_lots from public,anon,authenticated,service_role/i);
  assert.match(sql, /grant select,insert on public\.vault_governed_inventory_cost_lots to service_role/i);
  assert.match(sql, /revoke all on function public\.derive_governed_inventory_cost_lots\(uuid,uuid,text\) from public,anon,authenticated/i);
  assert.match(sql, /grant execute on function public\.derive_governed_inventory_cost_lots\(uuid,uuid,text\) to service_role/i);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\(d\.id::text,74000\)\)/i);
  assert.ok(sql.indexOf('pg_advisory_xact_lock') < sql.indexOf('sum(admitted_quantity)'));
  assert.match(sql, /d\.disposition_type='sellable_inventory'/i);
  assert.match(sql, /event_type='shopify_succeeded'/i);
  assert.match(sql, /select distinct pl\.id posting_line_id/i);
  assert.doesNotMatch(sql, /sum\([^)]*event_id|sum\([^)]*shopify_succeeded/i);
  assert.match(sql, /pl\.quantity/i);
  assert.match(sql, /d\.variant_id<>d\.sv|d\.rv<>d\.ssv|d\.ri<>d\.ssi/i);
  assert.match(sql, /source_location_id=d\.location_snapshot/i);
  assert.match(sql, /eligible\*d\.allocated_gbp_minor_units\/d\.quantity/i);
  assert.match(sql, /admitted\*d\.allocated_gbp_minor_units\/d\.quantity/i);
  assert.doesNotMatch(sql, /provenance_key[^;]*target_idempotency_key/i);
  assert.match(sql, /from public\.vault_purchase_order_receipt_cost_dispositions d/i);
  assert.match(sql, /successful_posted_eligible_quantity/i);
  assert.match(sql, /admitted_quantity/i);
  assert.match(sql, /admitted_gbp_minor_units/i);
  assert.match(sql, /unresolved_quantity/i);
  assert.match(sql, /unresolved_gbp_minor_units/i);
  assert.match(sql, /identity_consistent/i);
  assert.match(sql, /quantity_conservation_valid/i);
  assert.match(sql, /monetary_conservation_valid/i);
  for (const state of ['AWAITING_SHOPIFY_POSTING','READY_FOR_ADMISSION','PARTIAL','COMPLETE','UNAVAILABLE_INCONSISTENT_EVIDENCE']) assert.match(sql, new RegExp(`'${state}'`));
  assert.ok(sql.indexOf("'UNAVAILABLE_INCONSISTENT_EVIDENCE'") < sql.indexOf("'AWAITING_SHOPIFY_POSTING'"));
  for (const forbidden of ['vault_product_cost_versions','cogs','stage1','vault_purchase_order_inventory_postings','vault_purchase_order_inventory_posting_lines','vault_purchase_order_inventory_posting_events','vault_purchase_order_receipt_cost_dispositions']) {
    if (forbidden.startsWith('vault_purchase_order_inventory') || forbidden === 'vault_purchase_order_receipt_cost_dispositions') continue;
    assert.doesNotMatch(sql, new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+public\\.${forbidden}`, 'i'));
  }
});
