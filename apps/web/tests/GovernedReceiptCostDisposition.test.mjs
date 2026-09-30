import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(
  new URL('../../../supabase/migrations/20261073000000_governed_receipt_cost_dispositions.sql', import.meta.url),
  'utf8',
);

test('governed receipt disposition writer has explicit, immutable core controls', () => {
  assert.match(sql, /create table public\.vault_purchase_order_receipt_cost_dispositions/i);
  assert.match(sql, /disposition_type text not null check\(disposition_type in\('sellable_inventory','non_sellable_writeoff'\)\)/i);
  assert.match(sql, /if r\.quantity_received>0 then/i);
  assert.match(sql, /'sellable_inventory',r\.quantity_received,amount/i);
  assert.match(sql, /if r\.non_sellable_quantity>0 then/i);
  assert.match(sql, /'non_sellable_writeoff',r\.non_sellable_quantity,amount/i);
  assert.doesNotMatch(sql, /foreach\s+part|part\s*=\s*r\.quantity_received/i);
  assert.match(sql, /GOVERNED_ALLOCATION_RUN_CHANGED_AFTER_DISPOSITION/);
  assert.match(sql, /r\.size_line_id<>r\.purchase_order_line_id/);
  assert.match(sql, /RECEIPT_SIZE_ALLOCATION_LINE_MISMATCH/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\(r\.purchase_order_line_id::text,73000\)\)/);
  assert.match(sql, /before update or delete/i);
  assert.match(sql, /revoke all on public\.vault_purchase_order_receipt_cost_dispositions from public,anon,authenticated,service_role; grant select,insert on public\.vault_purchase_order_receipt_cost_dispositions to service_role/i);
  assert.match(sql, /revoke all on function public\.derive_governed_purchase_order_receipt_cost_dispositions\(uuid,uuid,text\) from public,anon,authenticated; grant execute .* to service_role/i);
});

test('cumulative floor allocation supports independent sellable and writeoff intervals', () => {
  const allocation = (start, quantity, governedPence, orderedUnits) =>
    Math.floor(((start + quantity) * governedPence) / orderedUnits)
      - Math.floor((start * governedPence) / orderedUnits);

  const sellable = allocation(0, 1, 233815, 2);
  const writeoff = allocation(1, 1, 233815, 2);
  assert.equal(sellable + writeoff, 233815);
  assert.equal([sellable, writeoff].length, 2);
  assert.match(sql, /\(\(cursor_units\+r\.quantity_received\)\*r\.allocated_gbp_minor_units\/total_units\)-\(cursor_units\*r\.allocated_gbp_minor_units\/total_units\)/);
  assert.match(sql, /cursor_units:=cursor_units\+r\.quantity_received/);
  assert.match(sql, /\(\(cursor_units\+r\.non_sellable_quantity\)\*r\.allocated_gbp_minor_units\/total_units\)-\(cursor_units\*r\.allocated_gbp_minor_units\/total_units\)/);
});

test('trusted provenance is immutable-evidence derived, not caller-key derived', () => {
  assert.match(sql, /'ordered_unit_rank_cumulative_floor:v1:'\|\|r\.allocation_run_id\|\|':'\|\|r\.governed_line_id\|\|':'\|\|r\.receipt_allocation_id\|\|':sellable_inventory'/);
  assert.match(sql, /'ordered_unit_rank_cumulative_floor:v1:'\|\|r\.allocation_run_id\|\|':'\|\|r\.governed_line_id\|\|':'\|\|r\.receipt_allocation_id\|\|':non_sellable_writeoff'/);
  assert.doesNotMatch(sql, /provenance_key\s*\)[\s\S]*?target_idempotency_key/i);
});

test('read models retain authoritative lines and fail closed on receipt-cost conservation', () => {
  assert.match(sql, /create view public\.vault_purchase_order_governed_receipt_cost_state with \(security_invoker=true\)/i);
  assert.match(sql, /from public\.vault_purchase_order_lines l\s+left join public\.vault_purchase_order_line_size_allocations s/i);
  assert.match(sql, /left join current_allocation c on c\.purchase_order_id=l\.purchase_order_id and c\.purchase_order_line_id=l\.purchase_order_line_id/i);
  assert.match(sql, /UNAVAILABLE_MISSING_GOVERNED_ALLOCATION/);
  assert.match(sql, /UNAVAILABLE_RUN_MISMATCH/);
  assert.match(sql, /GOVERNED_ALLOCATION_RUN_CHANGED_AFTER_DISPOSITION/);
  assert.match(sql, /physical_received_units<>sellable_received_units\+non_sellable_received_units/);
  assert.match(sql, /disposition_quantity<>physical_received_units/);
  assert.match(sql, /governed_allocated_gbp_minor_units-total_disposition_gbp_minor_units/);
  assert.match(sql, /total_disposition_gbp_minor_units>governed_allocated_gbp_minor_units/);
  assert.match(sql, /'NO_RECEIPTS'/);
  assert.match(sql, /'PARTIAL'/);
  assert.match(sql, /'COMPLETE'/);
  assert.match(sql, /'UNAVAILABLE_INCONSISTENT_EVIDENCE'/);
});

test('whole-PO conservation is security-invoker, service-role-only, and fails closed', () => {
  assert.match(sql, /create view public\.vault_purchase_order_governed_receipt_cost_conservation with \(security_invoker=true\)/i);
  assert.match(sql, /from public\.vault_purchase_order_governed_receipt_cost_state\s+group by purchase_order_id/i);
  assert.match(sql, /count\(\*\) filter\(where readiness_status like 'UNAVAILABLE%'\)>0 then 'CONSERVATION_UNAVAILABLE_OR_INCONSISTENT'/i);
  assert.match(sql, /count\(\*\)=count\(\*\) filter\(where readiness_status='COMPLETE'\) then 'COMPLETE'/i);
  assert.match(sql, /revoke all on public\.vault_purchase_order_governed_receipt_cost_state,public\.vault_purchase_order_governed_receipt_cost_conservation from public,anon,authenticated;\s+grant select .* to service_role/i);
});
