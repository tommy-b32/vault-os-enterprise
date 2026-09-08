import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../../../supabase/migrations/20260912000000_canonical_model_size_replenishment_evidence.sql", import.meta.url), "utf8");
const contract = ['model_size_id','style_id','parent_product_id','model_design','normalized_size','available_stock','committed_stock','incoming_stock','net_available_stock','sales_7_day_units','sales_14_day_units','sales_30_day_units','average_daily_sales','last_sale_date','days_since_last_sale','inventory_freshness','order_history_freshness','sales_history_30_complete','style_sales_mapping_complete','style_unresolved_clean_sales_units','global_sales_mapping_complete','global_unresolved_clean_sales_units','global_unmatched_clean_sales_units','trusted','missing_requirements'];

function evidence(rows, lines, sync = 100) {
  const valid = rows.filter((r) => r.source === 'shopify' && r.variantId && r.status === 'resolved' && r.model?.trim() && r.size?.trim());
  const byId = new Map(valid.map((r) => [r.variantId, r]));
  const quality = lines.reduce((q, line) => {
    const row = byId.get(line.variantId);
    if (!row) {
      const field = rows.some((r) => r.variantId === line.variantId) ? 'unresolved' : 'unmatched';
      q[field] += Math.max(0, line.quantity - line.refunded);
    }
    return q;
  }, { unresolved: 0, unmatched: 0 });
  const grouped = new Map();
  for (const row of valid) {
    const key = `${row.product}::${row.model.trim()}::${row.size.trim()}`;
    const value = grouped.get(key) ?? { key, stock: 0, sales: 0 };
    value.stock += row.stock;
    for (const line of lines.filter((line) => line.variantId === row.variantId && !line.cancelled && !line.test && line.at >= 4 && line.at < sync)) value.sales += Math.max(0, line.quantity - line.refunded);
    grouped.set(key, value);
  }
  return { rows: [...grouped.values()], quality };
}

test("view uses resolved canonical model + size, row-per-size inventory, and the stable contract", () => {
  assert.match(sql, /create or replace view public\.vault_model_size_replenishment_intelligence as/);
  for (const text of ["v.identity_resolution_status='resolved'", "nullif(trim(v.model_design),'') is not null", "nullif(trim(v.normalized_size),'') is not null", 'i.variant_id=v.variant_id', 'v.source_variant_id=l.shopify_variant_id']) assert.ok(sql.includes(text));
  let at = -1; for (const field of contract) { const next = sql.indexOf(field, at + 1); assert.ok(next > at, field); at = next; }
  assert.doesNotMatch(sql, /option_[123]|\bsku\b|variant_title/i);
});

test("semantic layouts, Default, model isolation, multi-location stock, and zero-sale sizes are stable", () => {
  const rows = [
    { product:'p', model:'Triple', size:'XL', variantId:'a', source:'shopify', status:'resolved', stock:2 },
    { product:'p', model:'Triple', size:'XL', variantId:'b', source:'shopify', status:'resolved', stock:3 },
    { product:'p', model:'Triple', size:'L', variantId:'c', source:'shopify', status:'resolved', stock:4 },
    { product:'p', model:'Badge', size:'XL', variantId:'d', source:'shopify', status:'resolved', stock:9 },
    { product:'s', model:'Default', size:'XL', variantId:'e', source:'shopify', status:'resolved', stock:1 },
  ];
  const result = evidence(rows, [{variantId:'a',quantity:2,refunded:0,at:90},{variantId:'d',quantity:1,refunded:0,at:90}]);
  assert.deepEqual(result.rows.map((r) => r.key), ['p::Triple::XL','p::Triple::L','p::Badge::XL','s::Default::XL']);
  assert.equal(result.rows[0].stock, 5);
  assert.equal(result.rows.find((r) => r.key === 'p::Triple::L').sales, 0);
  assert.equal(result.rows.find((r) => r.key === 'p::Triple::XL').sales, 2);
  assert.equal(result.rows.find((r) => r.key === 'p::Badge::XL').sales, 1);
});

