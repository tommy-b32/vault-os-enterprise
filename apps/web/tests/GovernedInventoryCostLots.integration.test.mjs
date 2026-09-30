import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';

const name = `vault-74000-${process.pid}`;
const migration = readFileSync(new URL('../../../supabase/migrations/20261074000000_governed_inventory_cost_lots.sql', import.meta.url), 'utf8');
const run = (args, input) => { const result = spawnSync('docker', args, { encoding: 'utf8', input }); if (result.status) throw Error(result.stderr || result.stdout); return result.stdout.trim(); };
const sql = text => run(['exec', '-i', name, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'lots', '-X', '-q'], text);
const value = text => run(['exec', '-i', name, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'lots', '-X', '-q', '-t', '-A'], text);
const schema = `create extension pgcrypto;create role anon;create role authenticated;create role service_role;create table public.vault_operators(id uuid primary key,is_active boolean);create table public.vault_purchase_orders(id uuid primary key);create table public.vault_purchase_order_lines(id uuid primary key,purchase_order_id uuid references public.vault_purchase_orders(id));create table public.vault_purchase_order_line_size_allocations(id uuid primary key,purchase_order_line_id uuid references public.vault_purchase_order_lines(id),variant_id uuid,shopify_variant_id_snapshot text,shopify_inventory_item_id_snapshot text);create table public.vault_purchase_order_receipts(id uuid primary key,purchase_order_id uuid references public.vault_purchase_orders(id),received_location_id uuid,shopify_location_id_snapshot text);create table public.vault_purchase_order_receipt_lines(id uuid primary key,receipt_id uuid references public.vault_purchase_order_receipts(id),purchase_order_line_id uuid references public.vault_purchase_order_lines(id));create table public.vault_purchase_order_receipt_allocations(id uuid primary key,receipt_line_id uuid references public.vault_purchase_order_receipt_lines(id),purchase_order_line_size_allocation_id uuid references public.vault_purchase_order_line_size_allocations(id),variant_id uuid,shopify_variant_id_snapshot text,shopify_inventory_item_id_snapshot text);create table public.vault_purchase_order_receipt_cost_dispositions(id uuid primary key,purchase_order_id uuid,purchase_order_line_id uuid,purchase_order_line_size_allocation_id uuid,receipt_id uuid,receipt_allocation_id uuid,disposition_type text,quantity integer,allocated_gbp_minor_units bigint);create table public.vault_purchase_order_inventory_postings(id uuid primary key,receipt_id uuid,shopify_location_id_snapshot text);create table public.vault_purchase_order_inventory_posting_lines(id uuid primary key,posting_id uuid,receipt_allocation_id uuid,quantity integer,shopify_variant_id_snapshot text,shopify_inventory_item_id_snapshot text);create table public.vault_purchase_order_inventory_posting_events(id uuid primary key,posting_id uuid,event_type text);create table public.vault_variants(id uuid primary key,source text,source_active boolean,source_variant_id text,source_inventory_item_id text);create table public.vault_locations(id uuid primary key,source text,active boolean,source_location_id text);create function public.reject_purchase_cost_evidence_mutation() returns trigger language plpgsql as $$begin raise exception 'immutable';end$$;grant select on all tables in schema public to service_role;`;

