import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const migrations = await Promise.all([
  "20261103000000_governed_weighted_average_landed_cogs.sql",
  "20261104000000_governed_historical_delivery_review_date_workflow.sql",
  "20261113000000_governed_historical_receipt_admission_controls.sql",
  "20261114000000_secure_governed_historical_receipt_rpcs.sql",
].map((file) => readFile(new URL(`supabase/migrations/${file}`, root), "utf8")));
const container = `vault-historical-receipt-security-${process.pid}`;
let started = false;
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function docker(args, input) { const result = spawnSync("docker", args, { input, encoding: "utf8" }); if (result.status) throw Error(result.stderr || result.stdout); return result.stdout.trim(); }
function sql(text) { return docker(["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "receipt_security", "-t", "-A"], text); }
function sqlFails(text) { const result = spawnSync("docker", ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "receipt_security", "-t", "-A"], { input: text, encoding: "utf8" }); assert.notEqual(result.status, 0, "operation was expected to fail"); return result.stderr; }

test("only guarded receipt RPCs can mutate governed evidence", async (t) => {
  t.after(() => { if (started) docker(["rm", "-f", container]); });
  docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=x", "-e", "POSTGRES_DB=receipt_security", "postgres:17"]); started = true;
  for (let i = 0; i < 40; i++) { try { sql("select 1"); break; } catch { if (i === 39) throw Error("database not ready"); await new Promise((resolve) => setTimeout(resolve, 250)); } }
  sql(`create extension pgcrypto; create role anon; create role authenticated; create role service_role;
    create table public.vault_operators(id uuid primary key, role text not null, is_active boolean not null);
    create table public.vault_suppliers(id uuid primary key);
    create table public.vault_historical_merchandise_classes(id text primary key);
    create table public.vault_purchase_orders(id uuid primary key);
    create table public.vault_purchase_order_receipts(id uuid primary key);
    create table public.vault_shopify_orders(id uuid primary key, shopify_created_at timestamptz, cancelled_at timestamptz, metadata jsonb default '{"test":"false"}');
    create table public.vault_shopify_order_lines(id uuid primary key, order_id uuid, shopify_variant_id text, cogs_quantity numeric);
    create table public.vault_products(id uuid primary key, source text, source_product_id text);
    create table public.vault_variants(id uuid primary key, product_id uuid, source text, source_variant_id text);
    create table public.vault_historical_merchandise_class_memberships(id uuid primary key, merchandise_class_id text, product_id uuid, effective_from date, effective_through date);
    create table public.vault_historical_supplier_batch_evidence(id uuid primary key default gen_random_uuid(), merchandise_class_id text not null, supplier_id uuid not null, supplier_order_date date not null, received_date date not null, quantity integer not null, landed_total_gbp numeric not null);
    insert into public.vault_operators values('${id(1)}','owner',true),('${id(2)}','viewer',true);
    insert into public.vault_suppliers values('${id(3)}'); insert into public.vault_historical_merchandise_classes values('exclusive_tee');`);
  for (const migration of migrations) sql(migration);
  const payload = `'{"source_reference":"test-receipt-1","source_document_reference":"test-document-1","supplier_order_date":"2026-04-05","received_at":"2026-04-09T00:00:00Z","received_quantity":90,"goods_cost_gbp":824.40,"inbound_shipping_gbp":325.00,"other_direct_landed_gbp":0,"stated_landed_total_gbp":1149.40,"receipt_status":"RECEIVED","validation_status":"VALID","validation_reasons":[],"note":"test"}'::jsonb`;
  assert.match(sqlFails(`set role service_role; insert into public.vault_historical_delivery_cost_batches(merchandise_class_id,supplier_id,source_reference,source_document_reference,supplier_order_date,received_quantity,goods_cost_gbp,inbound_shipping_gbp,receipt_status,validation_status,validation_reasons,approval_status,entered_by_operator_id,original_import) values('exclusive_tee','${id(3)}','forged','doc','2026-04-05',1,1,0,'RECEIVED','VALID','[]','APPROVED','${id(1)}','{}');`), /permission denied/);
  assert.match(sqlFails(`select public.stage_governed_historical_delivery_cost_batch('${id(3)}','exclusive_tee','${id(2)}','{}'::jsonb,${payload});`), /OPERATOR_UNAUTHORISED/);
  const batchId = sql(`select public.stage_governed_historical_delivery_cost_batch('${id(3)}','exclusive_tee','${id(1)}','{}'::jsonb,${payload});`);
  assert.match(batchId, /^[0-9a-f-]{36}$/);
  assert.equal(sql(`select approval_status||'|'||count(*) from public.vault_historical_delivery_cost_batches group by approval_status`), "PENDING|1");
  assert.match(sqlFails(`select public.approve_governed_historical_delivery_cost_batch('${batchId}',999,'reviewed','${id(1)}');`), /STALE_HISTORICAL_DELIVERY_WRITE/);
  assert.equal(sql(`select public.approve_governed_historical_delivery_cost_batch('${batchId}',1,'reviewed','${id(1)}')->>'costing_eligible'`), "true");
  assert.equal(sql(`select count(*) from public.vault_historical_delivery_cost_batch_approvals`), "1");
  assert.match(sqlFails(`set role service_role; delete from public.vault_historical_delivery_cost_batch_approvals;`), /permission denied/);
  assert.equal(sql(`select has_table_privilege('service_role','public.vault_historical_delivery_cost_batches','INSERT')::text||'|'||has_table_privilege('service_role','public.vault_historical_delivery_cost_batches','UPDATE')::text||'|'||has_function_privilege('service_role','public.stage_governed_historical_delivery_cost_batch(uuid,text,uuid,jsonb,jsonb)','EXECUTE')::text`), "false|false|true");
});
