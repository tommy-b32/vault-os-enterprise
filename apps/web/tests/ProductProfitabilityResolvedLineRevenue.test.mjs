import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const sql=await readFile(new URL('../../../supabase/migrations/20261042000000_product_profitability_resolved_line_revenue.sql',import.meta.url),'utf8');

test('profitability consumes only deterministic resolved line revenue',()=>{
  assert.match(sql,/join public\.vault_shopify_resolved_line_discount_evidence line_revenue/);
  assert.match(sql,/line_revenue\.resolved_net_line_revenue eligible_merchandise_revenue/);
  assert.match(sql,/line_revenue\.resolution_status in \('resolved_source_backed','canonical_fallback'\)/);
  assert.doesNotMatch(sql,/l\.net_line_revenue eligible_merchandise_revenue/);
});

test('Stage 1 contracts, reconciliation, and service-only access remain intact',()=>{
  assert.match(sql,/vault_shopify_verified_order_operational_contributions/);
  assert.match(sql,/vault_stage1_sold_line_cogs_resolutions resolved on resolved\.order_line_id=l\.id/);
  assert.match(sql,/canonical_net_revenue=d\.merchandise_revenue_basis\+d\.customer_shipping_revenue/);
  assert.match(sql,/grant select on public\.vault_shopify_verified_product_profitability_line_allocations,public\.vault_shopify_verified_product_profitability,public\.vault_shopify_product_profitability_coverage to service_role/);
});