async function setup(t) { t.after(() => run(['rm', '-f', name])); run(['run', '--rm', '-d', '--name', name, '-e', 'POSTGRES_PASSWORD=x', '-e', 'POSTGRES_DB=lots', 'postgres:17']); for (let i = 0; i < 40; i += 1) { try { sql('select 1'); break; } catch (error) { if (i === 39) throw error; await new Promise(resolve => setTimeout(resolve, 100)); } } sql(schema); sql(migration); }
function ids(base) { const id = offset => `00000000-0000-0000-0000-${String(base + offset).padStart(12, '0')}`; return { p:id(1),l:id(2),s:id(3),r:id(4),rl:id(5),ra:id(6),d:id(7),v:id(8),loc:id(9),post:id(10),pl:id(11),ev:id(12),post2:id(13),pl2:id(14),ev2:id(15) }; }
function insertSource(x) { sql(`insert into public.vault_operators values('${x.v}',true);insert into public.vault_purchase_orders values('${x.p}');insert into public.vault_purchase_order_lines values('${x.l}','${x.p}');insert into public.vault_variants values('${x.v}','shopify',true,'sv','ii');insert into public.vault_locations values('${x.loc}','shopify',true,'sl');insert into public.vault_purchase_order_line_size_allocations values('${x.s}','${x.l}','${x.v}','sv','ii');insert into public.vault_purchase_order_receipts values('${x.r}','${x.p}','${x.loc}','sl');insert into public.vault_purchase_order_receipt_lines values('${x.rl}','${x.r}','${x.l}');insert into public.vault_purchase_order_receipt_allocations values('${x.ra}','${x.rl}','${x.s}','${x.v}','sv','ii');insert into public.vault_purchase_order_receipt_cost_dispositions values('${x.d}','${x.p}','${x.l}','${x.s}','${x.r}','${x.ra}','sellable_inventory',3,1000);`); }
function post(x, quantity, second = false) { const [posting, line, event] = second ? [x.post2, x.pl2, x.ev2] : [x.post, x.pl, x.ev]; sql(`insert into public.vault_purchase_order_inventory_postings values('${posting}','${x.r}','sl');insert into public.vault_purchase_order_inventory_posting_lines values('${line}','${posting}','${x.ra}',${quantity},'sv','ii');insert into public.vault_purchase_order_inventory_posting_events values('${event}','${posting}','shopify_succeeded');`); }
function derive(x, key) { sql(`set role service_role;select public.derive_governed_inventory_cost_lots('${x.p}','${x.v}','${key}');reset role;`); }
const sqlAsync = text => new Promise((resolve, reject) => { const child = spawn('docker', ['exec', '-i', name, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'lots', '-X', '-q', '-t', '-A'], { stdio: ['pipe', 'pipe', 'pipe'] }); let output = '', error = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { error += chunk; }); child.on('close', code => code === 0 ? resolve(output.trim()) : reject(Error(error || output))); child.stdin.end(text); });
function state(x) { return value(`select successful_posted_eligible_quantity||'|'||admitted_quantity||'|'||admitted_gbp_minor_units||'|'||unresolved_quantity||'|'||unresolved_gbp_minor_units||'|'||identity_consistent||'|'||quantity_conservation_valid||'|'||monetary_conservation_valid||'|'||readiness_status||'|'||reason_code||'|'||conservation_status from public.vault_governed_inventory_cost_state where receipt_cost_disposition_id='${x.d}'`); }

