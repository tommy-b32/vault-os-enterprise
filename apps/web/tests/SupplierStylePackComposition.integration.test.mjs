import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const migration = await readFile(new URL("../../../supabase/migrations/20260913000000_supplier_style_pack_composition.sql", import.meta.url), "utf8");
const container = `vault-3d3-${process.pid}`;
let started = false;
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
function docker(args, input) { const r = spawnSync("docker", args, { input, encoding: "utf8" }); if (r.status) throw Error(r.stderr || r.stdout); return r.stdout.trim(); }
function sql(text) { return docker(["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "phase3d3", "-t", "-A"], text); }

test("actual 3D-3 ownership and pack contract", async (t) => {
  t.after(() => { if (started) spawnSync("docker", ["rm", "-f", container]); });
  docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=x", "-e", "POSTGRES_DB=phase3d3", "postgres:17"]); started = true;
  for (let i = 0; i < 40; i++) { try { sql("select 1"); break; } catch { if (i === 39) throw Error("database not ready"); await new Promise((r) => setTimeout(r, 250)); } }
  sql(`create role anon;create role authenticated;create extension pgcrypto;create table public.vault_suppliers(id uuid primary key);create table public.src(style_id text,supplier_id uuid,parent_product_id uuid);create view public.vault_style_catalogue_intelligence as select * from public.src;create table public.vault_product_commercial_intelligence(product_id uuid primary key,units_per_pack integer);insert into public.vault_suppliers values('${id(1)}'),('${id(2)}');insert into public.src values('${id(10)}::X','${id(1)}','${id(10)}'),('${id(11)}::Y','${id(1)}','${id(11)}'),('${id(11)}::Y','${id(1)}','${id(11)}'),('${id(12)}::Z','${id(1)}','${id(12)}'),('${id(13)}::Null',null,'${id(13)}');insert into public.vault_product_commercial_intelligence values('${id(10)}',8)`);
  sql(migration);
  sql(`insert into public.src values('${id(20)}::Shared','${id(1)}','${id(20)}'),('${id(20)}::Shared','${id(2)}','${id(20)}'),('${id(21)}::Under','${id(1)}','${id(21)}'),('${id(22)}::Over','${id(1)}','${id(22)}'),('${id(23)}::Constraints','${id(1)}','${id(23)}'),('${id(24)}::Default','${id(1)}','${id(24)}'),('${id(25)}::Mismatch','${id(1)}','${id(25)}'),('${id(26)}::Absent','${id(1)}','${id(26)}'),('${id(27)}::Inactive','${id(1)}','${id(27)}'),('${id(28)}::Declared','${id(1)}','${id(28)}'),('${id(29)}::Update','${id(1)}','${id(29)}');insert into public.vault_product_commercial_intelligence values('${id(25)}',6)`);
  // UNIQUE OWNERSHIP and VALID PACK
  sql(`insert into public.vault_supplier_style_pack_definitions(supplier_id,style_id,declared_units_per_pack) values('${id(1)}','${id(10)}::X',8),('${id(1)}','${id(12)}::Z',8);insert into public.vault_supplier_style_pack_composition(supplier_id,style_id,normalized_size,units_per_pack) values('${id(1)}','${id(10)}::X','S',1),('${id(1)}','${id(10)}::X','M',2),('${id(1)}','${id(10)}::X','L',2),('${id(1)}','${id(10)}::X','XL',2),('${id(1)}','${id(10)}::X','2XL',1)`);
  assert.equal(sql(`select composition_units_per_pack||','||composition_complete||','||composition_valid||','||commercial_pack_consistent from public.vault_supplier_style_pack_composition_intelligence where style_id='${id(10)}::X' limit 1`), "8,true,true,true");
  // NO COMPOSITION
  assert.equal(sql(`select composition_complete||','||composition_valid||','||(missing_requirements @> array['composition_missing']) from public.vault_supplier_style_pack_composition_intelligence where style_id='${id(12)}::Z' limit 1`), "false,false,true");
  // AMBIGUOUS OWNERSHIP
  assert.throws(() => sql(`insert into public.vault_supplier_style_pack_definitions(supplier_id,style_id,declared_units_per_pack) values('${id(1)}','${id(11)}::Y',8)`));
  // ZERO MATCH
  assert.throws(() => sql(`insert into public.vault_supplier_style_pack_definitions(supplier_id,style_id,declared_units_per_pack) values('${id(1)}','${id(99)}::Missing',8)`));
  // WRONG SUPPLIER
  assert.throws(() => sql(`insert into public.vault_supplier_style_pack_definitions(supplier_id,style_id,declared_units_per_pack) values('${id(2)}','${id(10)}::X',8)`));
  // NULL SUPPLIER
  assert.throws(() => sql(`insert into public.vault_supplier_style_pack_definitions(supplier_id,style_id,declared_units_per_pack) values('${id(1)}','${id(13)}::Null',8)`));
  // SAME STYLE ID UNDER DIFFERENT SUPPLIERS
  sql(`insert into public.vault_supplier_style_pack_definitions(supplier_id,style_id,declared_units_per_pack) values('${id(1)}','${id(20)}::Shared',1),('${id(2)}','${id(20)}::Shared',1)`);
  assert.equal(sql(`select count(*) from public.vault_supplier_style_pack_definitions where style_id='${id(20)}::Shared'`), "2");
  // UNDER-TOTAL COMPOSITION
  sql(`insert into public.vault_supplier_style_pack_definitions(supplier_id,style_id,declared_units_per_pack) values('${id(1)}','${id(21)}::Under',8);insert into public.vault_supplier_style_pack_composition values('${id(1)}','${id(21)}::Under','S',1),('${id(1)}','${id(21)}::Under','M',2),('${id(1)}','${id(21)}::Under','L',2),('${id(1)}','${id(21)}::Under','XL',1),('${id(1)}','${id(21)}::Under','2XL',1)`);
  assert.equal(sql(`select composition_units_per_pack||','||composition_complete||','||composition_valid||','||(missing_requirements @> array['composition_total_mismatch']) from public.vault_supplier_style_pack_composition_intelligence where style_id='${id(21)}::Under' limit 1`), "7,false,false,true");
  // OVER-TOTAL COMPOSITION
  sql(`insert into public.vault_supplier_style_pack_definitions(supplier_id,style_id,declared_units_per_pack) values('${id(1)}','${id(22)}::Over',8);insert into public.vault_supplier_style_pack_composition values('${id(1)}','${id(22)}::Over','S',1),('${id(1)}','${id(22)}::Over','M',2),('${id(1)}','${id(22)}::Over','L',2),('${id(1)}','${id(22)}::Over','XL',3),('${id(1)}','${id(22)}::Over','2XL',1)`);
  assert.equal(sql(`select composition_units_per_pack||','||composition_complete||','||composition_valid||','||(missing_requirements @> array['composition_total_mismatch']) from public.vault_supplier_style_pack_composition_intelligence where style_id='${id(22)}::Over' limit 1`), "9,false,false,true");
  sql(`insert into public.vault_supplier_style_pack_definitions(supplier_id,style_id,declared_units_per_pack) values('${id(1)}','${id(23)}::Constraints',1);insert into public.vault_supplier_style_pack_composition values('${id(1)}','${id(23)}::Constraints','M',1)`);
  // DUPLICATE SIZE
  assert.throws(() => sql(`insert into public.vault_supplier_style_pack_composition values('${id(1)}','${id(23)}::Constraints','M',1)`));
  // ZERO / NEGATIVE UNITS
  assert.throws(() => sql(`insert into public.vault_supplier_style_pack_composition values('${id(1)}','${id(23)}::Constraints','L',0)`));
  assert.throws(() => sql(`insert into public.vault_supplier_style_pack_composition values('${id(1)}','${id(23)}::Constraints','L',-1)`));
  // UNSUPPORTED APPAREL SIZE and SHOE SIZE
  assert.throws(() => sql(`insert into public.vault_supplier_style_pack_composition values('${id(1)}','${id(23)}::Constraints','4XL',1)`));
  assert.throws(() => sql(`insert into public.vault_supplier_style_pack_composition values('${id(1)}','${id(23)}::Constraints','9',1)`));
  // DEFAULT MODEL
  sql(`insert into public.vault_supplier_style_pack_definitions(supplier_id,style_id,declared_units_per_pack) values('${id(1)}','${id(24)}::Default',8);insert into public.vault_supplier_style_pack_composition values('${id(1)}','${id(24)}::Default','S',1),('${id(1)}','${id(24)}::Default','M',2),('${id(1)}','${id(24)}::Default','L',2),('${id(1)}','${id(24)}::Default','XL',2),('${id(1)}','${id(24)}::Default','2XL',1)`);
  assert.equal(sql(`select composition_units_per_pack||','||composition_complete||','||composition_valid from public.vault_supplier_style_pack_composition_intelligence where style_id='${id(24)}::Default' limit 1`), "8,true,true");
  // COMMERCIAL MISMATCH
  sql(`insert into public.vault_supplier_style_pack_definitions(supplier_id,style_id,declared_units_per_pack) values('${id(1)}','${id(25)}::Mismatch',5);insert into public.vault_supplier_style_pack_composition values('${id(1)}','${id(25)}::Mismatch','S',2),('${id(1)}','${id(25)}::Mismatch','M',3)`);
  assert.equal(sql(`select composition_valid||','||commercial_pack_consistent||','||(missing_requirements @> array['commercial_pack_size_mismatch']) from public.vault_supplier_style_pack_composition_intelligence where style_id='${id(25)}::Mismatch' limit 1`), "true,false,true");
  // COMMERCIAL UNAVAILABLE
  sql(`insert into public.vault_supplier_style_pack_definitions(supplier_id,style_id,declared_units_per_pack) values('${id(1)}','${id(26)}::Absent',8);insert into public.vault_supplier_style_pack_composition values('${id(1)}','${id(26)}::Absent','S',3),('${id(1)}','${id(26)}::Absent','M',5)`);
  assert.equal(sql(`select composition_valid||','||(commercial_pack_consistent is null)||','||(missing_requirements @> array['commercial_pack_size_unavailable']) from public.vault_supplier_style_pack_composition_intelligence where style_id='${id(26)}::Absent' limit 1`), "true,true,true");
  // INACTIVE DEFINITION
  sql(`insert into public.vault_supplier_style_pack_definitions(supplier_id,style_id,declared_units_per_pack) values('${id(1)}','${id(27)}::Inactive',8);insert into public.vault_supplier_style_pack_composition values('${id(1)}','${id(27)}::Inactive','S',8);update public.vault_supplier_style_pack_definitions set active=false where style_id='${id(27)}::Inactive'`);
  assert.equal(sql(`select active||','||composition_valid||','||(missing_requirements @> array['pack_definition_inactive']) from public.vault_supplier_style_pack_composition_intelligence where style_id='${id(27)}::Inactive' limit 1`), "false,false,true");
  // DECLARED SIZE CHANGE
  sql(`insert into public.vault_supplier_style_pack_definitions(supplier_id,style_id,declared_units_per_pack) values('${id(1)}','${id(28)}::Declared',8);insert into public.vault_supplier_style_pack_composition values('${id(1)}','${id(28)}::Declared','S',8);update public.vault_supplier_style_pack_definitions set declared_units_per_pack=6 where style_id='${id(28)}::Declared'`);
  assert.equal(sql(`select composition_units_per_pack||','||composition_complete||','||composition_valid||','||(missing_requirements @> array['composition_total_mismatch']) from public.vault_supplier_style_pack_composition_intelligence where style_id='${id(28)}::Declared' limit 1`), "8,false,false,true");
  // COMPOSITION UPDATE / CORRECTION
  sql(`insert into public.vault_supplier_style_pack_definitions(supplier_id,style_id,declared_units_per_pack) values('${id(1)}','${id(29)}::Update',8);insert into public.vault_supplier_style_pack_composition values('${id(1)}','${id(29)}::Update','S',6),('${id(1)}','${id(29)}::Update','XL',2);update public.vault_supplier_style_pack_composition set units_per_pack=1 where style_id='${id(29)}::Update' and normalized_size='XL'`);
  assert.equal(sql(`select composition_units_per_pack||','||composition_valid from public.vault_supplier_style_pack_composition_intelligence where style_id='${id(29)}::Update' limit 1`), "7,false");
  sql(`update public.vault_supplier_style_pack_composition set units_per_pack=2 where style_id='${id(29)}::Update' and normalized_size='XL'`);
  assert.equal(sql(`select composition_units_per_pack||','||composition_complete||','||composition_valid||','||(missing_requirements @> array['composition_total_mismatch']) from public.vault_supplier_style_pack_composition_intelligence where style_id='${id(29)}::Update' limit 1`), "8,true,true,false");
  // SAME SUPPLIER, DIFFERENT STYLES
  assert.equal(sql(`select count(*)||','||sum(composition_units_per_pack) from (select distinct style_id,composition_units_per_pack from public.vault_supplier_style_pack_composition_intelligence where supplier_id='${id(1)}' and style_id in ('${id(10)}::X','${id(24)}::Default')) s`), "2,16");
  // SAME STYLE, DIFFERENT SUPPLIERS
  sql(`insert into public.vault_supplier_style_pack_composition values('${id(1)}','${id(20)}::Shared','S',1),('${id(2)}','${id(20)}::Shared','S',1)`);
  assert.equal(sql(`select count(*)||','||sum(composition_units_per_pack) from (select distinct supplier_id,composition_units_per_pack from public.vault_supplier_style_pack_composition_intelligence where style_id='${id(20)}::Shared') s`), "2,2");
  // VALID-ROW CONSERVATION
  assert.equal(sql("select count(*) from public.vault_supplier_style_pack_composition_intelligence where composition_valid and composition_units_per_pack<>declared_units_per_pack"), "0");
  // SOURCE DETAIL / INTELLIGENCE TOTAL CONSERVATION
  assert.equal(sql(`select count(*) from (select supplier_id,style_id,sum(units_per_pack) total from public.vault_supplier_style_pack_composition group by supplier_id,style_id) source join (select supplier_id,style_id,max(composition_units_per_pack) total from public.vault_supplier_style_pack_composition_intelligence group by supplier_id,style_id) intel using(supplier_id,style_id) where source.total<>intel.total`), "0");
});
