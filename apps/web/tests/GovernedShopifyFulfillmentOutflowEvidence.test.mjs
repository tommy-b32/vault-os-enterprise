import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql=readFileSync(new URL('../../../supabase/migrations/20261075000000_governed_shopify_fulfillment_outflow_evidence.sql',import.meta.url),'utf8');
test('75000 is additive immutable Shopify fulfillment evidence only',()=>{
  for(const token of ['vault_shopify_fulfillment_outflow_capture_completeness_observations','vault_shopify_fulfillment_observations','vault_shopify_fulfillment_line_observations','vault_shopify_fulfillment_event_observations','record_shopify_fulfillment_outflow_evidence','FULFILLMENT_VARIANT_IDENTITY_UNAVAILABLE','FULFILLMENT_CAPTURE_COUNT_MISMATCH'])assert.ok(sql.includes(token));
  assert.doesNotMatch(sql,/insert into public\.vault_governed_inventory_cost_lots|insert into public\.vault_shopify_refund|update public\.vault_governed_inventory_cost_lots/i);
});
test('75000 implements explicit three-way source-version handling before insert',()=>{
  assert.match(sql,/for update[\s\S]*if existing_id is not null then[\s\S]*existing_fingerprint= c\.source_content_fingerprint then return existing_id[\s\S]*FULFILLMENT_SOURCE_VERSION_CONFLICT[\s\S]*insert into public\.vault_shopify_fulfillment_outflow_capture/);
  assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\([\s\S]*75000\)\)/);
});
test('75000 preserves nullable lifecycle fields but fails closed on inventory identity and incomplete pagination payloads',()=>{
  assert.match(sql,/in_transit_at timestamptz,/); assert.match(sql,/delivered_at timestamptz,/); assert.match(sql,/shopify_location_id text,/);
  assert.match(sql,/not coalesce\(c\.fulfillment_lines_complete,false\)/); assert.match(sql,/shopify_variant_id',''\) is null/); assert.match(sql,/shopify_inventory_item_id',''\) is null/);
  assert.match(sql,/before update or delete/); assert.match(sql,/enable row level security/);
});
test('75000 retains relational parentage for every fulfillment line and event',()=>{
  assert.match(sql,/foreign key \(capture_id,shopify_fulfillment_id\)[\s\S]*references public\.vault_shopify_fulfillment_observations\(capture_id,shopify_fulfillment_id\)/);
  assert.match(sql,/shopify_variant_id text not null check/);
  assert.match(sql,/shopify_inventory_item_id text not null check/);
});