test("unresolved, blank, unmatched, refund, cancelled, test, and pre-clean sales fail closed", () => {
  const rows = [
    { product:'p', model:'Triple', size:'XL', variantId:'ok', source:'shopify', status:'resolved', stock:1 },
    { product:'p', model:null, size:'XL', variantId:'blank-model', source:'shopify', status:'resolved', stock:1 },
    { product:'p', model:'Triple', size:null, variantId:'blank-size', source:'shopify', status:'resolved', stock:1 },
    { product:'shoe', model:null, size:null, variantId:'shoe', source:'shopify', status:'unresolved', stock:1 },
    { product:'title', model:null, size:null, variantId:'title', source:'shopify', status:'unresolved', stock:1 },
  ];
  const result = evidence(rows, [
    {variantId:'ok',quantity:3,refunded:1,at:90}, {variantId:'ok',quantity:1,refunded:1,at:90},
    {variantId:'ok',quantity:1,refunded:0,at:3}, {variantId:'ok',quantity:1,refunded:0,at:90,cancelled:true}, {variantId:'ok',quantity:1,refunded:0,at:90,test:true},
    {variantId:'shoe',quantity:2,refunded:0,at:90}, {variantId:'title',quantity:1,refunded:0,at:90}, {variantId:null,quantity:4,refunded:0,at:90},
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].sales, 2);
  assert.deepEqual(result.quality, { unresolved: 3, unmatched: 4 });
  for (const text of ["o.cancelled_at is null", "o.metadata->>'test'", "('2026-05-04 00:00:00'::timestamp at time zone 'Europe/London')", "interval '7 days'", "interval '14 days'", "interval '30 days'", 'max(shopify_created_at) filter(where net_units>0)', 'style_sales_mapping_incomplete', 'global_sales_mapping_complete']) assert.ok(sql.includes(text));
});

test("safe ownership scopes unresolved sales to one parent without attributing a model or size", () => {
  const classify = (variants, variantId) => {
    const matches = variants.filter((variant) => variant.variantId === variantId);
    const parents = new Set(matches.map((variant) => variant.product));
    const canonical = matches.filter((variant) => variant.resolved && variant.model && variant.size && matches.length === 1);
    if (canonical.length === 1) return { state: 'resolved', parent: canonical[0].product };
    if (parents.size === 1) return { state: 'known_parent_unresolved', parent: [...parents][0] };
    return matches.length ? { state: 'global_unresolved', parent: null } : { state: 'unmatched', parent: null };
  };
  const variants = [
    { variantId: 'canonical', product: 'apparel', resolved: true, model: 'Triple', size: 'XL' },
    { variantId: 'same-parent', product: 'apparel', resolved: false, model: null, size: null },
    { variantId: 'duplicate-same', product: 'apparel', resolved: false, model: null, size: null },
    { variantId: 'duplicate-same', product: 'apparel', resolved: false, model: null, size: null },
    { variantId: 'duplicate-cross', product: 'one', resolved: false, model: null, size: null },
    { variantId: 'duplicate-cross', product: 'two', resolved: false, model: null, size: null },
  ];
  assert.deepEqual(classify(variants, 'same-parent'), { state: 'known_parent_unresolved', parent: 'apparel' });
  assert.deepEqual(classify(variants, 'duplicate-same'), { state: 'known_parent_unresolved', parent: 'apparel' });
  assert.deepEqual(classify(variants, 'duplicate-cross'), { state: 'global_unresolved', parent: null });
  assert.deepEqual(classify(variants, null), { state: 'unmatched', parent: null });
  assert.match(sql, /safe_shopify_ownership[\s\S]*count\(distinct product_id\)=1/);
  assert.match(sql, /coalesce\(v\.parent_product_id,ownership\.parent_product_id\) parent_product_id/);
  assert.match(sql, /mapping_status='known_parent_unresolved'/);
});
