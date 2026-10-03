import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const name = `vault-po-close-${process.pid}`;
const closeMigration = readFileSync(new URL("../../../supabase/migrations/20261076000000_governed_purchase_order_closed_transition.sql", import.meta.url), "utf8");
const gateMigration = readFileSync(new URL("../../../supabase/migrations/20261077000000_closed_purchase_order_inventory_posting_gate.sql", import.meta.url), "utf8");
const run = (args, input) => { const r = spawnSync("docker", args, { input, encoding: "utf8" }); if (r.status) throw Error(r.stderr || r.stdout); return r.stdout.trim(); };
const sql = query => run(["exec", "-i", name, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "po_close"], query);
const value = query => run(["exec", "-i", name, "psql", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "po_close"], query);
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

const schema = `
create extension pgcrypto; create role anon; create role authenticated; create role service_role;
create table public.vault_operators(id uuid primary key,is_active boolean not null);
create table public.vault_purchase_orders(id uuid primary key,status text not null,actual_total_gbp numeric,estimated_total_gbp numeric,paid_amount_gbp numeric not null default 0,constraint vault_purchase_orders_status_check check(status in ('draft','recommended','approved','ordered','part_paid','paid','shipped','received','cancelled')));
create table public.vault_purchase_order_lines(id uuid primary key,purchase_order_id uuid not null,recommended_units int,recommended_packs int,units_per_pack int,source_recommendation_type text);
create table public.vault_purchase_order_line_size_allocations(id uuid primary key,purchase_order_line_id uuid not null,ordered_units int not null);
create table public.vault_purchase_order_receipts(id uuid primary key,purchase_order_id uuid not null,received_location_id uuid,shopify_location_id_snapshot text);
create table public.vault_purchase_order_receipt_lines(id uuid primary key,receipt_id uuid not null,purchase_order_line_id uuid not null,quantity_received int not null default 0,non_sellable_quantity int not null default 0);
create table public.vault_purchase_order_receipt_allocations(id uuid primary key,receipt_line_id uuid not null,purchase_order_line_size_allocation_id uuid not null,quantity_received int not null default 0,non_sellable_quantity int not null default 0);
create table public.vault_purchase_order_inventory_postings(id uuid primary key default gen_random_uuid(),receipt_id uuid not null,created_by_operator_id uuid,idempotency_key text not null,shopify_location_id_snapshot text,unique(receipt_id,idempotency_key));
create table public.vault_purchase_order_inventory_posting_lines(id uuid primary key default gen_random_uuid(),posting_id uuid not null,receipt_allocation_id uuid not null,quantity int not null);
create table public.vault_purchase_order_inventory_posting_events(id uuid primary key default gen_random_uuid(),posting_id uuid not null,event_type text not null);
create table public.vault_purchase_order_landed_cost_completeness(purchase_order_id uuid primary key,landed_cost_completeness text not null);
create table public.vault_purchase_order_governed_reconciled_payment_state(purchase_order_id uuid primary key,supplier_balance_minor_units bigint not null);
create table public.vault_purchase_order_events(id uuid primary key default gen_random_uuid(),purchase_order_id uuid,operator_id uuid,event_type text,idempotency_key text,event_snapshot jsonb);
create function public.reserve_vault_purchase_order_inventory_posting(target_purchase_order_id uuid,target_receipt_id uuid,target_operator_id uuid,target_idempotency_key text,target_allocations jsonb) returns table(posting_id uuid,created boolean,posting_state text) language plpgsql security invoker set search_path='' as $$
declare existing_id uuid; new_id uuid;
begin
  select id into existing_id from public.vault_purchase_order_inventory_postings
    where receipt_id = target_receipt_id and idempotency_key = target_idempotency_key;
  if found then return query select existing_id,false,'reserved'::text; return; end if;
  if (select count(*) from jsonb_array_elements(target_allocations)) <> 1 then raise exception 'one allocation required'; end if;
  insert into public.vault_purchase_order_inventory_postings(receipt_id,created_by_operator_id,idempotency_key) values(target_receipt_id,target_operator_id,target_idempotency_key) returning id into new_id;
  insert into public.vault_purchase_order_inventory_posting_events(posting_id,event_type) values(new_id,'reserved');
  return query select new_id,true,'reserved'::text;
end $$;
`;

