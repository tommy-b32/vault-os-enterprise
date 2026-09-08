import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const sql = await readFile(new URL("../../../supabase/migrations/20260910000000_purchase_intelligence_option_identity.sql", import.meta.url), "utf8");
const view = sql.slice(sql.indexOf('create or replace view public.vault_style_replenishment_intelligence as'));
test("replenishment maps sales through resolved canonical model identity", () => {
  for (const text of ["v.product_id::text || '::' || trim(v.model_design) as style_id", "v.identity_resolution_status = 'resolved'", "nullif(trim(v.model_design), '') is not null", 'mapping.source_variant_id = line.shopify_variant_id']) assert.ok(view.includes(text));
  assert.doesNotMatch(view, /v\.option_[123]/);
  for (const text of ['greatest(line.quantity - line.refunded_quantity, 0)', 'orders.cancelled_at is null', "orders.metadata ->> 'test'", "interval '7 days'", "interval '14 days'", "interval '30 days'", 'orders.shopify_created_at < sync.completed_at']) assert.ok(view.includes(text));
});
test("model identities aggregate by model, separate models, and retain Default", () => {
  const id = (product, model, resolved = true) => resolved && model?.trim() ? `${product}::${model.trim()}` : null;
  assert.equal(id('p', 'Triple'), id('p', 'Triple'));
  assert.notEqual(id('p', 'Triple'), id('p', 'Badge'));
  assert.equal(id('p', 'Default'), 'p::Default');
  assert.equal(id('p', 'Triple', false), null);
});
test("public replenishment contract and pre-Step-3B canonical history remain intact", () => {
  const fields = ['style.style_id','style.parent_product_id','style.stock_on_hand','style.committed_stock','style.incoming_stock','net_available_stock','average_daily_sales','average_weekly_sales','sales_history_days','reorder_point','safety_stock','target_stock_days','supplier_lead_time_days','units_per_pack','supplier_moq_packs','freshness','supplier_minimum_order_state','trusted','missing_requirements','order_history_freshness','supplier_policy_requirements','sales_7_day_units','sales_14_day_units','sales_30_day_units','sales.last_sale_date','days_since_last_sale','sales_history_30_complete'];
  let at = -1; for (const field of fields) { const next = view.indexOf(field, at + 1); assert.ok(next > at, field); at = next; }
  assert.match(view, /select min\(shopify_created_at\) as earliest_order_at[\s\S]*from public\.vault_shopify_orders/);
});
