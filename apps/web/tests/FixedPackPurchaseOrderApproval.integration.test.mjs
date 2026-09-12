import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
const migration=await readFile(new URL("../../../supabase/migrations/20260918000000_fixed_pack_purchase_order_approval.sql",import.meta.url),"utf8"),container=`b21b3a-${process.pid}`,id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`,fp=n=>n.toString(16).padStart(32,"a");
const docker=(args,input)=>{const r=spawnSync("docker",args,{input,encoding:"utf8"});if(r.status)throw Error(r.stderr||r.stdout);return r.stdout.trim()},sql=q=>docker(["exec","-i",container,"psql","-v","ON_ERROR_STOP=1","-U","postgres","-d","b21","-t","-A"],q),fails=q=>{const r=spawnSync("docker",["exec","-i",container,"psql","-v","ON_ERROR_STOP=1","-U","postgres","-d","b21","-t","-A"],{input:q,encoding:"utf8"});assert.notEqual(r.status,0);return r.stderr};
test("fixed-pack approval validates core source, payload, allocation, and repeat contracts",async t=>{t.after(()=>docker(["rm","-f",container]));docker(["run","--rm","-d","--name",container,"-e","POSTGRES_PASSWORD=x","-e","POSTGRES_DB=b21","postgres:17"]);for(let i=0;i<40;i++){try{sql("select 1");break}catch{if(i===39)throw Error("database not ready");await new Promise(r=>setTimeout(r,250))}}
sql(`create role anon;create role authenticated;create role service_role;create table public.vault_operators(id uuid primary key,is_active boolean);create table public.vault_suppliers(id uuid primary key,currency_code text,minimum_order_value numeric);create table public.vault_purchase_orders(id uuid primary key,supplier_id uuid,status text,currency text,total_packs int,estimated_total_gbp numeric,approved_by_operator_id uuid,approved_at timestamptz);create table public.vault_purchase_order_lines(id uuid primary key,purchase_order_id uuid,supplier_id uuid,style_id text,recommended_packs int,recommended_units int,units_per_pack int,pack_cost_gbp numeric,line_cost_gbp numeric,source_recommendation_type text,source_snapshot jsonb);create table public.vault_purchase_order_line_size_allocations(purchase_order_line_id uuid,variant_id uuid,parent_product_id uuid,model_design text,normalized_size text,shopify_variant_id_snapshot text,shopify_inventory_item_id_snapshot text,units_per_pack int,ordered_units int);create table public.vault_variants(id uuid,product_id uuid,source text,source_active boolean,identity_resolution_status text,model_design text,normalized_size text,source_variant_id text,source_inventory_item_id text);create table public.vault_supplier_style_pack_composition_intelligence(id text,supplier_id uuid,style_id text,normalized_size text,units_per_pack int,declared_units_per_pack int,composition_units_per_pack int,active boolean,composition_complete boolean,composition_valid boolean,commercial_pack_consistent boolean);create table public.vault_style_catalogue_intelligence(style_id text,parent_product_id uuid,supplier_id uuid,restock_enabled boolean,inventory_strategy text,supplier_moq_packs int);create table public.vault_product_commercial_intelligence(product_id uuid,landed_cost_per_pack_gbp numeric);create table public.vault_supplier_purchasing_rules(supplier_id uuid,minimum_order_packs int);create table public.vault_fixed_pack_draft_idempotency(fingerprint text,style_id text,purchase_order_id uuid,purchase_order_line_id uuid);create table public.vault_purchase_order_events(purchase_order_id uuid,purchase_order_line_id uuid,operator_id uuid,event_type text,idempotency_key text,event_snapshot jsonb);create unique index approval_event_once on public.vault_purchase_order_events(purchase_order_id,idempotency_key) where idempotency_key is not null;create table public.vault_purchasing_wallet(ledger_balance_gbp numeric,protected_reserve_gbp numeric,committed_orders_gbp numeric,available_purchasing_power_gbp numeric,wallet_last_updated timestamptz,wallet_freshness_threshold_minutes int);create table public.vault_purchase_order_payments(id int);create table public.vault_purchase_order_receipts(id int);create table public.vault_wallet_ledger(id int);insert into public.vault_operators values('${id(1)}',true);insert into public.vault_purchasing_wallet values(100000,0,0,100000,now(),60);`);sql(migration);
const seed=(n,sources=["fixed_pack_purchase_recommendation"])=>{const po=id(n),supplier=id(n+1000),lines=sources.map((source,i)=>({id:id(n*100+i+1),style:`style-${n}-${i}`,source,fingerprint:fp(n*10+i+1),variant:id(n*1000+i+1),product:id(n*10000+i+1)}));sql(`insert into public.vault_suppliers values('${supplier}','GBP',1);insert into public.vault_supplier_purchasing_rules values('${supplier}',1);insert into public.vault_purchase_orders values('${po}','${supplier}','draft','GBP',${lines.length},${lines.length*10},null,null);`);for(const l of lines){const event=l.source==="manual_fixed_pack_purchase"?"manual_fixed_pack_added_to_draft":"fixed_pack_recommendation_added_to_draft";sql(`insert into public.vault_purchase_order_lines values('${l.id}','${po}','${supplier}','${l.style}',1,1,1,10,10,'${l.source}','{"pack_definition_id":"pack-${l.style}","fingerprint":"${l.fingerprint}","allocations":[{"variant_id":"${l.variant}","model_design":"Blue","normalized_size":"S","shopify_variant_id_snapshot":"sv-${l.id}","shopify_inventory_item_id_snapshot":"ii-${l.id}","units_per_pack":1,"ordered_units":1}]}');insert into public.vault_purchase_order_line_size_allocations values('${l.id}','${l.variant}','${l.product}','Blue','S','sv-${l.id}','ii-${l.id}',1,1);insert into public.vault_variants values('${l.variant}','${l.product}','shopify',true,'resolved','Blue','S','sv-${l.id}','ii-${l.id}');insert into public.vault_supplier_style_pack_composition_intelligence values('pack-${l.style}','${supplier}','${l.style}','S',1,1,1,true,true,true,true);insert into public.vault_style_catalogue_intelligence values('${l.style}','${l.product}','${supplier}',true,'continue',null);insert into public.vault_product_commercial_intelligence values('${l.product}',10);insert into public.vault_fixed_pack_draft_idempotency values('${l.fingerprint}','${l.style}','${po}','${l.id}');insert into public.vault_purchase_order_events values('${po}','${l.id}','${id(1)}','${event}','draft-${l.id}','{"fingerprint":"${l.fingerprint}"}');`)}return{po,supplier,lines,packs:lines.length}};
const qualification=(f,change={})=>({source_family:"fixed_pack",purchase_order_id:f.po,supplier_id:f.supplier,currency_code:"GBP",expected_total_packs:f.packs,expected_total_gbp:f.packs*10,lines:f.lines.map(l=>({purchase_order_line_id:l.id,source_recommendation_type:l.source,provenance_fingerprint:l.fingerprint})),...change}),call=(f,p=qualification(f))=>sql(`select transitioned from public.approve_fixed_pack_vault_purchase_order('${f.po}','${id(1)}',$json$${JSON.stringify(p)}$json$::jsonb)`),fail=(f,p=qualification(f))=>fails(`select * from public.approve_fixed_pack_vault_purchase_order('${f.po}','${id(1)}',$json$${JSON.stringify(p)}$json$::jsonb);`),rolled=f=>assert.equal(sql(`select status||'|'||coalesce(approved_by_operator_id::text,'')||'|'||coalesce(approved_at::text,'')||'|'||(select count(*) from public.vault_purchase_order_events where purchase_order_id='${f.po}' and event_type='fixed_pack_purchase_order_approved') from public.vault_purchase_orders where id='${f.po}'`),"draft|||0"),ok=f=>{assert.equal(call(f),"t");assert.equal(sql(`select status||'|'||(approved_by_operator_id='${id(1)}')||'|'||(approved_at is not null)||'|'||(select count(*) from public.vault_purchase_order_events where purchase_order_id='${f.po}' and event_type='fixed_pack_purchase_order_approved') from public.vault_purchase_orders where id='${f.po}'`),"approved|true|true|1")};
const recommendation=seed(10);ok(recommendation);const approvedAt=sql(`select approved_at::text from public.vault_purchase_orders where id='${recommendation.po}'`);assert.equal(call(recommendation),"f");assert.equal(sql(`select approved_at::text from public.vault_purchase_orders where id='${recommendation.po}'`),approvedAt);assert.equal(sql(`select count(*) from public.vault_purchase_order_events where purchase_order_id='${recommendation.po}' and event_type='fixed_pack_purchase_order_approved'`),"1");assert.equal(sql("select count(*) from public.vault_purchase_order_payments"),"0");assert.equal(sql("select count(*) from public.vault_purchase_order_receipts"),"0");assert.equal(sql("select count(*) from public.vault_wallet_ledger"),"0");ok(seed(20,["manual_fixed_pack_purchase"]));ok(seed(30,["fixed_pack_purchase_recommendation","manual_fixed_pack_purchase"]));
for(const[n,sources]of[[40,["fixed_pack_purchase_recommendation","purchase_intelligence_required"]],[50,["unknown_source"]]]){const f=seed(n,sources);assert.match(fail(f),/PO_SOURCE_MIX_INVALID/);rolled(f)}const empty=seed(60,[]);assert.match(fail(empty),/PO_SOURCE_MIX_INVALID/);rolled(empty);
const payloadCases=[[70,f=>qualification(f,{source_family:"legacy"})],[80,f=>qualification(f,{purchase_order_id:id(999)})],[90,f=>qualification(f,{supplier_id:id(998)})],[100,f=>qualification(f,{lines:[]})],[110,f=>qualification(f,{lines:[...qualification(f).lines,{...qualification(f).lines[0],purchase_order_line_id:id(997)}]})],[120,f=>qualification(f,{lines:[qualification(f).lines[0],qualification(f).lines[0]]})],[130,f=>qualification(f,{lines:[{...qualification(f).lines[0],source_recommendation_type:"manual_fixed_pack_purchase"}]})],[140,f=>qualification(f,{lines:[{...qualification(f).lines[0],provenance_fingerprint:fp(999)}]})]];for(const[n,make]of payloadCases){const f=seed(n);assert.match(fail(f,make(f)),/SOURCE_PROVENANCE_INVALID/);rolled(f)}
const allocationCases=[[150,f=>sql(`delete from public.vault_purchase_order_line_size_allocations where purchase_order_line_id='${f.lines[0].id}'`),"FIXED_PACK_ALLOCATION_MISSING"],[160,f=>sql(`update public.vault_purchase_order_lines set recommended_packs=0 where id='${f.lines[0].id}'`),"FIXED_PACK_ALLOCATION_INVALID"],[170,f=>sql(`update public.vault_purchase_order_lines set units_per_pack=0 where id='${f.lines[0].id}'`),"FIXED_PACK_ALLOCATION_INVALID"],[180,f=>sql(`update public.vault_purchase_order_lines set recommended_units=2 where id='${f.lines[0].id}'`),"FIXED_PACK_ALLOCATION_INVALID"],[190,f=>sql(`update public.vault_purchase_order_line_size_allocations set ordered_units=2 where purchase_order_line_id='${f.lines[0].id}'`),"FIXED_PACK_ALLOCATION_INVALID"],[200,f=>sql(`update public.vault_purchase_order_line_size_allocations set units_per_pack=2 where purchase_order_line_id='${f.lines[0].id}'`),"FIXED_PACK_ALLOCATION_INVALID"],[210,f=>sql(`update public.vault_purchase_order_line_size_allocations set ordered_units=0 where purchase_order_line_id='${f.lines[0].id}'`),"FIXED_PACK_ALLOCATION_INVALID"]];for(const[n,mutate,expected]of allocationCases){const f=seed(n);mutate(f);assert.match(fail(f),new RegExp(expected));rolled(f)}});
const packContainer=`b21b3a-pack-${process.pid}`;
test("fixed-pack approval requires the exact current explicit pack composition",async t=>{t.after(()=>docker(["rm","-f",packContainer]));docker(["run","--rm","-d","--name",packContainer,"-e","POSTGRES_PASSWORD=x","-e","POSTGRES_DB=pack","postgres:17"]);const packSql=q=>{const r=spawnSync("docker",["exec","-i",packContainer,"psql","-v","ON_ERROR_STOP=1","-U","postgres","-d","pack","-t","-A"],{input:q,encoding:"utf8"});if(r.status)throw Error(r.stderr);return r.stdout.trim()},packFails=q=>{const r=spawnSync("docker",["exec","-i",packContainer,"psql","-v","ON_ERROR_STOP=1","-U","postgres","-d","pack","-t","-A"],{input:q,encoding:"utf8"});assert.notEqual(r.status,0);return r.stderr};for(let i=0;i<40;i++){try{packSql("select 1");break}catch{if(i===39)throw Error("database not ready");await new Promise(r=>setTimeout(r,250))}}
packSql(`create role anon;create role authenticated;create role service_role;create table public.vault_operators(id uuid primary key,is_active boolean);create table public.vault_suppliers(id uuid primary key,currency_code text,minimum_order_value numeric);create table public.vault_purchase_orders(id uuid primary key,supplier_id uuid,status text,currency text,total_packs int,estimated_total_gbp numeric,approved_by_operator_id uuid,approved_at timestamptz);create table public.vault_purchase_order_lines(id uuid primary key,purchase_order_id uuid,supplier_id uuid,style_id text,recommended_packs int,recommended_units int,units_per_pack int,pack_cost_gbp numeric,line_cost_gbp numeric,source_recommendation_type text,source_snapshot jsonb);create table public.vault_purchase_order_line_size_allocations(purchase_order_line_id uuid,variant_id uuid,parent_product_id uuid,model_design text,normalized_size text,shopify_variant_id_snapshot text,shopify_inventory_item_id_snapshot text,units_per_pack int,ordered_units int);create table public.vault_variants(id uuid,product_id uuid,source text,source_active boolean,identity_resolution_status text,model_design text,normalized_size text,source_variant_id text,source_inventory_item_id text);create table public.vault_supplier_style_pack_composition_intelligence(id text,supplier_id uuid,style_id text,normalized_size text,units_per_pack int,declared_units_per_pack int,composition_units_per_pack int,active boolean,composition_complete boolean,composition_valid boolean,commercial_pack_consistent boolean);create table public.vault_style_catalogue_intelligence(style_id text,parent_product_id uuid,supplier_id uuid,restock_enabled boolean,inventory_strategy text,supplier_moq_packs int);create table public.vault_product_commercial_intelligence(product_id uuid,landed_cost_per_pack_gbp numeric);create table public.vault_supplier_purchasing_rules(supplier_id uuid,minimum_order_packs int);create table public.vault_fixed_pack_draft_idempotency(fingerprint text,style_id text,purchase_order_id uuid,purchase_order_line_id uuid);create table public.vault_purchase_order_events(purchase_order_id uuid,purchase_order_line_id uuid,operator_id uuid,event_type text,idempotency_key text,event_snapshot jsonb);create unique index event_once on public.vault_purchase_order_events(purchase_order_id,idempotency_key) where idempotency_key is not null;create table public.vault_purchasing_wallet(ledger_balance_gbp numeric,protected_reserve_gbp numeric,committed_orders_gbp numeric,available_purchasing_power_gbp numeric,wallet_last_updated timestamptz,wallet_freshness_threshold_minutes int);create table public.vault_purchase_order_payments(id int);create table public.vault_purchase_order_receipts(id int);create table public.vault_wallet_ledger(id int);insert into public.vault_operators values('${id(1)}',true);insert into public.vault_purchasing_wallet values(100000,0,0,100000,now(),60);`);packSql(migration);
const seedPack=(n,shape)=>{const po=id(n),supplier=id(n+1000),line=id(n+100),product=id(n+10000),style=`explicit-${n}`,definition=`definition-${n}`,fingerprint=fp(n),units=shape.reduce((sum,x)=>sum+x.units,0),allocations=shape.map((x,i)=>({normalized_size:x.size,units_per_pack:x.units,ordered_units:x.units,variant_id:id(n*1000+i+1),model_design:"Blue",shopify_variant_id_snapshot:`sv-${n}-${i}`,shopify_inventory_item_id_snapshot:`ii-${n}-${i}`})),snapshot={pack_definition_id:definition,fingerprint,allocations};packSql(`insert into public.vault_suppliers values('${supplier}','GBP',1);insert into public.vault_supplier_purchasing_rules values('${supplier}',1);insert into public.vault_purchase_orders values('${po}','${supplier}','draft','GBP',1,10,null,null);insert into public.vault_purchase_order_lines values('${line}','${po}','${supplier}','${style}',1,${units},${units},10,10,'fixed_pack_purchase_recommendation',$json$${JSON.stringify(snapshot)}$json$);insert into public.vault_style_catalogue_intelligence values('${style}','${product}','${supplier}',true,'continue',null);insert into public.vault_product_commercial_intelligence values('${product}',10);insert into public.vault_fixed_pack_draft_idempotency values('${fingerprint}','${style}','${po}','${line}');insert into public.vault_purchase_order_events values('${po}','${line}','${id(1)}','fixed_pack_recommendation_added_to_draft','draft-${line}','{"fingerprint":"${fingerprint}"}');`);allocations.forEach(a=>packSql(`insert into public.vault_purchase_order_line_size_allocations values('${line}','${a.variant_id}','${product}','Blue','${a.normalized_size}','${a.shopify_variant_id_snapshot}','${a.shopify_inventory_item_id_snapshot}',${a.units_per_pack},${a.ordered_units});insert into public.vault_variants values('${a.variant_id}','${product}','shopify',true,'resolved','Blue','${a.normalized_size}','${a.shopify_variant_id_snapshot}','${a.shopify_inventory_item_id_snapshot}');insert into public.vault_supplier_style_pack_composition_intelligence values('${definition}','${supplier}','${style}','${a.normalized_size}',${a.units_per_pack},${units},${units},true,true,true,true);`));return{po,supplier,line,style,definition,fingerprint,units,allocations}};
const payload=f=>({source_family:"fixed_pack",purchase_order_id:f.po,supplier_id:f.supplier,currency_code:"GBP",expected_total_packs:1,expected_total_gbp:10,lines:[{purchase_order_line_id:f.line,source_recommendation_type:"fixed_pack_purchase_recommendation",provenance_fingerprint:f.fingerprint}]}),approve=f=>packSql(`select transitioned from public.approve_fixed_pack_vault_purchase_order('${f.po}','${id(1)}',$json$${JSON.stringify(payload(f))}$json$::jsonb)`),reject=(f,code)=>{assert.match(packFails(`select * from public.approve_fixed_pack_vault_purchase_order('${f.po}','${id(1)}',$json$${JSON.stringify(payload(f))}$json$::jsonb);`),new RegExp(code));assert.equal(packSql(`select status||'|'||coalesce(approved_by_operator_id::text,'')||'|'||coalesce(approved_at::text,'')||'|'||(select count(*) from public.vault_purchase_order_events where purchase_order_id='${f.po}' and event_type='fixed_pack_purchase_order_approved') from public.vault_purchase_orders where id='${f.po}'`),"draft|||0")};
const five=[{size:"S",units:1},{size:"M",units:1},{size:"L",units:1},{size:"XL",units:1},{size:"2XL",units:1}],six=[...five,{size:"3XL",units:1}],nonUniform=[{size:"S",units:1},{size:"M",units:2},{size:"L",units:2},{size:"XL",units:1},{size:"2XL",units:1}];assert.equal(approve(seedPack(300,five)),"t");assert.equal(approve(seedPack(310,six)),"t");assert.equal(approve(seedPack(320,nonUniform)),"t");
const mutations=[[330,f=>packSql(`delete from public.vault_supplier_style_pack_composition_intelligence where id='${f.definition}'`)],[340,f=>packSql(`update public.vault_supplier_style_pack_composition_intelligence set active=false where id='${f.definition}'`)],[350,f=>packSql(`delete from public.vault_supplier_style_pack_composition_intelligence where id='${f.definition}' and normalized_size='S'`)],[360,f=>packSql(`insert into public.vault_supplier_style_pack_composition_intelligence values('${f.definition}','${f.supplier}','${f.style}','EXTRA',1,${f.units},${f.units},true,true,true,true)`)],[370,f=>packSql(`update public.vault_supplier_style_pack_composition_intelligence set units_per_pack=2 where id='${f.definition}' and normalized_size='S'`)],[380,f=>packSql(`update public.vault_supplier_style_pack_composition_intelligence set composition_units_per_pack=${f.units+1},declared_units_per_pack=${f.units+1} where id='${f.definition}'`)],[390,f=>packSql(`update public.vault_supplier_style_pack_composition_intelligence set supplier_id='${id(888)}' where id='${f.definition}'`)],[400,f=>packSql(`update public.vault_supplier_style_pack_composition_intelligence set style_id='other-style' where id='${f.definition}'`)],[410,f=>packSql(`insert into public.vault_supplier_style_pack_composition_intelligence select 'ambiguous-${f.definition}',supplier_id,style_id,normalized_size,units_per_pack,declared_units_per_pack,composition_units_per_pack,active,composition_complete,composition_valid,commercial_pack_consistent from public.vault_supplier_style_pack_composition_intelligence where id='${f.definition}'`)]];for(const[n,mutate]of mutations){const f=seedPack(n,five);mutate(f);reject(f,"PACK_CONTRACT_CHANGED")}});
const variantContainer=`b21b3a-variant-${process.pid}`;
test("fixed-pack approval requires one exact current canonical variant per allocation",async t=>{t.after(()=>docker(["rm","-f",variantContainer]));docker(["run","--rm","-d","--name",variantContainer,"-e","POSTGRES_PASSWORD=x","-e","POSTGRES_DB=variant","postgres:17"]);const vs=q=>{const r=spawnSync("docker",["exec","-i",variantContainer,"psql","-v","ON_ERROR_STOP=1","-U","postgres","-d","variant","-t","-A"],{input:q,encoding:"utf8"});if(r.status)throw Error(r.stderr);return r.stdout.trim()},vf=q=>{const r=spawnSync("docker",["exec","-i",variantContainer,"psql","-v","ON_ERROR_STOP=1","-U","postgres","-d","variant","-t","-A"],{input:q,encoding:"utf8"});assert.notEqual(r.status,0);return r.stderr};for(let i=0;i<40;i++){try{vs("select 1");break}catch{if(i===39)throw Error("database not ready");await new Promise(r=>setTimeout(r,250))}}
vs(`create role anon;create role authenticated;create role service_role;create table public.vault_operators(id uuid primary key,is_active boolean);create table public.vault_suppliers(id uuid primary key,currency_code text,minimum_order_value numeric);create table public.vault_purchase_orders(id uuid primary key,supplier_id uuid,status text,currency text,total_packs int,estimated_total_gbp numeric,approved_by_operator_id uuid,approved_at timestamptz);create table public.vault_purchase_order_lines(id uuid primary key,purchase_order_id uuid,supplier_id uuid,style_id text,recommended_packs int,recommended_units int,units_per_pack int,pack_cost_gbp numeric,line_cost_gbp numeric,source_recommendation_type text,source_snapshot jsonb);create table public.vault_purchase_order_line_size_allocations(purchase_order_line_id uuid,variant_id uuid,parent_product_id uuid,model_design text,normalized_size text,shopify_variant_id_snapshot text,shopify_inventory_item_id_snapshot text,units_per_pack int,ordered_units int);create table public.vault_variants(id uuid,product_id uuid,source text,source_active boolean,identity_resolution_status text,model_design text,normalized_size text,source_variant_id text,source_inventory_item_id text,shopify_image_url text);create table public.vault_supplier_style_pack_composition_intelligence(id text,supplier_id uuid,style_id text,normalized_size text,units_per_pack int,declared_units_per_pack int,composition_units_per_pack int,active boolean,composition_complete boolean,composition_valid boolean,commercial_pack_consistent boolean);create table public.vault_style_catalogue_intelligence(style_id text,parent_product_id uuid,supplier_id uuid,restock_enabled boolean,inventory_strategy text,supplier_moq_packs int);create table public.vault_product_commercial_intelligence(product_id uuid,landed_cost_per_pack_gbp numeric);create table public.vault_supplier_purchasing_rules(supplier_id uuid,minimum_order_packs int);create table public.vault_fixed_pack_draft_idempotency(fingerprint text,style_id text,purchase_order_id uuid,purchase_order_line_id uuid);create table public.vault_purchase_order_events(purchase_order_id uuid,purchase_order_line_id uuid,operator_id uuid,event_type text,idempotency_key text,event_snapshot jsonb);create unique index v_event_once on public.vault_purchase_order_events(purchase_order_id,idempotency_key) where idempotency_key is not null;create table public.vault_purchasing_wallet(ledger_balance_gbp numeric,protected_reserve_gbp numeric,committed_orders_gbp numeric,available_purchasing_power_gbp numeric,wallet_last_updated timestamptz,wallet_freshness_threshold_minutes int);create table public.vault_purchase_order_payments(id int);create table public.vault_purchase_order_receipts(id int);create table public.vault_wallet_ledger(id int);insert into public.vault_operators values('${id(1)}',true);insert into public.vault_purchasing_wallet values(100000,0,0,100000,now(),60);`);vs(migration);
const seedVariant=n=>{const po=id(n),supplier=id(n+1000),line=id(n+100),variant=id(n+1),product=id(n+10000),style=`variant-${n}`,definition=`variant-pack-${n}`,fingerprint=fp(n),snapshot={pack_definition_id:definition,fingerprint,allocations:[{variant_id:variant,model_design:"Blue",normalized_size:"S",shopify_variant_id_snapshot:`sv-${n}`,shopify_inventory_item_id_snapshot:`ii-${n}`,units_per_pack:1,ordered_units:1}]};vs(`insert into public.vault_suppliers values('${supplier}','GBP',1);insert into public.vault_supplier_purchasing_rules values('${supplier}',1);insert into public.vault_purchase_orders values('${po}','${supplier}','draft','GBP',1,10,null,null);insert into public.vault_purchase_order_lines values('${line}','${po}','${supplier}','${style}',1,1,1,10,10,'fixed_pack_purchase_recommendation',$json$${JSON.stringify(snapshot)}$json$);insert into public.vault_purchase_order_line_size_allocations values('${line}','${variant}','${product}','Blue','S','sv-${n}','ii-${n}',1,1);insert into public.vault_variants values('${variant}','${product}','shopify',true,'resolved','Blue','S','sv-${n}','ii-${n}','image-a');insert into public.vault_supplier_style_pack_composition_intelligence values('${definition}','${supplier}','${style}','S',1,1,1,true,true,true,true);insert into public.vault_style_catalogue_intelligence values('${style}','${product}','${supplier}',true,'continue',null);insert into public.vault_product_commercial_intelligence values('${product}',10);insert into public.vault_fixed_pack_draft_idempotency values('${fingerprint}','${style}','${po}','${line}');insert into public.vault_purchase_order_events values('${po}','${line}','${id(1)}','fixed_pack_recommendation_added_to_draft','draft-${line}','{"fingerprint":"${fingerprint}"}');`);return{po,supplier,line,variant,product,style,definition,fingerprint}};
const vp=f=>({source_family:"fixed_pack",purchase_order_id:f.po,supplier_id:f.supplier,currency_code:"GBP",expected_total_packs:1,expected_total_gbp:10,lines:[{purchase_order_line_id:f.line,source_recommendation_type:"fixed_pack_purchase_recommendation",provenance_fingerprint:f.fingerprint}]}),vok=f=>vs(`select transitioned from public.approve_fixed_pack_vault_purchase_order('${f.po}','${id(1)}',$json$${JSON.stringify(vp(f))}$json$::jsonb)`),vreject=f=>{assert.match(vf(`select * from public.approve_fixed_pack_vault_purchase_order('${f.po}','${id(1)}',$json$${JSON.stringify(vp(f))}$json$::jsonb);`),/VARIANT_IDENTITY_CHANGED/);assert.equal(vs(`select status||'|'||coalesce(approved_by_operator_id::text,'')||'|'||coalesce(approved_at::text,'')||'|'||(select count(*) from public.vault_purchase_order_events where purchase_order_id='${f.po}' and event_type='fixed_pack_purchase_order_approved') from public.vault_purchase_orders where id='${f.po}'`),"draft|||0")};
assert.equal(vok(seedVariant(500)),"t");const image=seedVariant(510);vs(`update public.vault_variants set shopify_image_url='image-b' where id='${image.variant}'`);assert.equal(vok(image),"t");const cases=[[520,f=>vs(`delete from public.vault_variants where id='${f.variant}'`)],[530,f=>vs(`update public.vault_variants set source_active=false where id='${f.variant}'`)],[540,f=>vs(`update public.vault_variants set identity_resolution_status='unresolved' where id='${f.variant}'`)],[550,f=>vs(`update public.vault_variants set product_id='${id(999)}' where id='${f.variant}'`)],[560,f=>vs(`update public.vault_variants set model_design='Red' where id='${f.variant}'`)],[570,f=>vs(`update public.vault_variants set normalized_size='M' where id='${f.variant}'`)],[580,f=>vs(`update public.vault_variants set source_variant_id='changed' where id='${f.variant}'`)],[590,f=>vs(`update public.vault_variants set source_inventory_item_id='changed' where id='${f.variant}'`)],[600,f=>{const other=id(700);vs(`insert into public.vault_variants values('${other}','${f.product}','shopify',true,'resolved','Blue','S','other','other','image');update public.vault_purchase_order_line_size_allocations set variant_id='${other}' where purchase_order_line_id='${f.line}'`)}],[610,f=>vs(`insert into public.vault_variants values('${id(710)}','${f.product}','shopify',true,'resolved','Blue','S','other','other','image')`)],[620,f=>{vs(`update public.vault_variants set source_active=false where id='${f.variant}';insert into public.vault_variants values('${id(720)}','${f.product}','shopify',false,'resolved','Blue','S','sv-${f.po.slice(-12)}','ii','image')`)}]];for(const[n,mutate]of cases){const f=seedVariant(n);mutate(f);vreject(f)}});
test("fixed-pack approval binds each line to its original add-to-draft event", async t => {
  const c = `b21-event-${process.pid}`;

  const d = (a, i) => {
    const r = spawnSync("docker", a, { input: i, encoding: "utf8" });
    if (r.status) throw Error(r.stderr);
    return r.stdout.trim();
  };

  const q = x =>
    d(
      [
        "exec",
        "-i",
        c,
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        "event",
        "-t",
        "-A",
      ],
      x,
    );

  const bad = x => {
    const r = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        c,
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        "event",
        "-t",
        "-A",
      ],
      { input: x, encoding: "utf8" },
    );

    assert.notEqual(r.status, 0);
    return r.stderr;
  };

  t.after(() => d(["rm", "-f", c]));

  d([
    "run",
    "--rm",
    "-d",
    "--name",
    c,
    "-e",
    "POSTGRES_PASSWORD=x",
    "-e",
    "POSTGRES_DB=event",
    "postgres:17",
  ]);

  for (let i = 0; i < 40; i++) {
    try {
      q("select 1");
      break;
    } catch {
      if (i === 39) throw Error("database not ready");
      await new Promise(r => setTimeout(r, 250));
    }
  }

  q(`
    create role anon;
    create role authenticated;
    create role service_role;

    create table public.vault_operators(
      id uuid primary key,
      is_active boolean
    );

    create table public.vault_suppliers(
      id uuid primary key,
      currency_code text,
      minimum_order_value numeric
    );

    create table public.vault_purchase_orders(
      id uuid primary key,
      supplier_id uuid,
      status text,
      currency text,
      total_packs int,
      estimated_total_gbp numeric,
      approved_by_operator_id uuid,
      approved_at timestamptz
    );

    create table public.vault_purchase_order_lines(
      id uuid primary key,
      purchase_order_id uuid,
      supplier_id uuid,
      style_id text,
      recommended_packs int,
      recommended_units int,
      units_per_pack int,
      pack_cost_gbp numeric,
      line_cost_gbp numeric,
      source_recommendation_type text,
      source_snapshot jsonb
    );

    create table public.vault_purchase_order_line_size_allocations(
      purchase_order_line_id uuid,
      variant_id uuid,
      parent_product_id uuid,
      model_design text,
      normalized_size text,
      shopify_variant_id_snapshot text,
      shopify_inventory_item_id_snapshot text,
      units_per_pack int,
      ordered_units int
    );

    create table public.vault_variants(
      id uuid,
      product_id uuid,
      source text,
      source_active boolean,
      identity_resolution_status text,
      model_design text,
      normalized_size text,
      source_variant_id text,
      source_inventory_item_id text
    );

    create table public.vault_supplier_style_pack_composition_intelligence(
      id text,
      supplier_id uuid,
      style_id text,
      normalized_size text,
      units_per_pack int,
      declared_units_per_pack int,
      composition_units_per_pack int,
      active boolean,
      composition_complete boolean,
      composition_valid boolean,
      commercial_pack_consistent boolean
    );

    create table public.vault_style_catalogue_intelligence(
      style_id text,
      parent_product_id uuid,
      supplier_id uuid,
      restock_enabled boolean,
      inventory_strategy text,
      supplier_moq_packs int
    );

    create table public.vault_product_commercial_intelligence(
      product_id uuid,
      landed_cost_per_pack_gbp numeric
    );

    create table public.vault_supplier_purchasing_rules(
      supplier_id uuid,
      minimum_order_packs int
    );

    create table public.vault_fixed_pack_draft_idempotency(
      fingerprint text,
      style_id text,
      purchase_order_id uuid,
      purchase_order_line_id uuid
    );

    create table public.vault_purchase_order_events(
      purchase_order_id uuid,
      purchase_order_line_id uuid,
      operator_id uuid,
      event_type text,
      idempotency_key text,
      event_snapshot jsonb
    );

    create table public.vault_purchasing_wallet(
      ledger_balance_gbp numeric,
      protected_reserve_gbp numeric,
      committed_orders_gbp numeric,
      available_purchasing_power_gbp numeric,
      wallet_last_updated timestamptz,
      wallet_freshness_threshold_minutes int
    );

    create table public.vault_purchase_order_payments(id int);
    create table public.vault_purchase_order_receipts(id int);
    create table public.vault_wallet_ledger(id int);

    insert into public.vault_operators
    values('${id(1)}', true);

    insert into public.vault_purchasing_wallet
    values(1000, 0, 0, 1000, now(), 60);
  `);

  q(migration);

  const seed = (
    n,
    types = ["fixed_pack_purchase_recommendation"],
  ) => {
    const po = id(n);
    const s = id(n + 1000);

    const ls = types.map((type, i) => ({
      id: id(n * 100 + i),
      type,
      fp: fp(n * 10 + i),
      style: `e${n}-${i}`,
      v: id(n * 1000 + i),
      p: id(n * 10000 + i),
    }));

    q(`
      insert into public.vault_suppliers
      values('${s}', 'GBP', 1);

      insert into public.vault_supplier_purchasing_rules
      values('${s}', 1);

      insert into public.vault_purchase_orders
      values(
        '${po}',
        '${s}',
        'draft',
        'GBP',
        ${ls.length},
        ${ls.length * 10},
        null,
        null
      );
    `);

    for (const l of ls) {
      const e =
        l.type === "manual_fixed_pack_purchase"
          ? "manual_fixed_pack_added_to_draft"
          : "fixed_pack_recommendation_added_to_draft";

      const snap = {
        pack_definition_id: `d-${l.style}`,
        fingerprint: l.fp,
        allocations: [
          {
            variant_id: l.v,
            model_design: "B",
            normalized_size: "S",
            shopify_variant_id_snapshot: "sv",
            shopify_inventory_item_id_snapshot: "ii",
            units_per_pack: 1,
            ordered_units: 1,
          },
        ],
      };

      q(`
        insert into public.vault_purchase_order_lines
        values(
          '${l.id}',
          '${po}',
          '${s}',
          '${l.style}',
          1,
          1,
          1,
          10,
          10,
          '${l.type}',
          $json$${JSON.stringify(snap)}$json$
        );

        insert into public.vault_purchase_order_line_size_allocations
        values(
          '${l.id}',
          '${l.v}',
          '${l.p}',
          'B',
          'S',
          'sv',
          'ii',
          1,
          1
        );

        insert into public.vault_variants
        values(
          '${l.v}',
          '${l.p}',
          'shopify',
          true,
          'resolved',
          'B',
          'S',
          'sv',
          'ii'
        );

        insert into public.vault_supplier_style_pack_composition_intelligence
        values(
          'd-${l.style}',
          '${s}',
          '${l.style}',
          'S',
          1,
          1,
          1,
          true,
          true,
          true,
          true
        );

        insert into public.vault_style_catalogue_intelligence
        values(
          '${l.style}',
          '${l.p}',
          '${s}',
          true,
          'continue',
          null
        );

        insert into public.vault_product_commercial_intelligence
        values('${l.p}', 10);

        insert into public.vault_fixed_pack_draft_idempotency
        values(
          '${l.fp}',
          '${l.style}',
          '${po}',
          '${l.id}'
        );

        insert into public.vault_purchase_order_events
        values(
          '${po}',
          '${l.id}',
          '${id(1)}',
          '${e}',
          'k-${l.id}',
          $json$${JSON.stringify(snap)}$json$
        );
      `);
    }

    return { po, s, ls };
  };

  const p = f => ({
    source_family: "fixed_pack",
    purchase_order_id: f.po,
    supplier_id: f.s,
    currency_code: "GBP",
    expected_total_packs: f.ls.length,
    expected_total_gbp: f.ls.length * 10,
    lines: f.ls.map(l => ({
      purchase_order_line_id: l.id,
      source_recommendation_type: l.type,
      provenance_fingerprint: l.fp,
    })),
  });

  const call = f =>
    q(`
      select transitioned
      from public.approve_fixed_pack_vault_purchase_order(
        '${f.po}',
        '${id(1)}',
        $json$${JSON.stringify(p(f))}$json$::jsonb
      )
    `);

  /*
   * Ordinary failed approval fixtures begin with zero approval events.
   *
   * The substitution fixture deliberately begins with one fake
   * fixed_pack_purchase_order_approved event, so that case passes 1.
   */
  const reject = (f, expectedApprovalEvents = 0) => {
    assert.match(
      bad(`
        select *
        from public.approve_fixed_pack_vault_purchase_order(
          '${f.po}',
          '${id(1)}',
          $json$${JSON.stringify(p(f))}$json$::jsonb
        );
      `),
      /SOURCE_PROVENANCE_INVALID/,
    );

    assert.equal(
      q(`
        select
          status || '|' ||
          coalesce(approved_by_operator_id::text, '') || '|' ||
          coalesce(approved_at::text, '') || '|' ||
          (
            select count(*)
            from public.vault_purchase_order_events
            where purchase_order_id='${f.po}'
              and event_type='fixed_pack_purchase_order_approved'
          )
        from public.vault_purchase_orders
        where id='${f.po}'
      `),
      `draft|||${expectedApprovalEvents}`,
    );
  };

  // Valid recommendation event.
  assert.equal(call(seed(800)), "t");

  // Valid manual event.
  assert.equal(
    call(seed(810, ["manual_fixed_pack_purchase"])),
    "t",
  );

  // Valid mixed recommendation/manual basket.
  assert.equal(
    call(
      seed(820, [
        "fixed_pack_purchase_recommendation",
        "manual_fixed_pack_purchase",
      ]),
    ),
    "t",
  );

  // Recommendation add event missing.
  {
    const f = seed(830);

    q(`
      delete from public.vault_purchase_order_events
      where purchase_order_line_id='${f.ls[0].id}'
    `);

    reject(f);
  }

  // Manual add event missing.
  {
    const f = seed(835, ["manual_fixed_pack_purchase"]);

    assert.equal(
      q(`
        select count(*)
        from public.vault_purchase_order_events
        where purchase_order_id='${f.po}'
          and purchase_order_line_id='${f.ls[0].id}'
          and event_type='manual_fixed_pack_added_to_draft'
      `),
      "1",
    );

    q(`
      delete from public.vault_purchase_order_events
      where purchase_order_id='${f.po}'
        and purchase_order_line_id='${f.ls[0].id}'
        and event_type='manual_fixed_pack_added_to_draft'
    `);

    reject(f);
  }

  // Wrong add-event type.
  {
    const f = seed(840);

    q(`
      update public.vault_purchase_order_events
      set event_type='manual_fixed_pack_added_to_draft'
      where purchase_order_line_id='${f.ls[0].id}'
    `);

    reject(f);
  }

  // Add event bound to wrong purchase order.
  {
    const f = seed(850);

    q(`
      update public.vault_purchase_order_events
      set purchase_order_id='${id(999)}'
      where purchase_order_line_id='${f.ls[0].id}'
    `);

    reject(f);
  }

  // Add event bound to wrong line.
  {
    const f = seed(860);

    q(`
      update public.vault_purchase_order_events
      set purchase_order_line_id='${id(998)}'
      where purchase_order_line_id='${f.ls[0].id}'
    `);

    reject(f);
  }

  /*
   * An approval event must never substitute for the original
   * add-to-draft event.
   *
   * This fixture intentionally contains ONE approval-type event before
   * calling the RPC. Therefore rollback means 1 before and 1 after,
   * not zero after.
   */
  {
    const substitution = seed(870);

    q(`
      update public.vault_purchase_order_events
      set event_type='fixed_pack_purchase_order_approved'
      where purchase_order_line_id='${substitution.ls[0].id}'
    `);

    const substitutionBefore = q(`
      select count(*)
      from public.vault_purchase_order_events
      where purchase_order_id='${substitution.po}'
        and event_type='fixed_pack_purchase_order_approved'
    `);

    assert.equal(substitutionBefore, "1");

    reject(substitution, 1);

    const substitutionAfter = q(`
      select count(*)
      from public.vault_purchase_order_events
      where purchase_order_id='${substitution.po}'
        and event_type='fixed_pack_purchase_order_approved'
    `);

    assert.equal(substitutionAfter, substitutionBefore);

    assert.equal(
      q(`
        select
          status || '|' ||
          coalesce(approved_by_operator_id::text, '') || '|' ||
          coalesce(approved_at::text, '')
        from public.vault_purchase_orders
        where id='${substitution.po}'
      `),
      "draft||",
    );
  }

  /*
   * Mixed basket:
   * recommendation line remains valid;
   * only the manual line loses its required add event.
   * Whole approval must fail atomically.
   */
  {
    const mixed = seed(880, [
      "fixed_pack_purchase_recommendation",
      "manual_fixed_pack_purchase",
    ]);

    assert.equal(
      mixed.ls[0].type,
      "fixed_pack_purchase_recommendation",
    );

    assert.equal(
      mixed.ls[1].type,
      "manual_fixed_pack_purchase",
    );

    assert.equal(
      q(`
        select count(*)
        from public.vault_purchase_order_events
        where purchase_order_id='${mixed.po}'
          and purchase_order_line_id='${mixed.ls[0].id}'
          and event_type='fixed_pack_recommendation_added_to_draft'
      `),
      "1",
    );

    assert.equal(
      q(`
        select count(*)
        from public.vault_purchase_order_events
        where purchase_order_id='${mixed.po}'
          and purchase_order_line_id='${mixed.ls[1].id}'
          and event_type='manual_fixed_pack_added_to_draft'
      `),
      "1",
    );

    q(`
      delete from public.vault_purchase_order_events
      where purchase_order_id='${mixed.po}'
        and purchase_order_line_id='${mixed.ls[1].id}'
        and event_type='manual_fixed_pack_added_to_draft'
    `);

    // Recommendation event must remain untouched.
    assert.equal(
      q(`
        select count(*)
        from public.vault_purchase_order_events
        where purchase_order_id='${mixed.po}'
          and purchase_order_line_id='${mixed.ls[0].id}'
          and event_type='fixed_pack_recommendation_added_to_draft'
      `),
      "1",
    );

    // Manual event alone is gone.
    assert.equal(
      q(`
        select count(*)
        from public.vault_purchase_order_events
        where purchase_order_id='${mixed.po}'
          and purchase_order_line_id='${mixed.ls[1].id}'
          and event_type='manual_fixed_pack_added_to_draft'
      `),
      "0",
    );

    reject(mixed);

    // Failure must not mutate purchasing side-effect tables.
    assert.equal(
      q("select count(*) from public.vault_purchase_order_payments"),
      "0",
    );

    assert.equal(
      q("select count(*) from public.vault_purchase_order_receipts"),
      "0",
    );

    assert.equal(
      q("select count(*) from public.vault_wallet_ledger"),
      "0",
    );
  }
});

test("fixed-pack approval binds ledger and qualification fingerprints exactly", async t => {
  const c = `b21-ledger-${process.pid}`;

  const d = (args, input) => {
    const r = spawnSync("docker", args, {
      input,
      encoding: "utf8",
    });

    if (r.status) {
      throw Error(r.stderr || r.stdout);
    }

    return r.stdout.trim();
  };

  const q = sqlText =>
    d(
      [
        "exec",
        "-i",
        c,
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        "ledger",
        "-t",
        "-A",
      ],
      sqlText,
    );

  const bad = sqlText => {
    const r = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        c,
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        "ledger",
        "-t",
        "-A",
      ],
      {
        input: sqlText,
        encoding: "utf8",
      },
    );

    assert.notEqual(r.status, 0);
    return r.stderr;
  };

  t.after(() => d(["rm", "-f", c]));

  d([
    "run",
    "--rm",
    "-d",
    "--name",
    c,
    "-e",
    "POSTGRES_PASSWORD=x",
    "-e",
    "POSTGRES_DB=ledger",
    "postgres:17",
  ]);

  for (let i = 0; i < 40; i++) {
    try {
      q("select 1");
      break;
    } catch {
      if (i === 39) {
        throw Error("database not ready");
      }

      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }

  q(`
    create role anon;
    create role authenticated;
    create role service_role;

    create table public.vault_operators(
      id uuid primary key,
      is_active boolean
    );

    create table public.vault_suppliers(
      id uuid primary key,
      currency_code text,
      minimum_order_value numeric
    );

    create table public.vault_purchase_orders(
      id uuid primary key,
      supplier_id uuid,
      status text,
      currency text,
      total_packs int,
      estimated_total_gbp numeric,
      approved_by_operator_id uuid,
      approved_at timestamptz
    );

    create table public.vault_purchase_order_lines(
      id uuid primary key,
      purchase_order_id uuid,
      supplier_id uuid,
      style_id text,
      recommended_packs int,
      recommended_units int,
      units_per_pack int,
      pack_cost_gbp numeric,
      line_cost_gbp numeric,
      source_recommendation_type text,
      source_snapshot jsonb
    );

    create table public.vault_purchase_order_line_size_allocations(
      purchase_order_line_id uuid,
      variant_id uuid,
      parent_product_id uuid,
      model_design text,
      normalized_size text,
      shopify_variant_id_snapshot text,
      shopify_inventory_item_id_snapshot text,
      units_per_pack int,
      ordered_units int
    );

    create table public.vault_variants(
      id uuid,
      product_id uuid,
      source text,
      source_active boolean,
      identity_resolution_status text,
      model_design text,
      normalized_size text,
      source_variant_id text,
      source_inventory_item_id text
    );

    create table public.vault_supplier_style_pack_composition_intelligence(
      id text,
      supplier_id uuid,
      style_id text,
      normalized_size text,
      units_per_pack int,
      declared_units_per_pack int,
      composition_units_per_pack int,
      active boolean,
      composition_complete boolean,
      composition_valid boolean,
      commercial_pack_consistent boolean
    );

    create table public.vault_style_catalogue_intelligence(
      style_id text,
      parent_product_id uuid,
      supplier_id uuid,
      restock_enabled boolean,
      inventory_strategy text,
      supplier_moq_packs int
    );

    create table public.vault_product_commercial_intelligence(
      product_id uuid,
      landed_cost_per_pack_gbp numeric
    );

    create table public.vault_supplier_purchasing_rules(
      supplier_id uuid,
      minimum_order_packs int
    );

    create table public.vault_fixed_pack_draft_idempotency(
      fingerprint text,
      style_id text,
      purchase_order_id uuid,
      purchase_order_line_id uuid
    );

    create table public.vault_purchase_order_events(
      purchase_order_id uuid,
      purchase_order_line_id uuid,
      operator_id uuid,
      event_type text,
      idempotency_key text,
      event_snapshot jsonb
    );

    create table public.vault_purchasing_wallet(
      ledger_balance_gbp numeric,
      protected_reserve_gbp numeric,
      committed_orders_gbp numeric,
      available_purchasing_power_gbp numeric,
      wallet_last_updated timestamptz,
      wallet_freshness_threshold_minutes int
    );

    create table public.vault_purchase_order_payments(id int);
    create table public.vault_purchase_order_receipts(id int);
    create table public.vault_wallet_ledger(id int);

    insert into public.vault_operators
    values('${id(1)}', true);

    insert into public.vault_purchasing_wallet
    values(
      100000,
      0,
      0,
      100000,
      now(),
      60
    );
  `);

  q(migration);

  const seed = (
    n,
    sources = ["fixed_pack_purchase_recommendation"],
  ) => {
    const po = id(n);
    const supplier = id(n + 1000);

    const lines = sources.map((source, i) => ({
      id: id(n * 100 + i + 1),
      style: `ledger-style-${n}-${i}`,
      source,
      fingerprint: fp(n * 10 + i + 1),
      variant: id(n * 1000 + i + 1),
      product: id(n * 10000 + i + 1),
    }));

    q(`
      insert into public.vault_suppliers
      values(
        '${supplier}',
        'GBP',
        1
      );

      insert into public.vault_supplier_purchasing_rules
      values(
        '${supplier}',
        1
      );

      insert into public.vault_purchase_orders
      values(
        '${po}',
        '${supplier}',
        'draft',
        'GBP',
        ${lines.length},
        ${lines.length * 10},
        null,
        null
      );
    `);

    for (const line of lines) {
      const eventType =
        line.source === "manual_fixed_pack_purchase"
          ? "manual_fixed_pack_added_to_draft"
          : "fixed_pack_recommendation_added_to_draft";

      const snapshot = {
        pack_definition_id: `ledger-pack-${line.style}`,
        fingerprint: line.fingerprint,
        allocations: [
          {
            variant_id: line.variant,
            model_design: "Blue",
            normalized_size: "S",
            shopify_variant_id_snapshot: `sv-${line.id}`,
            shopify_inventory_item_id_snapshot: `ii-${line.id}`,
            units_per_pack: 1,
            ordered_units: 1,
          },
        ],
      };

      q(`
        insert into public.vault_purchase_order_lines
        values(
          '${line.id}',
          '${po}',
          '${supplier}',
          '${line.style}',
          1,
          1,
          1,
          10,
          10,
          '${line.source}',
          $json$${JSON.stringify(snapshot)}$json$
        );

        insert into public.vault_purchase_order_line_size_allocations
        values(
          '${line.id}',
          '${line.variant}',
          '${line.product}',
          'Blue',
          'S',
          'sv-${line.id}',
          'ii-${line.id}',
          1,
          1
        );

        insert into public.vault_variants
        values(
          '${line.variant}',
          '${line.product}',
          'shopify',
          true,
          'resolved',
          'Blue',
          'S',
          'sv-${line.id}',
          'ii-${line.id}'
        );

        insert into public.vault_supplier_style_pack_composition_intelligence
        values(
          'ledger-pack-${line.style}',
          '${supplier}',
          '${line.style}',
          'S',
          1,
          1,
          1,
          true,
          true,
          true,
          true
        );

        insert into public.vault_style_catalogue_intelligence
        values(
          '${line.style}',
          '${line.product}',
          '${supplier}',
          true,
          'continue',
          null
        );

        insert into public.vault_product_commercial_intelligence
        values(
          '${line.product}',
          10
        );

        insert into public.vault_fixed_pack_draft_idempotency
        values(
          '${line.fingerprint}',
          '${line.style}',
          '${po}',
          '${line.id}'
        );

        insert into public.vault_purchase_order_events
        values(
          '${po}',
          '${line.id}',
          '${id(1)}',
          '${eventType}',
          'ledger-${line.id}',
          $json$${JSON.stringify(snapshot)}$json$
        );
      `);
    }

    return {
      po,
      supplier,
      lines,
    };
  };

  const payload = f => ({
    source_family: "fixed_pack",
    purchase_order_id: f.po,
    supplier_id: f.supplier,
    currency_code: "GBP",
    expected_total_packs: f.lines.length,
    expected_total_gbp: f.lines.length * 10,
    lines: f.lines.map(line => ({
      purchase_order_line_id: line.id,
      source_recommendation_type: line.source,
      provenance_fingerprint: line.fingerprint,
    })),
  });

  const approve = (f, qualification = payload(f)) =>
    q(`
      select transitioned
      from public.approve_fixed_pack_vault_purchase_order(
        '${f.po}',
        '${id(1)}',
        $json$${JSON.stringify(qualification)}$json$::jsonb
      )
    `);

  const reject = (f, qualification = payload(f)) => {
    assert.match(
      bad(`
        select *
        from public.approve_fixed_pack_vault_purchase_order(
          '${f.po}',
          '${id(1)}',
          $json$${JSON.stringify(qualification)}$json$::jsonb
        );
      `),
      /SOURCE_PROVENANCE_INVALID/,
    );

    assert.equal(
      q(`
        select
          status || '|' ||
          coalesce(approved_by_operator_id::text, '') || '|' ||
          coalesce(approved_at::text, '') || '|' ||
          (
            select count(*)
            from public.vault_purchase_order_events
            where purchase_order_id='${f.po}'
              and event_type='fixed_pack_purchase_order_approved'
          )
        from public.vault_purchase_orders
        where id='${f.po}'
      `),
      "draft|||0",
    );

    assert.equal(
      q("select count(*) from public.vault_purchase_order_payments"),
      "0",
    );

    assert.equal(
      q("select count(*) from public.vault_purchase_order_receipts"),
      "0",
    );

    assert.equal(
      q("select count(*) from public.vault_wallet_ledger"),
      "0",
    );
  };

  // --------------------------------------------------
  // Valid recommendation
  // --------------------------------------------------

  {
    const f = seed(900);

    assert.equal(
      approve(f),
      "t",
    );
  }

  // --------------------------------------------------
  // Valid manual
  // --------------------------------------------------

  {
    const f = seed(
      910,
      ["manual_fixed_pack_purchase"],
    );

    assert.equal(
      approve(f),
      "t",
    );
  }

  // --------------------------------------------------
  // Valid mixed recommendation + manual
  // --------------------------------------------------

  {
    const f = seed(
      920,
      [
        "fixed_pack_purchase_recommendation",
        "manual_fixed_pack_purchase",
      ],
    );

    assert.equal(
      approve(f),
      "t",
    );
  }

  // --------------------------------------------------
  // Ledger row missing
  // --------------------------------------------------

  {
    const f = seed(930);

    q(`
      delete from public.vault_fixed_pack_draft_idempotency
      where purchase_order_id='${f.po}'
        and purchase_order_line_id='${f.lines[0].id}'
    `);

    reject(f);
  }

  // --------------------------------------------------
  // Persisted ledger fingerprint mismatch
  // --------------------------------------------------

  {
    const f = seed(940);

    q(`
      update public.vault_fixed_pack_draft_idempotency
      set fingerprint='${fp(999991)}'
      where purchase_order_id='${f.po}'
        and purchase_order_line_id='${f.lines[0].id}'
    `);

    reject(f);
  }

  // --------------------------------------------------
  // Qualification fingerprint mismatch
  // --------------------------------------------------

  {
    const f = seed(950);

    const changed = payload(f);

    changed.lines = changed.lines.map((line, i) =>
      i === 0
        ? {
            ...line,
            provenance_fingerprint: fp(999992),
          }
        : line,
    );

    reject(f, changed);
  }

  // --------------------------------------------------
  // Wrong ledger line binding
  // --------------------------------------------------

  {
    const f = seed(960);

    q(`
      update public.vault_fixed_pack_draft_idempotency
      set purchase_order_line_id='${id(999960)}'
      where purchase_order_id='${f.po}'
        and purchase_order_line_id='${f.lines[0].id}'
    `);

    reject(f);
  }

  // --------------------------------------------------
  // Wrong ledger PO binding
  // --------------------------------------------------

  {
    const f = seed(970);

    q(`
      update public.vault_fixed_pack_draft_idempotency
      set purchase_order_id='${id(999970)}'
      where purchase_order_id='${f.po}'
        and purchase_order_line_id='${f.lines[0].id}'
    `);

    reject(f);
  }

  // --------------------------------------------------
  // Wrong ledger style binding
  // --------------------------------------------------

  {
    const f = seed(980);

    q(`
      update public.vault_fixed_pack_draft_idempotency
      set style_id='wrong-ledger-style'
      where purchase_order_id='${f.po}'
        and purchase_order_line_id='${f.lines[0].id}'
    `);

    reject(f);
  }

  // --------------------------------------------------
  // Duplicate matching ledger row must fail closed
  // --------------------------------------------------

  {
    const f = seed(990);

    q(`
      insert into public.vault_fixed_pack_draft_idempotency(
        fingerprint,
        style_id,
        purchase_order_id,
        purchase_order_line_id
      )
      select
        fingerprint,
        style_id,
        purchase_order_id,
        purchase_order_line_id
      from public.vault_fixed_pack_draft_idempotency
      where purchase_order_id='${f.po}'
        and purchase_order_line_id='${f.lines[0].id}'
    `);

    reject(f);
  }

  // --------------------------------------------------
  // Mixed basket:
  // only the manual line loses its ledger row.
  // Entire PO must fail atomically.
  // --------------------------------------------------

  {
    const f = seed(
      1000,
      [
        "fixed_pack_purchase_recommendation",
        "manual_fixed_pack_purchase",
      ],
    );

    assert.equal(
      f.lines[0].source,
      "fixed_pack_purchase_recommendation",
    );

    assert.equal(
      f.lines[1].source,
      "manual_fixed_pack_purchase",
    );

    assert.equal(
      q(`
        select count(*)
        from public.vault_fixed_pack_draft_idempotency
        where purchase_order_id='${f.po}'
          and purchase_order_line_id='${f.lines[0].id}'
      `),
      "1",
    );

    assert.equal(
      q(`
        select count(*)
        from public.vault_fixed_pack_draft_idempotency
        where purchase_order_id='${f.po}'
          and purchase_order_line_id='${f.lines[1].id}'
      `),
      "1",
    );

    q(`
      delete from public.vault_fixed_pack_draft_idempotency
      where purchase_order_id='${f.po}'
        and purchase_order_line_id='${f.lines[1].id}'
    `);

    // Recommendation line ledger remains intact.
    assert.equal(
      q(`
        select count(*)
        from public.vault_fixed_pack_draft_idempotency
        where purchase_order_id='${f.po}'
          and purchase_order_line_id='${f.lines[0].id}'
      `),
      "1",
    );

    // Manual line alone is now missing.
    assert.equal(
      q(`
        select count(*)
        from public.vault_fixed_pack_draft_idempotency
        where purchase_order_id='${f.po}'
          and purchase_order_line_id='${f.lines[1].id}'
      `),
      "0",
    );

    reject(f);
  }
});

test("fixed-pack approval rejects authoritative source snapshot tampering", async t => {
  const c = `b21-snapshot-${process.pid}`;

  const d = (args, input) => {
    const r = spawnSync("docker", args, {
      input,
      encoding: "utf8",
    });

    if (r.status) {
      throw Error(r.stderr || r.stdout);
    }

    return r.stdout.trim();
  };

  const q = sqlText =>
    d(
      [
        "exec",
        "-i",
        c,
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        "snapshot",
        "-t",
        "-A",
      ],
      sqlText,
    );

  const bad = sqlText => {
    const r = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        c,
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        "snapshot",
        "-t",
        "-A",
      ],
      {
        input: sqlText,
        encoding: "utf8",
      },
    );

    assert.notEqual(r.status, 0);
    return r.stderr;
  };

  t.after(() => d(["rm", "-f", c]));

  d([
    "run",
    "--rm",
    "-d",
    "--name",
    c,
    "-e",
    "POSTGRES_PASSWORD=x",
    "-e",
    "POSTGRES_DB=snapshot",
    "postgres:17",
  ]);

  for (let i = 0; i < 40; i++) {
    try {
      q("select 1");
      break;
    } catch {
      if (i === 39) {
        throw Error("database not ready");
      }

      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }

  q(`
    create role anon;
    create role authenticated;
    create role service_role;

    create table public.vault_operators(
      id uuid primary key,
      is_active boolean
    );

    create table public.vault_suppliers(
      id uuid primary key,
      currency_code text,
      minimum_order_value numeric
    );

    create table public.vault_purchase_orders(
      id uuid primary key,
      supplier_id uuid,
      status text,
      currency text,
      total_packs int,
      estimated_total_gbp numeric,
      approved_by_operator_id uuid,
      approved_at timestamptz
    );

    create table public.vault_purchase_order_lines(
      id uuid primary key,
      purchase_order_id uuid,
      supplier_id uuid,
      style_id text,
      recommended_packs int,
      recommended_units int,
      units_per_pack int,
      pack_cost_gbp numeric,
      line_cost_gbp numeric,
      source_recommendation_type text,
      source_snapshot jsonb
    );

    create table public.vault_purchase_order_line_size_allocations(
      purchase_order_line_id uuid,
      variant_id uuid,
      parent_product_id uuid,
      model_design text,
      normalized_size text,
      shopify_variant_id_snapshot text,
      shopify_inventory_item_id_snapshot text,
      units_per_pack int,
      ordered_units int
    );

    create table public.vault_variants(
      id uuid,
      product_id uuid,
      source text,
      source_active boolean,
      identity_resolution_status text,
      model_design text,
      normalized_size text,
      source_variant_id text,
      source_inventory_item_id text
    );

    create table public.vault_supplier_style_pack_composition_intelligence(
      id text,
      supplier_id uuid,
      style_id text,
      normalized_size text,
      units_per_pack int,
      declared_units_per_pack int,
      composition_units_per_pack int,
      active boolean,
      composition_complete boolean,
      composition_valid boolean,
      commercial_pack_consistent boolean
    );

    create table public.vault_style_catalogue_intelligence(
      style_id text,
      parent_product_id uuid,
      supplier_id uuid,
      restock_enabled boolean,
      inventory_strategy text,
      supplier_moq_packs int
    );

    create table public.vault_product_commercial_intelligence(
      product_id uuid,
      landed_cost_per_pack_gbp numeric
    );

    create table public.vault_supplier_purchasing_rules(
      supplier_id uuid,
      minimum_order_packs int
    );

    create table public.vault_fixed_pack_draft_idempotency(
      fingerprint text,
      style_id text,
      purchase_order_id uuid,
      purchase_order_line_id uuid
    );

    create table public.vault_purchase_order_events(
      purchase_order_id uuid,
      purchase_order_line_id uuid,
      operator_id uuid,
      event_type text,
      idempotency_key text,
      event_snapshot jsonb
    );

    create table public.vault_purchasing_wallet(
      ledger_balance_gbp numeric,
      protected_reserve_gbp numeric,
      committed_orders_gbp numeric,
      available_purchasing_power_gbp numeric,
      wallet_last_updated timestamptz,
      wallet_freshness_threshold_minutes int
    );

    create table public.vault_purchase_order_payments(id int);
    create table public.vault_purchase_order_receipts(id int);
    create table public.vault_wallet_ledger(id int);

    insert into public.vault_operators
    values('${id(1)}', true);

    insert into public.vault_purchasing_wallet
    values(
      100000,
      0,
      0,
      100000,
      now(),
      60
    );
  `);

  q(migration);

  const seed = (
    n,
    sources = ["fixed_pack_purchase_recommendation"],
  ) => {
    const po = id(n);
    const supplier = id(n + 1000);

    const lines = sources.map((source, i) => ({
      id: id(n * 100 + i + 1),
      style: `snapshot-style-${n}-${i}`,
      source,
      fingerprint: fp(n * 10 + i + 1),
      variant: id(n * 1000 + i + 1),
      product: id(n * 10000 + i + 1),
    }));

    q(`
      insert into public.vault_suppliers
      values(
        '${supplier}',
        'GBP',
        1
      );

      insert into public.vault_supplier_purchasing_rules
      values(
        '${supplier}',
        1
      );

      insert into public.vault_purchase_orders
      values(
        '${po}',
        '${supplier}',
        'draft',
        'GBP',
        ${lines.length},
        ${lines.length * 10},
        null,
        null
      );
    `);

    for (const line of lines) {
      const eventType =
        line.source === "manual_fixed_pack_purchase"
          ? "manual_fixed_pack_added_to_draft"
          : "fixed_pack_recommendation_added_to_draft";

      const snapshot = {
        pack_definition_id: `snapshot-pack-${line.style}`,
        fingerprint: line.fingerprint,
        allocations: [
          {
            variant_id: line.variant,
            model_design: "Blue",
            normalized_size: "S",
            shopify_variant_id_snapshot: `sv-${line.id}`,
            shopify_inventory_item_id_snapshot: `ii-${line.id}`,
            units_per_pack: 1,
            ordered_units: 1,
          },
        ],
      };

      q(`
        insert into public.vault_purchase_order_lines
        values(
          '${line.id}',
          '${po}',
          '${supplier}',
          '${line.style}',
          1,
          1,
          1,
          10,
          10,
          '${line.source}',
          $json$${JSON.stringify(snapshot)}$json$
        );

        insert into public.vault_purchase_order_line_size_allocations
        values(
          '${line.id}',
          '${line.variant}',
          '${line.product}',
          'Blue',
          'S',
          'sv-${line.id}',
          'ii-${line.id}',
          1,
          1
        );

        insert into public.vault_variants
        values(
          '${line.variant}',
          '${line.product}',
          'shopify',
          true,
          'resolved',
          'Blue',
          'S',
          'sv-${line.id}',
          'ii-${line.id}'
        );

        insert into public.vault_supplier_style_pack_composition_intelligence
        values(
          'snapshot-pack-${line.style}',
          '${supplier}',
          '${line.style}',
          'S',
          1,
          1,
          1,
          true,
          true,
          true,
          true
        );

        insert into public.vault_style_catalogue_intelligence
        values(
          '${line.style}',
          '${line.product}',
          '${supplier}',
          true,
          'continue',
          null
        );

        insert into public.vault_product_commercial_intelligence
        values(
          '${line.product}',
          10
        );

        insert into public.vault_fixed_pack_draft_idempotency
        values(
          '${line.fingerprint}',
          '${line.style}',
          '${po}',
          '${line.id}'
        );

        insert into public.vault_purchase_order_events
        values(
          '${po}',
          '${line.id}',
          '${id(1)}',
          '${eventType}',
          'snapshot-${line.id}',
          $json$${JSON.stringify(snapshot)}$json$
        );
      `);
    }

    return {
      po,
      supplier,
      lines,
    };
  };

  const payload = f => ({
    source_family: "fixed_pack",
    purchase_order_id: f.po,
    supplier_id: f.supplier,
    currency_code: "GBP",
    expected_total_packs: f.lines.length,
    expected_total_gbp: f.lines.length * 10,
    lines: f.lines.map(line => ({
      purchase_order_line_id: line.id,
      source_recommendation_type: line.source,
      provenance_fingerprint: line.fingerprint,
    })),
  });

  const approve = f =>
    q(`
      select transitioned
      from public.approve_fixed_pack_vault_purchase_order(
        '${f.po}',
        '${id(1)}',
        $json$${JSON.stringify(payload(f))}$json$::jsonb
      )
    `);

  const reject = (f, expectedError = /SOURCE_PROVENANCE_INVALID/) => {
  assert.match(
    bad(`
      select *
      from public.approve_fixed_pack_vault_purchase_order(
        '${f.po}',
        '${id(1)}',
        $json$${JSON.stringify(payload(f))}$json$::jsonb
      );
    `),
    expectedError,
  );

    assert.equal(
      q(`
        select
          status || '|' ||
          coalesce(approved_by_operator_id::text, '') || '|' ||
          coalesce(approved_at::text, '') || '|' ||
          (
            select count(*)
            from public.vault_purchase_order_events
            where purchase_order_id='${f.po}'
              and event_type='fixed_pack_purchase_order_approved'
          )
        from public.vault_purchase_orders
        where id='${f.po}'
      `),
      "draft|||0",
    );

    assert.equal(
      q("select count(*) from public.vault_purchase_order_payments"),
      "0",
    );

    assert.equal(
      q("select count(*) from public.vault_purchase_order_receipts"),
      "0",
    );

    assert.equal(
      q("select count(*) from public.vault_wallet_ledger"),
      "0",
    );
  };

  // --------------------------------------------------
  // Valid recommendation snapshot
  // --------------------------------------------------

  {
    const f = seed(1100);

    assert.equal(
      approve(f),
      "t",
    );
  }

  // --------------------------------------------------
  // Valid manual snapshot
  // --------------------------------------------------

  {
    const f = seed(
      1110,
      ["manual_fixed_pack_purchase"],
    );

    assert.equal(
      approve(f),
      "t",
    );
  }

  // --------------------------------------------------
  // Valid mixed recommendation/manual snapshots
  // --------------------------------------------------

  {
    const f = seed(
      1120,
      [
        "fixed_pack_purchase_recommendation",
        "manual_fixed_pack_purchase",
      ],
    );

    assert.equal(
      approve(f),
      "t",
    );
  }

  // --------------------------------------------------
  // source_snapshot missing entirely
  // --------------------------------------------------

  {
    const f = seed(1130);

    q(`
      update public.vault_purchase_order_lines
      set source_snapshot=null
      where id='${f.lines[0].id}'
    `);

      reject(f);
  }

  // --------------------------------------------------
  // source_snapshot malformed / non-object
  // --------------------------------------------------

  {
    const f = seed(1140);

    q(`
      update public.vault_purchase_order_lines
      set source_snapshot='"tampered"'::jsonb
      where id='${f.lines[0].id}'
    `);

    reject(f);
  }

  // --------------------------------------------------
  // Snapshot fingerprint changed while ledger +
  // qualification retain original fingerprint
  // --------------------------------------------------

  {
    const f = seed(1150);

    q(`
      update public.vault_purchase_order_lines
      set source_snapshot =
        jsonb_set(
          source_snapshot,
          '{fingerprint}',
          to_jsonb('${fp(991150)}'::text)
        )
      where id='${f.lines[0].id}'
    `);

    reject(f);
  }

  // --------------------------------------------------
  // Pack definition identity tampered
  // --------------------------------------------------

  {
    const f = seed(1160);

    q(`
      update public.vault_purchase_order_lines
      set source_snapshot =
        jsonb_set(
          source_snapshot,
          '{pack_definition_id}',
          to_jsonb('wrong-pack-definition'::text)
        )
      where id='${f.lines[0].id}'
    `);

    reject(f, /PACK_CONTRACT_CHANGED/);
  }

  // --------------------------------------------------
  // Snapshot allocation variant_id tampered
  // --------------------------------------------------

  {
    const f = seed(1170);

    q(`
      update public.vault_purchase_order_lines
      set source_snapshot =
        jsonb_set(
          source_snapshot,
          '{allocations,0,variant_id}',
          to_jsonb('${id(9991170)}'::text)
        )
      where id='${f.lines[0].id}'
    `);

    reject(f);
  }

  // --------------------------------------------------
  // Snapshot model/design tampered
  // --------------------------------------------------

  {
    const f = seed(1180);

    q(`
      update public.vault_purchase_order_lines
      set source_snapshot =
        jsonb_set(
          source_snapshot,
          '{allocations,0,model_design}',
          to_jsonb('Red'::text)
        )
      where id='${f.lines[0].id}'
    `);

    reject(f);
  }

  // --------------------------------------------------
  // Snapshot normalized size tampered
  // --------------------------------------------------

  {
    const f = seed(1190);

    q(`
      update public.vault_purchase_order_lines
      set source_snapshot =
        jsonb_set(
          source_snapshot,
          '{allocations,0,normalized_size}',
          to_jsonb('M'::text)
        )
      where id='${f.lines[0].id}'
    `);

    reject(f);
  }

  // --------------------------------------------------
  // Shopify variant snapshot tampered
  // --------------------------------------------------

  {
    const f = seed(1200);

    q(`
      update public.vault_purchase_order_lines
      set source_snapshot =
        jsonb_set(
          source_snapshot,
          '{allocations,0,shopify_variant_id_snapshot}',
          to_jsonb('tampered-shopify-variant'::text)
        )
      where id='${f.lines[0].id}'
    `);

    reject(f);
  }

  // --------------------------------------------------
  // Shopify inventory item snapshot tampered
  // --------------------------------------------------

  {
    const f = seed(1210);

    q(`
      update public.vault_purchase_order_lines
      set source_snapshot =
        jsonb_set(
          source_snapshot,
          '{allocations,0,shopify_inventory_item_id_snapshot}',
          to_jsonb('tampered-inventory-item'::text)
        )
      where id='${f.lines[0].id}'
    `);

    reject(f);
  }

  // --------------------------------------------------
  // units_per_pack snapshot tampered
  // --------------------------------------------------

  {
    const f = seed(1220);

    q(`
      update public.vault_purchase_order_lines
      set source_snapshot =
        jsonb_set(
          source_snapshot,
          '{allocations,0,units_per_pack}',
          '2'::jsonb
        )
      where id='${f.lines[0].id}'
    `);

    reject(f);
  }

  // --------------------------------------------------
  // ordered_units snapshot tampered
  // --------------------------------------------------

  {
    const f = seed(1230);

    q(`
      update public.vault_purchase_order_lines
      set source_snapshot =
        jsonb_set(
          source_snapshot,
          '{allocations,0,ordered_units}',
          '2'::jsonb
        )
      where id='${f.lines[0].id}'
    `);

    reject(f);
  }

  // --------------------------------------------------
  // Event snapshot tampered independently
  // --------------------------------------------------

  {
    const f = seed(1240);

    q(`
      update public.vault_purchase_order_events
      set event_snapshot =
        jsonb_set(
          event_snapshot,
          '{allocations,0,normalized_size}',
          to_jsonb('M'::text)
        )
      where purchase_order_id='${f.po}'
        and purchase_order_line_id='${f.lines[0].id}'
    `);

    reject(f);
  }

  // --------------------------------------------------
  // Source type switched after creation
  // --------------------------------------------------

  {
    const f = seed(1250);

    q(`
      update public.vault_purchase_order_lines
      set source_recommendation_type='manual_fixed_pack_purchase'
      where id='${f.lines[0].id}'
    `);

    reject(f);
  }

  // --------------------------------------------------
  // Mixed basket:
  // only manual line snapshot is tampered.
  // Whole approval must roll back atomically.
  // --------------------------------------------------

  {
    const f = seed(
      1260,
      [
        "fixed_pack_purchase_recommendation",
        "manual_fixed_pack_purchase",
      ],
    );

    assert.equal(
      f.lines[0].source,
      "fixed_pack_purchase_recommendation",
    );

    assert.equal(
      f.lines[1].source,
      "manual_fixed_pack_purchase",
    );

    q(`
      update public.vault_purchase_order_lines
      set source_snapshot =
        jsonb_set(
          source_snapshot,
          '{allocations,0,shopify_variant_id_snapshot}',
          to_jsonb('manual-line-tampered'::text)
        )
      where id='${f.lines[1].id}'
    `);

    // Recommendation line remains untouched.
    assert.equal(
      q(`
        select
          source_snapshot #>>
          '{allocations,0,shopify_variant_id_snapshot}'
        from public.vault_purchase_order_lines
        where id='${f.lines[0].id}'
      `),
      `sv-${f.lines[0].id}`,
    );

    // Manual line alone is tampered.
    assert.equal(
      q(`
        select
          source_snapshot #>>
          '{allocations,0,shopify_variant_id_snapshot}'
        from public.vault_purchase_order_lines
        where id='${f.lines[1].id}'
      `),
      "manual-line-tampered",
    );

    reject(f);
  }
});

test(
  "fixed-pack approval enforces current commercial cost and restock policy",
  async t => {
    const c = `b21-commercial-${process.pid}`;

    const d = (args, input) => {
      const r = spawnSync("docker", args, {
        input,
        encoding: "utf8",
      });

      if (r.status) {
        throw Error(r.stderr || r.stdout);
      }

      return r.stdout.trim();
    };

    const q = text =>
      d(
        [
          "exec",
          "-i",
          c,
          "psql",
          "-v",
          "ON_ERROR_STOP=1",
          "-U",
          "postgres",
          "-d",
          "commercial",
          "-t",
          "-A",
        ],
        text,
      );

    const bad = text => {
      const r = spawnSync(
        "docker",
        [
          "exec",
          "-i",
          c,
          "psql",
          "-v",
          "ON_ERROR_STOP=1",
          "-U",
          "postgres",
          "-d",
          "commercial",
          "-t",
          "-A",
        ],
        {
          input: text,
          encoding: "utf8",
        },
      );

      assert.notEqual(r.status, 0);
      return r.stderr;
    };

    t.after(() => d(["rm", "-f", c]));

    d([
      "run",
      "--rm",
      "-d",
      "--name",
      c,
      "-e",
      "POSTGRES_PASSWORD=x",
      "-e",
      "POSTGRES_DB=commercial",
      "postgres:17",
    ]);

    for (let i = 0; i < 40; i++) {
      try {
        q("select 1");
        break;
      } catch {
        if (i === 39) throw Error("database not ready");
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }

    q(`
      create role anon;
      create role authenticated;
      create role service_role;

      create table public.vault_operators(
        id uuid primary key,
        is_active boolean
      );

      create table public.vault_suppliers(
        id uuid primary key,
        currency_code text,
        minimum_order_value numeric
      );

      create table public.vault_purchase_orders(
        id uuid primary key,
        supplier_id uuid,
        status text,
        currency text,
        total_packs int,
        estimated_total_gbp numeric,
        approved_by_operator_id uuid,
        approved_at timestamptz
      );

      create table public.vault_purchase_order_lines(
        id uuid primary key,
        purchase_order_id uuid,
        supplier_id uuid,
        style_id text,
        recommended_packs int,
        recommended_units int,
        units_per_pack int,
        pack_cost_gbp numeric,
        line_cost_gbp numeric,
        source_recommendation_type text,
        source_snapshot jsonb
      );

      create table public.vault_purchase_order_line_size_allocations(
        purchase_order_line_id uuid,
        variant_id uuid,
        parent_product_id uuid,
        model_design text,
        normalized_size text,
        shopify_variant_id_snapshot text,
        shopify_inventory_item_id_snapshot text,
        units_per_pack int,
        ordered_units int
      );

      create table public.vault_variants(
        id uuid,
        product_id uuid,
        source text,
        source_active boolean,
        identity_resolution_status text,
        model_design text,
        normalized_size text,
        source_variant_id text,
        source_inventory_item_id text
      );

      create table public.vault_supplier_style_pack_composition_intelligence(
        id text,
        supplier_id uuid,
        style_id text,
        normalized_size text,
        units_per_pack int,
        declared_units_per_pack int,
        composition_units_per_pack int,
        active boolean,
        composition_complete boolean,
        composition_valid boolean,
        commercial_pack_consistent boolean
      );

      create table public.vault_style_catalogue_intelligence(
        style_id text,
        parent_product_id uuid,
        supplier_id uuid,
        restock_enabled boolean,
        inventory_strategy text,
        supplier_moq_packs int
      );

      create table public.vault_product_commercial_intelligence(
        product_id uuid,
        landed_cost_per_pack_gbp numeric
      );

      create table public.vault_supplier_purchasing_rules(
        supplier_id uuid,
        minimum_order_packs int
      );

      create table public.vault_fixed_pack_draft_idempotency(
        fingerprint text,
        style_id text,
        purchase_order_id uuid,
        purchase_order_line_id uuid
      );

      create table public.vault_purchase_order_events(
        purchase_order_id uuid,
        purchase_order_line_id uuid,
        operator_id uuid,
        event_type text,
        idempotency_key text,
        event_snapshot jsonb
      );

      create unique index commercial_event_once
      on public.vault_purchase_order_events(
        purchase_order_id,
        idempotency_key
      )
      where idempotency_key is not null;

      create table public.vault_purchasing_wallet(
        ledger_balance_gbp numeric,
        protected_reserve_gbp numeric,
        committed_orders_gbp numeric,
        available_purchasing_power_gbp numeric,
        wallet_last_updated timestamptz,
        wallet_freshness_threshold_minutes int
      );

      create table public.vault_purchase_order_payments(id int);
      create table public.vault_purchase_order_receipts(id int);
      create table public.vault_wallet_ledger(id int);

      insert into public.vault_operators
      values('${id(1)}', true);

      insert into public.vault_purchasing_wallet
      values(
        100000,
        0,
        0,
        100000,
        now(),
        60
      );
    `);

    q(migration);

    const seed = (
      n,
      types = ["fixed_pack_purchase_recommendation"],
    ) => {
      const po = id(n);
      const supplier = id(n + 1000);

      const lines = types.map((type, i) => ({
        id: id(n * 100 + i + 1),
        type,
        style: `commercial-${n}-${i}`,
        fingerprint: fp(n * 10 + i + 1),
        variant: id(n * 1000 + i + 1),
        product: id(n * 10000 + i + 1),
      }));

      q(`
        insert into public.vault_suppliers
        values(
          '${supplier}',
          'GBP',
          1
        );

        insert into public.vault_supplier_purchasing_rules
        values(
          '${supplier}',
          1
        );

        insert into public.vault_purchase_orders
        values(
          '${po}',
          '${supplier}',
          'draft',
          'GBP',
          ${lines.length},
          ${lines.length * 10},
          null,
          null
        );
      `);

      for (const line of lines) {
        const eventType =
          line.type === "manual_fixed_pack_purchase"
            ? "manual_fixed_pack_added_to_draft"
            : "fixed_pack_recommendation_added_to_draft";

        const snapshot = {
          pack_definition_id: `pack-${line.style}`,
          fingerprint: line.fingerprint,
          allocations: [
            {
              variant_id: line.variant,
              model_design: "Blue",
              normalized_size: "S",
              shopify_variant_id_snapshot: `sv-${line.id}`,
              shopify_inventory_item_id_snapshot: `ii-${line.id}`,
              units_per_pack: 1,
              ordered_units: 1,
            },
          ],
        };

        q(`
          insert into public.vault_purchase_order_lines
          values(
            '${line.id}',
            '${po}',
            '${supplier}',
            '${line.style}',
            1,
            1,
            1,
            10,
            10,
            '${line.type}',
            $json$${JSON.stringify(snapshot)}$json$
          );

          insert into public.vault_purchase_order_line_size_allocations
          values(
            '${line.id}',
            '${line.variant}',
            '${line.product}',
            'Blue',
            'S',
            'sv-${line.id}',
            'ii-${line.id}',
            1,
            1
          );

          insert into public.vault_variants
          values(
            '${line.variant}',
            '${line.product}',
            'shopify',
            true,
            'resolved',
            'Blue',
            'S',
            'sv-${line.id}',
            'ii-${line.id}'
          );

          insert into public.vault_supplier_style_pack_composition_intelligence
          values(
            'pack-${line.style}',
            '${supplier}',
            '${line.style}',
            'S',
            1,
            1,
            1,
            true,
            true,
            true,
            true
          );

          insert into public.vault_style_catalogue_intelligence
          values(
            '${line.style}',
            '${line.product}',
            '${supplier}',
            true,
            'continue',
            null
          );

          insert into public.vault_product_commercial_intelligence
          values(
            '${line.product}',
            10
          );

          insert into public.vault_fixed_pack_draft_idempotency
          values(
            '${line.fingerprint}',
            '${line.style}',
            '${po}',
            '${line.id}'
          );

          insert into public.vault_purchase_order_events
          values(
            '${po}',
            '${line.id}',
            '${id(1)}',
            '${eventType}',
            'commercial-${line.id}',
            $json$${JSON.stringify(snapshot)}$json$
          );
        `);
      }

      return {
        po,
        supplier,
        lines,
      };
    };

    const payload = f => ({
      source_family: "fixed_pack",
      purchase_order_id: f.po,
      supplier_id: f.supplier,
      currency_code: "GBP",
      expected_total_packs: f.lines.length,
      expected_total_gbp: f.lines.length * 10,
      lines: f.lines.map(line => ({
        purchase_order_line_id: line.id,
        source_recommendation_type: line.type,
        provenance_fingerprint: line.fingerprint,
      })),
    });

    const approve = f =>
      q(`
        select transitioned
        from public.approve_fixed_pack_vault_purchase_order(
          '${f.po}',
          '${id(1)}',
          $json$${JSON.stringify(payload(f))}$json$::jsonb
        )
      `);

    const reject = (f, expectedError) => {
      assert.match(
        bad(`
          select *
          from public.approve_fixed_pack_vault_purchase_order(
            '${f.po}',
            '${id(1)}',
            $json$${JSON.stringify(payload(f))}$json$::jsonb
          );
        `),
        expectedError,
      );

      assert.equal(
        q(`
          select
            status || '|' ||
            coalesce(approved_by_operator_id::text, '') || '|' ||
            coalesce(approved_at::text, '') || '|' ||
            (
              select count(*)
              from public.vault_purchase_order_events
              where purchase_order_id='${f.po}'
                and event_type='fixed_pack_purchase_order_approved'
            )
          from public.vault_purchase_orders
          where id='${f.po}'
        `),
        "draft|||0",
      );

      assert.equal(
        q("select count(*) from public.vault_purchase_order_payments"),
        "0",
      );

      assert.equal(
        q("select count(*) from public.vault_purchase_order_receipts"),
        "0",
      );

      assert.equal(
        q("select count(*) from public.vault_wallet_ledger"),
        "0",
      );
    };

    // --------------------------------------------------
    // Valid recommendation-only basket.
    // --------------------------------------------------

    assert.equal(
      approve(seed(1200)),
      "t",
    );

    // --------------------------------------------------
    // Valid manual-only basket.
    //
    // No demand/recommendation tables exist in this fixture.
    // Therefore success also proves that manual fixed-pack
    // approval does NOT depend on positive demand.
    // --------------------------------------------------

    assert.equal(
      approve(
        seed(
          1210,
          ["manual_fixed_pack_purchase"],
        ),
      ),
      "t",
    );

    // --------------------------------------------------
    // Valid mixed recommendation + manual basket.
    // --------------------------------------------------

    assert.equal(
      approve(
        seed(
          1220,
          [
            "fixed_pack_purchase_recommendation",
            "manual_fixed_pack_purchase",
          ],
        ),
      ),
      "t",
    );

    // --------------------------------------------------
    // Current canonical landed pack cost changed.
    // --------------------------------------------------

    {
      const f = seed(1230);
      const line = f.lines[0];

      q(`
        update public.vault_product_commercial_intelligence
        set landed_cost_per_pack_gbp=11
        where product_id='${line.product}'
      `);

      reject(
        f,
        /COMMERCIAL_COST_CHANGED/,
      );
    }

    // --------------------------------------------------
    // Persisted line cost no longer agrees with
    // recommended packs × current canonical pack cost.
    // --------------------------------------------------

    {
      const f = seed(1240);
      const line = f.lines[0];

      q(`
        update public.vault_purchase_order_lines
        set line_cost_gbp=11
        where id='${line.id}'
      `);

      reject(
        f,
        /COMMERCIAL_COST_CHANGED/,
      );
    }

    // --------------------------------------------------
    // Current canonical commercial cost missing.
    // --------------------------------------------------

    {
      const f = seed(1250);
      const line = f.lines[0];

      q(`
        delete from public.vault_product_commercial_intelligence
        where product_id='${line.product}'
      `);

      reject(
        f,
        /COMMERCIAL_COST_CHANGED/,
      );
    }

    // --------------------------------------------------
    // Current canonical commercial cost = zero.
    // --------------------------------------------------

    {
      const f = seed(1260);
      const line = f.lines[0];

      q(`
        update public.vault_product_commercial_intelligence
        set landed_cost_per_pack_gbp=0
        where product_id='${line.product}'
      `);

      reject(
        f,
        /COMMERCIAL_COST_CHANGED/,
      );
    }

    // --------------------------------------------------
    // Current canonical commercial cost negative.
    // --------------------------------------------------

    {
      const f = seed(1270);
      const line = f.lines[0];

      q(`
        update public.vault_product_commercial_intelligence
        set landed_cost_per_pack_gbp=-1
        where product_id='${line.product}'
      `);

      reject(
        f,
        /COMMERCIAL_COST_CHANGED/,
      );
    }

    // --------------------------------------------------
    // Recommendation line: restock explicitly disabled.
    // --------------------------------------------------

    {
      const f = seed(1280);
      const line = f.lines[0];

      q(`
        update public.vault_style_catalogue_intelligence
        set restock_enabled=false
        where style_id='${line.style}'
      `);

      reject(
        f,
        /RESTOCK_DISABLED/,
      );
    }

    // --------------------------------------------------
    // Manual line: do_not_restock policy.
    // --------------------------------------------------

    {
      const f = seed(
        1290,
        ["manual_fixed_pack_purchase"],
      );

      const line = f.lines[0];

      q(`
        update public.vault_style_catalogue_intelligence
        set inventory_strategy='do_not_restock'
        where style_id='${line.style}'
      `);

      reject(
        f,
        /RESTOCK_DISABLED/,
      );
    }

    // --------------------------------------------------
    // Mixed basket atomicity.
    //
    // Recommendation line remains commercially valid.
    // Manual line's current canonical cost changes.
    // Entire PO must remain draft.
    // --------------------------------------------------

    {
      const f = seed(
        1300,
        [
          "fixed_pack_purchase_recommendation",
          "manual_fixed_pack_purchase",
        ],
      );

      const recommendationLine = f.lines[0];
      const manualLine = f.lines[1];

      assert.equal(
        recommendationLine.type,
        "fixed_pack_purchase_recommendation",
      );

      assert.equal(
        manualLine.type,
        "manual_fixed_pack_purchase",
      );

      q(`
        update public.vault_product_commercial_intelligence
        set landed_cost_per_pack_gbp=11
        where product_id='${manualLine.product}'
      `);

      reject(
        f,
        /COMMERCIAL_COST_CHANGED/,
      );

      assert.equal(
        q(`
          select count(*)
          from public.vault_purchase_order_events
          where purchase_order_id='${f.po}'
            and event_type='fixed_pack_purchase_order_approved'
        `),
        "0",
      );
    }
        // ==================================================
    // B21B3A2C2
    // Product MOQ + supplier basket MOQ +
    // supplier minimum order value.
    // ==================================================

    // --------------------------------------------------
    // Product/style MOQ NULL = no line-level restriction.
    // --------------------------------------------------

    {
      const f = seed(1310);
      const line = f.lines[0];

      q(`
        update public.vault_style_catalogue_intelligence
        set supplier_moq_packs=null
        where style_id='${line.style}'
      `);

      assert.equal(
        approve(f),
        "t",
      );
    }

    // --------------------------------------------------
    // Product/style MOQ exactly equals line pack count.
    // --------------------------------------------------

    {
      const f = seed(1320);
      const line = f.lines[0];

      q(`
        update public.vault_style_catalogue_intelligence
        set supplier_moq_packs=1
        where style_id='${line.style}'
      `);

      assert.equal(
        approve(f),
        "t",
      );
    }

    // --------------------------------------------------
    // Product/style MOQ above line pack count.
    // Dedicated PRODUCT_MOQ_NOT_MET must now be reachable.
    // --------------------------------------------------

    {
      const f = seed(1330);
      const line = f.lines[0];

      q(`
        update public.vault_style_catalogue_intelligence
        set supplier_moq_packs=2
        where style_id='${line.style}'
      `);

      reject(
        f,
        /PRODUCT_MOQ_NOT_MET/,
      );
    }

    // --------------------------------------------------
    // Supplier basket MOQ exactly equals basket packs.
    // --------------------------------------------------

    {
      const f = seed(1340);

      q(`
        update public.vault_supplier_purchasing_rules
        set minimum_order_packs=1
        where supplier_id='${f.supplier}'
      `);

      assert.equal(
        approve(f),
        "t",
      );
    }

    // --------------------------------------------------
    // Supplier basket MOQ exceeds basket packs.
    // --------------------------------------------------

    {
      const f = seed(1350);

      q(`
        update public.vault_supplier_purchasing_rules
        set minimum_order_packs=2
        where supplier_id='${f.supplier}'
      `);

      reject(
        f,
        /SUPPLIER_PACK_MOQ_NOT_MET/,
      );
    }

    // --------------------------------------------------
    // Mixed recommendation/manual basket contributes
    // together to supplier MOQ.
    //
    // Fixture has:
    // recommendation = 1 pack
    // manual         = 1 pack
    // basket         = 2 packs
    //
    // Supplier MOQ = 2 => succeeds.
    // --------------------------------------------------

    {
      const f = seed(
        1360,
        [
          "fixed_pack_purchase_recommendation",
          "manual_fixed_pack_purchase",
        ],
      );

      q(`
        update public.vault_supplier_purchasing_rules
        set minimum_order_packs=2
        where supplier_id='${f.supplier}'
      `);

      assert.equal(
        approve(f),
        "t",
      );
    }

    // --------------------------------------------------
    // Same mixed 2-pack basket, supplier MOQ = 3.
    // Whole basket must fail.
    // --------------------------------------------------

    {
      const f = seed(
        1370,
        [
          "fixed_pack_purchase_recommendation",
          "manual_fixed_pack_purchase",
        ],
      );

      q(`
        update public.vault_supplier_purchasing_rules
        set minimum_order_packs=3
        where supplier_id='${f.supplier}'
      `);

      reject(
        f,
        /SUPPLIER_PACK_MOQ_NOT_MET/,
      );
    }

    // --------------------------------------------------
    // Supplier minimum order value NULL =
    // no minimum-value restriction.
    // --------------------------------------------------

    {
      const f = seed(1380);

      q(`
        update public.vault_suppliers
        set minimum_order_value=null
        where id='${f.supplier}'
      `);

      assert.equal(
        approve(f),
        "t",
      );
    }

    // --------------------------------------------------
    // Supplier minimum value exactly equals basket value.
    //
    // One pack @ £10 = £10.
    // --------------------------------------------------

    {
      const f = seed(1390);

      q(`
        update public.vault_suppliers
        set minimum_order_value=10
        where id='${f.supplier}'
      `);

      assert.equal(
        approve(f),
        "t",
      );
    }

    // --------------------------------------------------
    // Supplier minimum value exceeds basket value.
    //
    // £10 basket against £11 minimum.
    // --------------------------------------------------

    {
      const f = seed(1400);

      q(`
        update public.vault_suppliers
        set minimum_order_value=11
        where id='${f.supplier}'
      `);

      reject(
        f,
        /SUPPLIER_MIN_VALUE_NOT_MET/,
      );
    }

    // --------------------------------------------------
    // Mixed recommendation/manual basket contributes
    // together to supplier minimum value.
    //
    // Two lines @ £10 each = £20.
    // Minimum £20 => succeeds.
    // --------------------------------------------------

    {
      const f = seed(
        1410,
        [
          "fixed_pack_purchase_recommendation",
          "manual_fixed_pack_purchase",
        ],
      );

      q(`
        update public.vault_suppliers
        set minimum_order_value=20
        where id='${f.supplier}'
      `);

      assert.equal(
        approve(f),
        "t",
      );
    }

    // --------------------------------------------------
    // Same £20 mixed basket against £21 minimum.
    // Entire PO must remain draft.
    // --------------------------------------------------

    {
      const f = seed(
        1420,
        [
          "fixed_pack_purchase_recommendation",
          "manual_fixed_pack_purchase",
        ],
      );

      q(`
        update public.vault_suppliers
        set minimum_order_value=21
        where id='${f.supplier}'
      `);

      reject(
        f,
        /SUPPLIER_MIN_VALUE_NOT_MET/,
      );
    }
        // ==================================================
    // B21B3A2C3
    // Currency + header totals + final atomic rollback.
    // ==================================================

    // --------------------------------------------------
    // PO currency must be GBP.
    // --------------------------------------------------

    {
      const f = seed(1430);

      q(`
        update public.vault_purchase_orders
        set currency='EUR'
        where id='${f.po}'
      `);

      reject(
        f,
        /CURRENCY_NOT_GBP/,
      );
    }

    // --------------------------------------------------
    // Supplier operational currency must be GBP.
    // --------------------------------------------------

    {
      const f = seed(1440);

      q(`
        update public.vault_suppliers
        set currency_code='EUR'
        where id='${f.supplier}'
      `);

      reject(
        f,
        /CURRENCY_NOT_GBP/,
      );
    }

    // --------------------------------------------------
    // Header total_packs mismatch.
    // --------------------------------------------------

    {
      const f = seed(1450);

      q(`
        update public.vault_purchase_orders
        set total_packs=2
        where id='${f.po}'
      `);

      reject(
        f,
        /HEADER_TOTAL_MISMATCH/,
      );
    }

    // --------------------------------------------------
    // Header estimated_total_gbp mismatch.
    // --------------------------------------------------

    {
      const f = seed(1460);

      q(`
        update public.vault_purchase_orders
        set estimated_total_gbp=11
        where id='${f.po}'
      `);

      reject(
        f,
        /HEADER_TOTAL_MISMATCH/,
      );
    }

    // --------------------------------------------------
    // Qualification expected_total_packs mismatch.
    // --------------------------------------------------

    {
      const f = seed(1470);

      const badPayload = {
        ...payload(f),
        expected_total_packs: 2,
      };

      assert.match(
        bad(`
          select *
          from public.approve_fixed_pack_vault_purchase_order(
            '${f.po}',
            '${id(1)}',
            $json$${JSON.stringify(badPayload)}$json$::jsonb
          );
        `),
        /HEADER_TOTAL_MISMATCH/,
      );

      assert.equal(
        q(`
          select
            status || '|' ||
            coalesce(approved_by_operator_id::text, '') || '|' ||
            coalesce(approved_at::text, '') || '|' ||
            (
              select count(*)
              from public.vault_purchase_order_events
              where purchase_order_id='${f.po}'
                and event_type='fixed_pack_purchase_order_approved'
            )
          from public.vault_purchase_orders
          where id='${f.po}'
        `),
        "draft|||0",
      );

      assert.equal(
        q("select count(*) from public.vault_purchase_order_payments"),
        "0",
      );

      assert.equal(
        q("select count(*) from public.vault_purchase_order_receipts"),
        "0",
      );

      assert.equal(
        q("select count(*) from public.vault_wallet_ledger"),
        "0",
      );
    }

    // --------------------------------------------------
    // Qualification expected_total_gbp mismatch.
    // --------------------------------------------------

    {
      const f = seed(1480);

      const badPayload = {
        ...payload(f),
        expected_total_gbp: 11,
      };

      assert.match(
        bad(`
          select *
          from public.approve_fixed_pack_vault_purchase_order(
            '${f.po}',
            '${id(1)}',
            $json$${JSON.stringify(badPayload)}$json$::jsonb
          );
        `),
        /HEADER_TOTAL_MISMATCH/,
      );

      assert.equal(
        q(`
          select
            status || '|' ||
            coalesce(approved_by_operator_id::text, '') || '|' ||
            coalesce(approved_at::text, '') || '|' ||
            (
              select count(*)
              from public.vault_purchase_order_events
              where purchase_order_id='${f.po}'
                and event_type='fixed_pack_purchase_order_approved'
            )
          from public.vault_purchase_orders
          where id='${f.po}'
        `),
        "draft|||0",
      );

      assert.equal(
        q("select count(*) from public.vault_purchase_order_payments"),
        "0",
      );

      assert.equal(
        q("select count(*) from public.vault_purchase_order_receipts"),
        "0",
      );

      assert.equal(
        q("select count(*) from public.vault_wallet_ledger"),
        "0",
      );
    }

    // --------------------------------------------------
    // Mixed recommendation/manual basket:
    // one line becomes commercially invalid.
    //
    // Entire approval must roll back.
    // --------------------------------------------------

    {
      const f = seed(
        1490,
        [
          "fixed_pack_purchase_recommendation",
          "manual_fixed_pack_purchase",
        ],
      );

      const manualLine = f.lines[1];

      q(`
        update public.vault_product_commercial_intelligence
        set landed_cost_per_pack_gbp=11
        where product_id='${manualLine.product}'
      `);

      reject(
        f,
        /COMMERCIAL_COST_CHANGED/,
      );

      assert.equal(
        q(`
          select count(*)
          from public.vault_purchase_order_events
          where purchase_order_id='${f.po}'
            and event_type='fixed_pack_purchase_order_approved'
        `),
        "0",
      );

      assert.equal(
        q("select count(*) from public.vault_purchase_order_payments"),
        "0",
      );

      assert.equal(
        q("select count(*) from public.vault_purchase_order_receipts"),
        "0",
      );

      assert.equal(
        q("select count(*) from public.vault_wallet_ledger"),
        "0",
      );
    }
        // ==================================================
    // B21B3A2D1
    // Wallet availability, freshness, reserve-safe
    // capacity, and existing fixed-pack commitments.
    // ==================================================

    const currentFixedPackCommitments = () =>
      Number(
        q(`
          select coalesce(
            sum(approved_order.estimated_total_gbp),
            0
          )
          from public.vault_purchase_orders approved_order
          where approved_order.status='approved'
            and exists(
              select 1
              from public.vault_purchase_order_events approval_event
              where approval_event.purchase_order_id=approved_order.id
                and approval_event.event_type='fixed_pack_purchase_order_approved'
            )
        `),
      );

    const resetWallet = () => {
      q(`
        delete from public.vault_purchasing_wallet;

        insert into public.vault_purchasing_wallet
        values(
          100000,
          0,
          0,
          100000,
          now(),
          60
        );
      `);
    };

    // --------------------------------------------------
    // Missing canonical wallet.
    // --------------------------------------------------

    {
      const f = seed(1500);

      q(`
        delete from public.vault_purchasing_wallet
      `);

      reject(
        f,
        /canonical purchasing wallet is unavailable/i,
      );

      resetWallet();
    }

    // --------------------------------------------------
    // Wallet exists but is stale.
    // --------------------------------------------------

    {
      const f = seed(1510);

      q(`
        update public.vault_purchasing_wallet
        set
          wallet_last_updated=now()-interval '2 hours',
          wallet_freshness_threshold_minutes=60
      `);

      reject(
        f,
        /canonical purchasing wallet is stale/i,
      );

      resetWallet();
    }

    // --------------------------------------------------
    // Purchasing power is one pound short.
    //
    // Existing approved fixed-pack commitments are
    // included in the authoritative capacity calculation.
    // --------------------------------------------------

    {
      const f = seed(1520);
      const commitments = currentFixedPackCommitments();

      q(`
        update public.vault_purchasing_wallet
        set
          ledger_balance_gbp=100000,
          protected_reserve_gbp=0,
          committed_orders_gbp=0,
          available_purchasing_power_gbp=${commitments + 9},
          wallet_last_updated=now(),
          wallet_freshness_threshold_minutes=60
      `);

      reject(
        f,
        /exact saved basket exceeds current reserve-safe purchasing capacity/i,
      );

      resetWallet();
    }

    // --------------------------------------------------
    // Available purchasing power is sufficient, but
    // protected reserve makes the basket unsafe.
    // --------------------------------------------------

    {
      const f = seed(1530);
      const commitments = currentFixedPackCommitments();

      q(`
        update public.vault_purchasing_wallet
        set
          ledger_balance_gbp=${commitments + 10},
          protected_reserve_gbp=1,
          committed_orders_gbp=0,
          available_purchasing_power_gbp=100000,
          wallet_last_updated=now(),
          wallet_freshness_threshold_minutes=60
      `);

      reject(
        f,
        /exact saved basket exceeds current reserve-safe purchasing capacity/i,
      );

      resetWallet();
    }

    // --------------------------------------------------
    // Exact remaining purchasing capacity succeeds.
    //
    // Basket = £10.
    // Remaining purchasing power after existing
    // fixed-pack commitments = exactly £10.
    // Reserve-safe ledger capacity = exactly £10.
    // --------------------------------------------------

    {
      const f = seed(1540);
      const commitments = currentFixedPackCommitments();

      q(`
        update public.vault_purchasing_wallet
        set
          ledger_balance_gbp=${commitments + 10},
          protected_reserve_gbp=0,
          committed_orders_gbp=0,
          available_purchasing_power_gbp=${commitments + 10},
          wallet_last_updated=now(),
          wallet_freshness_threshold_minutes=60
      `);

      assert.equal(
        approve(f),
        "t",
      );

      resetWallet();
    }

    // --------------------------------------------------
    // Existing approved fixed-pack PO commitments must
    // reduce capacity for a later PO.
    //
    // We capture commitments BEFORE approving a new
    // £10 basket.
    //
    // Then available purchasing power is set to:
    //
    // previous commitments + £19
    //
    // Without counting the new approved £10 commitment,
    // the next £10 PO would fit.
    //
    // With the new approved commitment included,
    // only £9 remains, so approval must fail.
    // --------------------------------------------------

    {
      resetWallet();

      const commitmentsBefore =
        currentFixedPackCommitments();

      const committedPo = seed(1550);

      assert.equal(
        approve(committedPo),
        "t",
      );

      const commitmentsAfter =
        currentFixedPackCommitments();

      assert.equal(
        commitmentsAfter,
        commitmentsBefore + 10,
      );

      const candidate = seed(1560);

      q(`
        update public.vault_purchasing_wallet
        set
          ledger_balance_gbp=100000,
          protected_reserve_gbp=0,
          committed_orders_gbp=0,
          available_purchasing_power_gbp=${commitmentsBefore + 19},
          wallet_last_updated=now(),
          wallet_freshness_threshold_minutes=60
      `);

      reject(
        candidate,
        /exact saved basket exceeds current reserve-safe purchasing capacity/i,
      );

      assert.equal(
        q(`
          select status
          from public.vault_purchase_orders
          where id='${committedPo.po}'
        `),
        "approved",
      );

      assert.equal(
        q(`
          select status
          from public.vault_purchase_orders
          where id='${candidate.po}'
        `),
        "draft",
      );

      assert.equal(
        q(`
          select count(*)
          from public.vault_purchase_order_events
          where purchase_order_id='${candidate.po}'
            and event_type='fixed_pack_purchase_order_approved'
        `),
        "0",
      );

      resetWallet();
    }
    test(
  "fixed-pack approval serializes concurrent wallet capacity safely",
  async t => {
    const c = `b21-concurrency-${process.pid}`;

    const d = (args, input) => {
      const r = spawnSync("docker", args, {
        input,
        encoding: "utf8",
      });

      if (r.status) {
        throw Error(r.stderr || r.stdout);
      }

      return r.stdout.trim();
    };

    const q = text =>
      d(
        [
          "exec",
          "-i",
          c,
          "psql",
          "-v",
          "ON_ERROR_STOP=1",
          "-U",
          "postgres",
          "-d",
          "commercial",
          "-t",
          "-A",
        ],
        text,
      );

    const asyncSql = text =>
      new Promise(resolve => {
        const child = spawn(
          "docker",
          [
            "exec",
            "-i",
            c,
            "psql",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "postgres",
            "-d",
            "commercial",
            "-t",
            "-A",
          ],
          {
            stdio: ["pipe", "pipe", "pipe"],
          },
        );

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", chunk => {
          stdout += chunk.toString();
        });

        child.stderr.on("data", chunk => {
          stderr += chunk.toString();
        });

        child.on("close", code => {
          resolve({
            code,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
          });
        });

        child.stdin.end(text);
      });

    t.after(() => d(["rm", "-f", c]));

    d([
      "run",
      "--rm",
      "-d",
      "--name",
      c,
      "-e",
      "POSTGRES_PASSWORD=x",
      "-e",
      "POSTGRES_DB=commercial",
      "postgres:17",
    ]);

    for (let i = 0; i < 40; i++) {
      try {
        q("select 1");
        break;
      } catch {
        if (i === 39) throw Error("database not ready");
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }

    q(`
      create role anon;
      create role authenticated;
      create role service_role;

      create table public.vault_operators(
        id uuid primary key,
        is_active boolean
      );

      create table public.vault_suppliers(
        id uuid primary key,
        currency_code text,
        minimum_order_value numeric
      );

      create table public.vault_purchase_orders(
        id uuid primary key,
        supplier_id uuid,
        status text,
        currency text,
        total_packs int,
        estimated_total_gbp numeric,
        approved_by_operator_id uuid,
        approved_at timestamptz
      );

      create table public.vault_purchase_order_lines(
        id uuid primary key,
        purchase_order_id uuid,
        supplier_id uuid,
        style_id text,
        recommended_packs int,
        recommended_units int,
        units_per_pack int,
        pack_cost_gbp numeric,
        line_cost_gbp numeric,
        source_recommendation_type text,
        source_snapshot jsonb
      );

      create table public.vault_purchase_order_line_size_allocations(
        purchase_order_line_id uuid,
        variant_id uuid,
        parent_product_id uuid,
        model_design text,
        normalized_size text,
        shopify_variant_id_snapshot text,
        shopify_inventory_item_id_snapshot text,
        units_per_pack int,
        ordered_units int
      );

      create table public.vault_variants(
        id uuid,
        product_id uuid,
        source text,
        source_active boolean,
        identity_resolution_status text,
        model_design text,
        normalized_size text,
        source_variant_id text,
        source_inventory_item_id text
      );

      create table public.vault_supplier_style_pack_composition_intelligence(
        id text,
        supplier_id uuid,
        style_id text,
        normalized_size text,
        units_per_pack int,
        declared_units_per_pack int,
        composition_units_per_pack int,
        active boolean,
        composition_complete boolean,
        composition_valid boolean,
        commercial_pack_consistent boolean
      );

      create table public.vault_style_catalogue_intelligence(
        style_id text,
        parent_product_id uuid,
        supplier_id uuid,
        restock_enabled boolean,
        inventory_strategy text,
        supplier_moq_packs int
      );

      create table public.vault_product_commercial_intelligence(
        product_id uuid,
        landed_cost_per_pack_gbp numeric
      );

      create table public.vault_supplier_purchasing_rules(
        supplier_id uuid,
        minimum_order_packs int
      );

      create table public.vault_fixed_pack_draft_idempotency(
        fingerprint text,
        style_id text,
        purchase_order_id uuid,
        purchase_order_line_id uuid
      );

      create table public.vault_purchase_order_events(
        purchase_order_id uuid,
        purchase_order_line_id uuid,
        operator_id uuid,
        event_type text,
        idempotency_key text,
        event_snapshot jsonb
      );

      create unique index concurrency_event_once
      on public.vault_purchase_order_events(
        purchase_order_id,
        idempotency_key
      )
      where idempotency_key is not null;

      create table public.vault_purchasing_wallet(
        ledger_balance_gbp numeric,
        protected_reserve_gbp numeric,
        committed_orders_gbp numeric,
        available_purchasing_power_gbp numeric,
        wallet_last_updated timestamptz,
        wallet_freshness_threshold_minutes int
      );

      create table public.vault_purchase_order_payments(id int);
      create table public.vault_purchase_order_receipts(id int);
      create table public.vault_wallet_ledger(id int);

      insert into public.vault_operators
      values('${id(1)}', true);

      insert into public.vault_purchasing_wallet
      values(
        10,
        0,
        0,
        10,
        now(),
        60
      );
    `);

    q(migration);

    const seedConcurrent = n => {
      const po = id(n);
      const supplier = id(n + 1000);
      const line = id(n * 100 + 1);
      const variant = id(n * 1000 + 1);
      const product = id(n * 10000 + 1);
      const style = `concurrency-${n}`;
      const fingerprint = fp(n);

      const snapshot = {
        pack_definition_id: `pack-${style}`,
        fingerprint,
        allocations: [
          {
            variant_id: variant,
            model_design: "Blue",
            normalized_size: "S",
            shopify_variant_id_snapshot: `sv-${line}`,
            shopify_inventory_item_id_snapshot: `ii-${line}`,
            units_per_pack: 1,
            ordered_units: 1,
          },
        ],
      };

      q(`
        insert into public.vault_suppliers
        values(
          '${supplier}',
          'GBP',
          null
        );

        insert into public.vault_supplier_purchasing_rules
        values(
          '${supplier}',
          null
        );

        insert into public.vault_purchase_orders
        values(
          '${po}',
          '${supplier}',
          'draft',
          'GBP',
          1,
          10,
          null,
          null
        );

        insert into public.vault_purchase_order_lines
        values(
          '${line}',
          '${po}',
          '${supplier}',
          '${style}',
          1,
          1,
          1,
          10,
          10,
          'fixed_pack_purchase_recommendation',
          $json$${JSON.stringify(snapshot)}$json$
        );

        insert into public.vault_purchase_order_line_size_allocations
        values(
          '${line}',
          '${variant}',
          '${product}',
          'Blue',
          'S',
          'sv-${line}',
          'ii-${line}',
          1,
          1
        );

        insert into public.vault_variants
        values(
          '${variant}',
          '${product}',
          'shopify',
          true,
          'resolved',
          'Blue',
          'S',
          'sv-${line}',
          'ii-${line}'
        );

        insert into public.vault_supplier_style_pack_composition_intelligence
        values(
          'pack-${style}',
          '${supplier}',
          '${style}',
          'S',
          1,
          1,
          1,
          true,
          true,
          true,
          true
        );

        insert into public.vault_style_catalogue_intelligence
        values(
          '${style}',
          '${product}',
          '${supplier}',
          true,
          'continue',
          null
        );

        insert into public.vault_product_commercial_intelligence
        values(
          '${product}',
          10
        );

        insert into public.vault_fixed_pack_draft_idempotency
        values(
          '${fingerprint}',
          '${style}',
          '${po}',
          '${line}'
        );

        insert into public.vault_purchase_order_events
        values(
          '${po}',
          '${line}',
          '${id(1)}',
          'fixed_pack_recommendation_added_to_draft',
          'concurrency-${line}',
          $json$${JSON.stringify(snapshot)}$json$
        );
      `);

      const qualification = {
        source_family: "fixed_pack",
        purchase_order_id: po,
        supplier_id: supplier,
        currency_code: "GBP",
        expected_total_packs: 1,
        expected_total_gbp: 10,
        lines: [
          {
            purchase_order_line_id: line,
            source_recommendation_type:
              "fixed_pack_purchase_recommendation",
            provenance_fingerprint: fingerprint,
          },
        ],
      };

      return {
        po,
        qualification,
      };
    };

    const sqlFor = f => `
      select
        transitioned
      from public.approve_fixed_pack_vault_purchase_order(
        '${f.po}',
        '${id(1)}',
        $json$${JSON.stringify(f.qualification)}$json$::jsonb
      );
    `;

    // --------------------------------------------------
    // Cross-PO wallet concurrency.
    //
    // Wallet can fund exactly ONE £10 PO.
    // Two separate approval transactions race.
    //
    // Global advisory transaction lock must ensure:
    // exactly one approval succeeds.
    // --------------------------------------------------

    const first = seedConcurrent(1600);
    const second = seedConcurrent(1610);

    const [r1, r2] = await Promise.all([
      asyncSql(sqlFor(first)),
      asyncSql(sqlFor(second)),
    ]);

    const successes = [r1, r2].filter(
      r => r.code === 0 && r.stdout === "t",
    );

    const failures = [r1, r2].filter(
      r =>
        r.code !== 0 &&
        /exact saved basket exceeds current reserve-safe purchasing capacity/i.test(
          r.stderr,
        ),
    );

    assert.equal(
      successes.length,
      1,
      `expected exactly one successful concurrent approval: ${JSON.stringify(
        { r1, r2 },
      )}`,
    );

    assert.equal(
      failures.length,
      1,
      `expected exactly one capacity rejection: ${JSON.stringify(
        { r1, r2 },
      )}`,
    );

    assert.equal(
      q(`
        select count(*)
        from public.vault_purchase_orders
        where id in ('${first.po}','${second.po}')
          and status='approved'
      `),
      "1",
    );

    assert.equal(
      q(`
        select count(*)
        from public.vault_purchase_orders
        where id in ('${first.po}','${second.po}')
          and status='draft'
      `),
      "1",
    );

    assert.equal(
      q(`
        select count(*)
        from public.vault_purchase_order_events
        where purchase_order_id in ('${first.po}','${second.po}')
          and event_type='fixed_pack_purchase_order_approved'
      `),
      "1",
    );

    assert.equal(
      q("select count(*) from public.vault_purchase_order_payments"),
      "0",
    );

    assert.equal(
      q("select count(*) from public.vault_purchase_order_receipts"),
      "0",
    );

    assert.equal(
      q("select count(*) from public.vault_wallet_ledger"),
      "0",
    );

    // --------------------------------------------------
    // Same-PO concurrent repeat.
    //
    // Restore enough wallet capacity.
    // Two sessions approve the SAME draft simultaneously.
    //
    // One transaction must perform the transition.
    // The other must observe the already-approved PO and
    // return transitioned=false.
    //
    // Exactly one approval event must exist.
    // --------------------------------------------------

    q(`
      update public.vault_purchasing_wallet
      set
        ledger_balance_gbp=100000,
        protected_reserve_gbp=0,
        committed_orders_gbp=0,
        available_purchasing_power_gbp=100000,
        wallet_last_updated=now(),
        wallet_freshness_threshold_minutes=60
    `);

    const same = seedConcurrent(1620);

    const [same1, same2] = await Promise.all([
      asyncSql(sqlFor(same)),
      asyncSql(sqlFor(same)),
    ]);

    assert.equal(
      same1.code,
      0,
      `first same-PO approval failed: ${same1.stderr}`,
    );

    assert.equal(
      same2.code,
      0,
      `second same-PO approval failed: ${same2.stderr}`,
    );

    const sameResults = [
      same1.stdout,
      same2.stdout,
    ].sort();

    assert.deepEqual(
      sameResults,
      ["f", "t"],
    );

    assert.equal(
      q(`
        select status
        from public.vault_purchase_orders
        where id='${same.po}'
      `),
      "approved",
    );

    assert.equal(
      q(`
        select count(*)
        from public.vault_purchase_order_events
        where purchase_order_id='${same.po}'
          and event_type='fixed_pack_purchase_order_approved'
      `),
      "1",
    );

    assert.equal(
      q("select count(*) from public.vault_purchase_order_payments"),
      "0",
    );

    assert.equal(
      q("select count(*) from public.vault_purchase_order_receipts"),
      "0",
    );

    assert.equal(
      q("select count(*) from public.vault_wallet_ledger"),
      "0",
    );
  },
);
  },
);