async function setup(t) { t.after(() => run(["rm", "-f", name])); run(["run", "--rm", "-d", "--name", name, "-e", "POSTGRES_PASSWORD=x", "-e", "POSTGRES_DB=po_close", "postgres:17"]); for (let i=0;i<40;i+=1) { try { sql("select 1"); break; } catch (error) { if (i===39) throw error; await new Promise(resolve => setTimeout(resolve,100)); } } sql(schema); const statuses=['draft','recommended','approved','ordered','part_paid','paid','shipped','received','cancelled']; for (const [index,status] of statuses.entries()) sql(`insert into public.vault_purchase_orders(id,status) values('${id(index+10)}','${status}')`); assert.throws(()=>sql(`insert into public.vault_purchase_orders(id,status) values('${id(99)}','arbitrary')`),/vault_purchase_orders_status_check/); sql(closeMigration); sql(gateMigration); assert.equal(value(`select string_agg(status,',' order by status) from public.vault_purchase_orders where id in (${statuses.map((_,index)=>`'${id(index+10)}'`).join(',')})`),'approved,cancelled,draft,ordered,paid,part_paid,received,recommended,shipped'); }
function source(n,{physical=2,sellable=2,payment=0,posting="success"}={}) { const x={po:id(n),line:id(n+1),size:id(n+2),receipt:id(n+3),receiptLine:id(n+4),allocation:id(n+5),operator:id(1),posting:id(n+6)}; sql(`insert into public.vault_purchase_orders(id,status,actual_total_gbp,paid_amount_gbp) values('${x.po}','received',100,${payment});insert into public.vault_purchase_order_lines values('${x.line}','${x.po}',2,null,null,null);insert into public.vault_purchase_order_line_size_allocations values('${x.size}','${x.line}',2);insert into public.vault_purchase_order_receipts(id,purchase_order_id) values('${x.receipt}','${x.po}');insert into public.vault_purchase_order_receipt_lines values('${x.receiptLine}','${x.receipt}','${x.line}',${sellable},${physical-sellable});insert into public.vault_purchase_order_receipt_allocations values('${x.allocation}','${x.receiptLine}','${x.size}',${sellable},${physical-sellable});insert into public.vault_purchase_order_landed_cost_completeness values('${x.po}','complete_landed_cost');insert into public.vault_purchase_order_governed_reconciled_payment_state values('${x.po}',${payment === 0 ? 10000 : 0});`); if (posting !== "none") sql(`insert into public.vault_purchase_order_inventory_postings(id,receipt_id,idempotency_key) values('${x.posting}','${x.receipt}','seed');insert into public.vault_purchase_order_inventory_posting_lines(posting_id,receipt_allocation_id,quantity) values('${x.posting}','${x.allocation}',${sellable});insert into public.vault_purchase_order_inventory_posting_events(posting_id,event_type) values('${x.posting}','${posting === "success" ? "shopify_succeeded" : posting === "unknown" ? "shopify_outcome_unknown" : "shopify_failed"}');`); return x; }
function close(x) { return value(`select status||'|'||transitioned from public.close_governed_purchase_order('${x.po}','${x.operator}')`); }

test("governed closure is database-enforced across receipt, liability, Shopify, and post-close reservation states", async t => {
  await setup(t); sql(`insert into public.vault_operators values('${id(1)}',true);`);
  const good=source(100,{payment:100}); assert.equal(close(good),"closed|true"); assert.equal(close(good),"closed|false"); assert.equal(value(`select count(*) from public.vault_purchase_order_events where purchase_order_id='${good.po}' and event_type='governed_purchase_order_closed'`),"1");
  assert.throws(()=>sql(`insert into public.vault_purchase_orders(id,status) values('${id(98)}','arbitrary')`),/vault_purchase_orders_status_check/);
  const incomplete=source(200,{physical:1,sellable:1,payment:100}); assert.throws(()=>close(incomplete),/Physical receipt is incomplete/);
  const unpaid=source(300,{payment:0}); assert.throws(()=>close(unpaid),/Governed supplier liability remains outstanding/);
  for (const [n,posting] of [[400,"none"],[500,"unknown"],[600,"failed"]]) { const x=source(n,{payment:100,posting}); assert.throws(()=>close(x),/Shopify inventory posting is incomplete or unresolved/); }
  const nonSellable=source(700,{physical:2,sellable:0,payment:100,posting:"none"}); assert.equal(close(nonSellable),"closed|true");
  assert.throws(()=>value(`select * from public.reserve_vault_purchase_order_inventory_posting('${good.po}','${good.receipt}','${good.operator}','after-close','[{"receipt_allocation_id":"${good.allocation}","quantity":1}]'::jsonb)`),/Closed purchase orders cannot create inventory posting reservations/);
  assert.equal(value(`select count(*) from public.vault_purchase_order_inventory_postings where receipt_id='${good.receipt}'`),"1");
  assert.match(value(`select posting_id||'|'||created||'|'||posting_state from public.reserve_vault_purchase_order_inventory_posting('${good.po}','${good.receipt}','${good.operator}','seed','[{"receipt_allocation_id":"${good.allocation}","quantity":1}]'::jsonb)`),/^[0-9a-f-]+\|false\|reserved$/);
  assert.equal(value(`select count(*) from public.vault_purchase_order_inventory_postings where receipt_id='${good.receipt}'`),"1");
});