test('74000 installs in disposable PostgreSQL', async t => { await setup(t); assert.equal(value("select to_regclass('public.vault_governed_inventory_cost_lots')"), 'vault_governed_inventory_cost_lots'); assert.equal(value("select to_regprocedure('public.derive_governed_inventory_cost_lots(uuid,uuid,text)')"), 'derive_governed_inventory_cost_lots(uuid,uuid,text)'); assert.equal(value("select to_regclass('public.vault_governed_inventory_cost_state')"), 'vault_governed_inventory_cost_state'); });
test('A preserves an unposted coherent sellable source as awaiting Shopify posting', async t => { await setup(t); const x = ids(100); insertSource(x); derive(x, 'a'); assert.equal(state(x), '0|0|0|3|1000|true|true|true|AWAITING_SHOPIFY_POSTING|NO_SUCCESSFUL_POSTING|CONSERVATION_OK'); assert.equal(value('select count(*) from public.vault_governed_inventory_cost_lots'), '0'); });
test('B admits a fully successfully posted sellable disposition', async t => { await setup(t); const x = ids(200); insertSource(x); post(x, 3); derive(x, 'b'); assert.equal(value(`select admission_start_unit||'|'||admission_end_unit||'|'||admitted_quantity||'|'||admitted_gbp_minor_units from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}'`), '0|3|3|1000'); assert.equal(state(x), '3|3|1000|0|0|true|true|true|COMPLETE|COMPLETE|CONSERVATION_OK'); });
test('C through E append a second interval without changing the original lot', async t => { await setup(t); const x = ids(300); insertSource(x); post(x, 2); derive(x, 'c'); const snapshot = () => value(`select id||'|'||receipt_cost_disposition_id||'|'||inventory_posting_id||'|'||inventory_posting_line_id||'|'||inventory_posting_success_event_id||'|'||admission_start_unit||'|'||admission_end_unit||'|'||admitted_quantity||'|'||admitted_gbp_minor_units||'|'||allocation_method||'|'||allocation_method_version||'|'||provenance_key from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}' and admission_start_unit=0 and admission_end_unit=2`); const firstBefore = snapshot(); assert.equal(firstBefore.split('|').slice(1).join('|'), `${x.d}|${x.post}|${x.pl}|${x.ev}|0|2|2|666|sellable_disposition_cumulative_floor|v1|sellable_disposition_cumulative_floor:v1:${x.d}:0:2`); assert.equal(state(x), '2|2|666|1|334|true|true|true|PARTIAL|PARTIAL|CONSERVATION_OK'); post(x, 1, true); derive(x, 'd'); const firstAfter = snapshot(); assert.equal(firstAfter, firstBefore); t.diagnostic(`E first lot before/after: ${firstBefore}`); assert.equal(value(`select string_agg(admission_start_unit||'|'||admission_end_unit||'|'||admitted_quantity||'|'||admitted_gbp_minor_units,',' order by admission_start_unit) from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}'`), '0|2|2|666,2|3|1|334'); assert.equal(value(`select count(*)||'|'||coalesce(sum(admitted_quantity),0)||'|'||coalesce(sum(admitted_gbp_minor_units),0) from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}'`), '2|3|1000'); assert.equal(state(x), '3|3|1000|0|0|true|true|true|COMPLETE|COMPLETE|CONSERVATION_OK'); });

test('F excludes a non-sellable Stage 73000 disposition despite successful Shopify posting evidence', async t => {
  await setup(t);
  const x = ids(400);
  sql(`insert into public.vault_operators values('${x.v}',true);insert into public.vault_purchase_orders values('${x.p}');insert into public.vault_purchase_order_lines values('${x.l}','${x.p}');insert into public.vault_variants values('${x.v}','shopify',true,'sv','ii');insert into public.vault_locations values('${x.loc}','shopify',true,'sl');insert into public.vault_purchase_order_line_size_allocations values('${x.s}','${x.l}','${x.v}','sv','ii');insert into public.vault_purchase_order_receipts values('${x.r}','${x.p}','${x.loc}','sl');insert into public.vault_purchase_order_receipt_lines values('${x.rl}','${x.r}','${x.l}');insert into public.vault_purchase_order_receipt_allocations values('${x.ra}','${x.rl}','${x.s}','${x.v}','sv','ii');insert into public.vault_purchase_order_receipt_cost_dispositions values('${x.d}','${x.p}','${x.l}','${x.s}','${x.r}','${x.ra}','non_sellable_writeoff',3,1000);`);
  post(x, 3);
  derive(x, 'f');
  assert.equal(value(`select count(*) from public.vault_purchase_order_inventory_posting_events where posting_id='${x.post}' and event_type='shopify_succeeded'`), '1');
  assert.equal(value(`select count(*) from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}'`), '0');
  assert.equal(value(`select coalesce(sum(admitted_quantity),0)||'|'||coalesce(sum(admitted_gbp_minor_units),0) from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}'`), '0|0');
});

