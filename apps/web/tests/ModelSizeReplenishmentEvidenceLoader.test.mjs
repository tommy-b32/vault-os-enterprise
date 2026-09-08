import assert from "node:assert/strict";
import test from "node:test";
import {
  MODEL_SIZE_REPLENISHMENT_EVIDENCE_FIELDS,
  loadModelSizeReplenishmentEvidenceFrom,
} from "../lib/model-size-replenishment-evidence.ts";

const fields = ["model_size_id","style_id","parent_product_id","model_design","normalized_size","available_stock","committed_stock","incoming_stock","net_available_stock","sales_7_day_units","sales_14_day_units","sales_30_day_units","average_daily_sales","last_sale_date","days_since_last_sale","inventory_freshness","order_history_freshness","sales_history_30_complete","style_sales_mapping_complete","style_unresolved_clean_sales_units","global_sales_mapping_complete","global_unresolved_clean_sales_units","global_unmatched_clean_sales_units","trusted","missing_requirements"];
const row = (overrides = {}) => ({ model_size_id:"p::Alpha::XL", style_id:"p::Alpha", parent_product_id:"00000000-0000-0000-0000-000000000001", model_design:"Alpha", normalized_size:"XL", available_stock:8, committed_stock:3, incoming_stock:2, net_available_stock:7, sales_7_day_units:null, sales_14_day_units:null, sales_30_day_units:null, average_daily_sales:null, last_sale_date:null, days_since_last_sale:null, inventory_freshness:null, order_history_freshness:null, sales_history_30_complete:false, style_sales_mapping_complete:false, style_unresolved_clean_sales_units:2, global_sales_mapping_complete:false, global_unresolved_clean_sales_units:12, global_unmatched_clean_sales_units:9, trusted:false, missing_requirements:["sales_history_unavailable"], ...overrides });
const client = (data, error = null) => ({ from: (relation) => ({ select: async (columns) => { assert.equal(relation,"vault_model_size_replenishment_intelligence"); assert.equal(columns,fields.join(", ")); return { data, error }; } }) });

test("loader preserves the exact 25-field database contract and nullable evidence", async () => {
  assert.deepEqual(MODEL_SIZE_REPLENISHMENT_EVIDENCE_FIELDS, fields);
  const result = await loadModelSizeReplenishmentEvidenceFrom(client([row()]));
  assert.deepEqual(result[0], row());
  assert.equal(result[0].trusted, false);
  assert.deepEqual(result[0].missing_requirements,["sales_history_unavailable"]);
  assert.deepEqual([result[0].global_sales_mapping_complete,result[0].global_unresolved_clean_sales_units,result[0].global_unmatched_clean_sales_units],[false,12,9]);
});

test("loader retains distinct sizes, models, and Default without option fallback or deduplication", async () => {
  const result = await loadModelSizeReplenishmentEvidenceFrom(client([row(),row({model_size_id:"p::Alpha::L",normalized_size:"L"}),row({model_size_id:"p::Beta::XL",style_id:"p::Beta",model_design:"Beta"}),row({model_size_id:"q::Default::M",style_id:"q::Default",parent_product_id:"00000000-0000-0000-0000-000000000002",model_design:"Default",normalized_size:"M"})]));
  assert.equal(result.length,4);
  assert.deepEqual(result.map((entry)=>entry.model_size_id),["p::Alpha::XL","p::Alpha::L","p::Beta::XL","q::Default::M"]);
});

test("loader fails closed for duplicate evidence IDs and query errors", async () => {
  await assert.rejects(()=>loadModelSizeReplenishmentEvidenceFrom(client([row(),row()])),/Duplicate model-size evidence ID/);
  await assert.rejects(()=>loadModelSizeReplenishmentEvidenceFrom(client(null,{message:"view unavailable"})),/view unavailable/);
});
