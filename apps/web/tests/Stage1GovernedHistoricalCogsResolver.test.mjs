import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const root=new URL("../../../",import.meta.url);
const sql=await readFile(new URL("supabase/migrations/20261039000000_stage1_governed_historical_cogs_resolver.sql",root),"utf8");
test("Stage 1 historical resolver preserves precedence and fail-closed gates",()=>{
  assert.match(sql,/DIRECT_TRUSTED_SALE_TIME_COGS[\s\S]*POLICY_DERIVED_BATCH_AVERAGE[\s\S]*HISTORICAL_OWNER_ATTESTED_NO_DIRECT_COGS_AT_SALE/);
  assert.match(sql,/not exists \(select 1 from direct/);
  assert.match(sql,/candidate_count=1/);
  assert.match(sql,/vault_historical_policy_derived_cogs_line_attributions/);
  assert.match(sql,/vault_historical_vaultcare_service_treatment_line_attributions/);
  assert.match(sql,/array_remove\(b\.exclusion_reason_codes,'missing_or_untrusted_sold_line_cogs'\)/);
  assert.match(sql,/b\.shipping_label_count,b\.observed_purchased_label_cost_gbp/);
  assert.doesNotMatch(sql,/b\.label_count/);
  assert.doesNotMatch(sql,/vault_product_cost_versions/i);
});