test('replay leaves a completed two-lot source unchanged', async t => {
  await setup(t);
  const x = ids(500);
  insertSource(x);
  post(x, 2);
  derive(x, 'replay-initial');
  post(x, 1, true);
  derive(x, 'replay-complete');
  const rows = () => value(`select string_agg(id||'|'||receipt_cost_disposition_id||'|'||inventory_posting_id||'|'||inventory_posting_line_id||'|'||inventory_posting_success_event_id||'|'||admission_start_unit||'|'||admission_end_unit||'|'||admitted_quantity||'|'||admitted_gbp_minor_units||'|'||allocation_method||'|'||allocation_method_version||'|'||provenance_key,';' order by admission_start_unit) from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}'`);
  const totals = () => value(`select count(*)||'|'||coalesce(sum(admitted_quantity),0)||'|'||coalesce(sum(admitted_gbp_minor_units),0) from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}'`);
  const beforeRows = rows();
  const beforeTotals = totals();
  assert.equal(beforeTotals, '2|3|1000');
  derive(x, 'replay-same-evidence');
  const afterRows = rows();
  const afterTotals = totals();
  assert.equal(afterTotals, beforeTotals);
  assert.equal(afterRows, beforeRows);
  assert.equal(value(`select count(*) from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}' and admission_start_unit=admission_end_unit`), '0');
  assert.equal(value(`select count(*) from (select admission_start_unit,admission_end_unit from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}' group by admission_start_unit,admission_end_unit having count(*)>1) duplicate_intervals`), '0');
  assert.equal(state(x), '3|3|1000|0|0|true|true|true|COMPLETE|COMPLETE|CONSERVATION_OK');
  t.diagnostic(`Replay before/after rows: ${beforeRows}`);
});

test('different caller key cannot create a new financial identity for completed evidence', async t => {
  await setup(t);
  const x = ids(600);
  insertSource(x);
  post(x, 2);
  derive(x, 'caller-key-original');
  post(x, 1, true);
  derive(x, 'caller-key-complete');
  const rows = () => value(`select string_agg(id||'|'||receipt_cost_disposition_id||'|'||inventory_posting_id||'|'||inventory_posting_line_id||'|'||inventory_posting_success_event_id||'|'||admission_start_unit||'|'||admission_end_unit||'|'||admitted_quantity||'|'||admitted_gbp_minor_units||'|'||allocation_method||'|'||allocation_method_version||'|'||provenance_key,';' order by admission_start_unit) from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}'`);
  const totals = () => value(`select count(*)||'|'||coalesce(sum(admitted_quantity),0)||'|'||coalesce(sum(admitted_gbp_minor_units),0) from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}'`);
  const beforeRows = rows();
  const beforeTotals = totals();
  assert.equal(beforeTotals, '2|3|1000');
  derive(x, 'caller-key-different-replay');
  assert.equal(totals(), beforeTotals);
  assert.equal(rows(), beforeRows);
  assert.equal(value(`select count(*) from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}' and admission_start_unit=admission_end_unit`), '0');
  assert.equal(value(`select count(*) from (select admission_start_unit,admission_end_unit from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}' group by admission_start_unit,admission_end_unit having count(*)>1) duplicate_intervals`), '0');
  assert.equal(state(x), '3|3|1000|0|0|true|true|true|COMPLETE|COMPLETE|CONSERVATION_OK');
  t.diagnostic(`Different-key replay rows: ${beforeRows}`);
});

test('duplicate Shopify success events prove one posting succeeded without multiplying eligibility', async t => {
  await setup(t);
  const x = ids(700);
  insertSource(x);
  post(x, 2);
  sql(`insert into public.vault_purchase_order_inventory_posting_events values('${x.ev2}','${x.post}','shopify_succeeded');`);
  assert.equal(value(`select count(*) from public.vault_purchase_order_inventory_postings where id='${x.post}'`), '1');
  assert.equal(value(`select count(*) from public.vault_purchase_order_inventory_posting_lines where posting_id='${x.post}'`), '1');
  assert.equal(value(`select quantity from public.vault_purchase_order_inventory_posting_lines where posting_id='${x.post}'`), '2');
  assert.equal(value(`select count(*) from public.vault_purchase_order_inventory_posting_events where posting_id='${x.post}' and event_type='shopify_succeeded'`), '2');
  derive(x, 'duplicate-success-events');
  assert.equal(value(`select admission_start_unit||'|'||admission_end_unit||'|'||admitted_quantity||'|'||admitted_gbp_minor_units from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}'`), '0|2|2|666');
  assert.equal(state(x), '2|2|666|1|334|true|true|true|PARTIAL|PARTIAL|CONSERVATION_OK');
});

test('Shopify variant mismatch cannot admit sellable inventory cost or look healthy', async t => {
  await setup(t);
  const x = ids(800);
  insertSource(x);
  sql(`insert into public.vault_purchase_order_inventory_postings values('${x.post}','${x.r}','sl');insert into public.vault_purchase_order_inventory_posting_lines values('${x.pl}','${x.post}','${x.ra}',2,'wrong-sv','ii');insert into public.vault_purchase_order_inventory_posting_events values('${x.ev}','${x.post}','shopify_succeeded');`);
  derive(x, 'variant-mismatch');
  assert.equal(value(`select count(*) from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}'`), '0');
  assert.equal(value(`select coalesce(sum(admitted_quantity),0)||'|'||coalesce(sum(admitted_gbp_minor_units),0) from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}'`), '0|0');
  assert.equal(value(`select count(*) from public.vault_governed_inventory_cost_state where receipt_cost_disposition_id='${x.d}'`), '1');
  assert.equal(value(`select identity_consistent||'|'||readiness_status from public.vault_governed_inventory_cost_state where receipt_cost_disposition_id='${x.d}'`), 'false|UNAVAILABLE_INCONSISTENT_EVIDENCE');
});

test('Shopify inventory-item mismatch cannot admit sellable inventory cost or look healthy', async t => {
  await setup(t);
  const x = ids(900);
  insertSource(x);
  sql(`insert into public.vault_purchase_order_inventory_postings values('${x.post}','${x.r}','sl');insert into public.vault_purchase_order_inventory_posting_lines values('${x.pl}','${x.post}','${x.ra}',2,'sv','wrong-ii');insert into public.vault_purchase_order_inventory_posting_events values('${x.ev}','${x.post}','shopify_succeeded');`);
  derive(x, 'inventory-item-mismatch');
  assert.equal(value(`select count(*) from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}'`), '0');
  assert.equal(value(`select coalesce(sum(admitted_quantity),0)||'|'||coalesce(sum(admitted_gbp_minor_units),0) from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}'`), '0|0');
  assert.equal(value(`select count(*) from public.vault_governed_inventory_cost_state where receipt_cost_disposition_id='${x.d}'`), '1');
  assert.equal(value(`select identity_consistent||'|'||readiness_status||'|'||reason_code||'|'||conservation_status from public.vault_governed_inventory_cost_state where receipt_cost_disposition_id='${x.d}'`), 'false|UNAVAILABLE_INCONSISTENT_EVIDENCE|SHOPIFY_IDENTITY_MISMATCH|CONSERVATION_UNAVAILABLE_OR_INCONSISTENT');
});

test('Shopify location mismatch cannot admit sellable inventory cost or look healthy', async t => {
  await setup(t);
  const x = ids(1000);
  insertSource(x);
  sql(`insert into public.vault_purchase_order_inventory_postings values('${x.post}','${x.r}','wrong-sl');insert into public.vault_purchase_order_inventory_posting_lines values('${x.pl}','${x.post}','${x.ra}',2,'sv','ii');insert into public.vault_purchase_order_inventory_posting_events values('${x.ev}','${x.post}','shopify_succeeded');`);
  derive(x, 'location-mismatch');
  assert.equal(value(`select count(*) from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}'`), '0');
  assert.equal(value(`select coalesce(sum(admitted_quantity),0)||'|'||coalesce(sum(admitted_gbp_minor_units),0) from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}'`), '0|0');
  assert.equal(value(`select count(*) from public.vault_governed_inventory_cost_state where receipt_cost_disposition_id='${x.d}'`), '1');
  assert.equal(value(`select identity_consistent||'|'||readiness_status||'|'||reason_code||'|'||conservation_status from public.vault_governed_inventory_cost_state where receipt_cost_disposition_id='${x.d}'`), 'false|UNAVAILABLE_INCONSISTENT_EVIDENCE|SHOPIFY_IDENTITY_MISMATCH|CONSERVATION_UNAVAILABLE_OR_INCONSISTENT');
});

test('saved-size and receipt-allocation linkage mismatch cannot bridge otherwise matching Shopify evidence', async t => {
  await setup(t);
  const x = ids(1100);
  const l2 = '00000000-0000-0000-0000-000000001201';
  const s2 = '00000000-0000-0000-0000-000000001202';
  const rl2 = '00000000-0000-0000-0000-000000001203';
  const ra2 = '00000000-0000-0000-0000-000000001204';
  insertSource(x);
  sql(`insert into public.vault_purchase_order_lines values('${l2}','${x.p}');insert into public.vault_purchase_order_line_size_allocations values('${s2}','${l2}','${x.v}','sv','ii');insert into public.vault_purchase_order_receipt_lines values('${rl2}','${x.r}','${l2}');insert into public.vault_purchase_order_receipt_allocations values('${ra2}','${rl2}','${s2}','${x.v}','sv','ii');update public.vault_purchase_order_receipt_cost_dispositions set receipt_allocation_id='${ra2}' where id='${x.d}';insert into public.vault_purchase_order_inventory_postings values('${x.post}','${x.r}','sl');insert into public.vault_purchase_order_inventory_posting_lines values('${x.pl}','${x.post}','${ra2}',2,'sv','ii');insert into public.vault_purchase_order_inventory_posting_events values('${x.ev}','${x.post}','shopify_succeeded');`);
  derive(x, 'linkage-mismatch');
  assert.equal(value(`select count(*) from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}'`), '0');
  assert.equal(value(`select count(*) from public.vault_governed_inventory_cost_state where receipt_cost_disposition_id='${x.d}'`), '1');
  assert.equal(value(`select identity_consistent||'|'||readiness_status from public.vault_governed_inventory_cost_state where receipt_cost_disposition_id='${x.d}'`), 'false|UNAVAILABLE_INCONSISTENT_EVIDENCE');
});

test('successful posting quantity above the sellable source fails closed without admission', async t => {
  await setup(t);
  const x = ids(1300);
  insertSource(x);
  post(x, 4);
  assert.throws(() => derive(x, 'over-eligible'), /INVENTORY_COST_LOT_CONSERVATION_INVALID/);
  assert.equal(value(`select count(*)||'|'||coalesce(sum(admitted_quantity),0)||'|'||coalesce(sum(admitted_gbp_minor_units),0)||'|'||coalesce(max(admission_end_unit),0) from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}'`), '0|0|0|0');
  assert.equal(value(`select source_sellable_quantity||'|'||source_sellable_gbp_minor_units||'|'||successful_posted_eligible_quantity||'|'||admitted_quantity||'|'||admitted_gbp_minor_units||'|'||unresolved_quantity||'|'||unresolved_gbp_minor_units||'|'||identity_consistent||'|'||readiness_status||'|'||reason_code||'|'||conservation_status from public.vault_governed_inventory_cost_state where receipt_cost_disposition_id='${x.d}'`), '3|1000|4|0|0|3|1000|true|UNAVAILABLE_INCONSISTENT_EVIDENCE|SUCCESSFUL_POSTING_UNADMITTED|CONSERVATION_UNAVAILABLE_OR_INCONSISTENT');
});

test('impossible persisted lot money remains visible and fails the read model closed', async t => {
  await setup(t);
  const x = ids(1400);
  insertSource(x);
  post(x, 3);
  assert.equal(state(x), '3|0|0|3|1000|true|true|true|READY_FOR_ADMISSION|SUCCESSFUL_POSTING_UNADMITTED|CONSERVATION_OK');
  sql(`insert into public.vault_governed_inventory_cost_lots(purchase_order_id,purchase_order_line_id,purchase_order_line_size_allocation_id,receipt_id,receipt_line_id,receipt_allocation_id,receipt_cost_disposition_id,inventory_posting_id,inventory_posting_line_id,inventory_posting_success_event_id,variant_id,shopify_variant_id_snapshot,shopify_inventory_item_id_snapshot,shopify_location_id_snapshot,admission_start_unit,admission_end_unit,admitted_quantity,admitted_gbp_minor_units,provenance_key) values('${x.p}','${x.l}','${x.s}','${x.r}','${x.rl}','${x.ra}','${x.d}','${x.post}','${x.pl}','${x.ev}','${x.v}','sv','ii','sl',0,3,3,1001,'privileged-corruption:${x.d}');`);
  assert.equal(value(`select count(*)||'|'||sum(admitted_quantity)||'|'||sum(admitted_gbp_minor_units) from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}'`), '1|3|1001');
  assert.equal(value(`select source_sellable_quantity||'|'||source_sellable_gbp_minor_units||'|'||successful_posted_eligible_quantity||'|'||admitted_quantity||'|'||admitted_gbp_minor_units||'|'||unresolved_quantity||'|'||unresolved_gbp_minor_units||'|'||identity_consistent||'|'||readiness_status||'|'||reason_code||'|'||conservation_status from public.vault_governed_inventory_cost_state where receipt_cost_disposition_id='${x.d}'`), '3|1000|3|3|1001|0|-1|true|UNAVAILABLE_INCONSISTENT_EVIDENCE|COMPLETE|CONSERVATION_UNAVAILABLE_OR_INCONSISTENT');
});

test('concurrent derivations serialize to one conserved lot interval', async t => {
  await setup(t);
  const x = ids(1500);
  insertSource(x);
  post(x, 3);
  const startedA = Date.now();
  const callA = sqlAsync(`begin;set role service_role;select pg_backend_pid();select public.derive_governed_inventory_cost_lots('${x.p}','${x.v}','concurrency-a');select pg_sleep(2);commit;`);
  await new Promise(resolve => setTimeout(resolve, 250));
  const startedB = Date.now();
  const callB = sqlAsync(`set role service_role;select pg_backend_pid();select public.derive_governed_inventory_cost_lots('${x.p}','${x.v}','concurrency-b');`);
  const [resultA, resultB] = await Promise.all([callA, callB]);
  const finishedA = Date.now();
  const finishedB = Date.now();
  assert.match(resultA, /\n1\n/);
  assert.match(resultB, /\n0$/);
  assert.equal(value(`select count(*)||'|'||string_agg(admission_start_unit||'|'||admission_end_unit||'|'||admitted_quantity||'|'||admitted_gbp_minor_units,',' order by admission_start_unit)||'|'||sum(admitted_quantity)||'|'||sum(admitted_gbp_minor_units) from public.vault_governed_inventory_cost_lots where receipt_cost_disposition_id='${x.d}'`), '1|0|3|3|1000|3|1000');
  assert.equal(state(x), '3|3|1000|0|0|true|true|true|COMPLETE|COMPLETE|CONSERVATION_OK');
  t.diagnostic(`A=${resultA.replace(/\n/g, ',')} B=${resultB.replace(/\n/g, ',')} A:${startedA}-${finishedA} B:${startedB}-${finishedB}`);
});
