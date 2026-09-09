-- Phase 3D-3: explicit supplier/style apparel pack composition. No backfill.
create table public.vault_supplier_style_pack_definitions (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.vault_suppliers(id) on delete restrict,
  style_id text not null check (nullif(trim(style_id), '') is not null),
  declared_units_per_pack integer not null check (declared_units_per_pack > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (supplier_id, style_id)
);
create table public.vault_supplier_style_pack_composition (
  supplier_id uuid not null, style_id text not null,
  normalized_size text not null check (normalized_size in ('S','M','L','XL','2XL','3XL')),
  units_per_pack integer not null check (units_per_pack > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (supplier_id, style_id, normalized_size),
  foreign key (supplier_id, style_id) references public.vault_supplier_style_pack_definitions(supplier_id, style_id) on delete cascade
);
create or replace function public.validate_vault_supplier_style_pack_definition() returns trigger language plpgsql set search_path = '' as $$
declare matching_style_count integer;
begin
  select count(*) into matching_style_count from public.vault_style_catalogue_intelligence s where s.style_id = new.style_id and s.supplier_id = new.supplier_id;
  if matching_style_count = 0 then
    raise exception 'Supplier does not own canonical style %', new.style_id using errcode = '23514';
  elsif matching_style_count > 1 then
    raise exception 'Canonical supplier/style ownership is ambiguous for %', new.style_id using errcode = '23514';
  end if; return new;
end; $$;
create trigger validate_vault_supplier_style_pack_definition before insert or update of supplier_id, style_id on public.vault_supplier_style_pack_definitions for each row execute function public.validate_vault_supplier_style_pack_definition();
create or replace function public.set_vault_supplier_style_pack_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end; $$;
create trigger vault_supplier_style_pack_definitions_updated_at before update on public.vault_supplier_style_pack_definitions for each row execute function public.set_vault_supplier_style_pack_updated_at();
create trigger vault_supplier_style_pack_composition_updated_at before update on public.vault_supplier_style_pack_composition for each row execute function public.set_vault_supplier_style_pack_updated_at();
create or replace view public.vault_supplier_style_pack_composition_intelligence as
with totals as (select d.id,d.supplier_id,d.style_id,d.declared_units_per_pack,d.active,d.updated_at,coalesce(sum(c.units_per_pack),0)::integer composition_units_per_pack,count(c.normalized_size)::integer composition_size_count from public.vault_supplier_style_pack_definitions d left join public.vault_supplier_style_pack_composition c using(supplier_id,style_id) group by d.id), context as (select t.*,s.parent_product_id,pc.units_per_pack commercial_units_per_pack from totals t left join public.vault_style_catalogue_intelligence s on s.style_id=t.style_id and s.supplier_id=t.supplier_id left join public.vault_product_commercial_intelligence pc on pc.product_id=s.parent_product_id)
select c.id,c.supplier_id,c.style_id,c.parent_product_id,d.normalized_size,d.units_per_pack,c.declared_units_per_pack,c.commercial_units_per_pack,c.composition_units_per_pack,(c.active and c.composition_size_count>0 and c.composition_units_per_pack=c.declared_units_per_pack) composition_complete,(c.active and c.parent_product_id is not null and c.composition_size_count>0 and c.composition_units_per_pack=c.declared_units_per_pack) composition_valid,case when c.commercial_units_per_pack is null then null else c.commercial_units_per_pack=c.declared_units_per_pack end commercial_pack_consistent,c.active,c.updated_at,array_remove(array[case when not c.active then 'pack_definition_inactive' end,case when c.parent_product_id is null then 'style_not_found_or_supplier_style_mismatch' end,case when c.composition_size_count=0 then 'composition_missing' end,case when c.composition_size_count>0 and c.composition_units_per_pack<>c.declared_units_per_pack then 'composition_total_mismatch' end,case when c.commercial_units_per_pack is null then 'commercial_pack_size_unavailable' end,case when c.commercial_units_per_pack is not null and c.commercial_units_per_pack<>c.declared_units_per_pack then 'commercial_pack_size_mismatch' end],null) missing_requirements
from context c left join public.vault_supplier_style_pack_composition d using(supplier_id,style_id);
revoke all on public.vault_supplier_style_pack_definitions, public.vault_supplier_style_pack_composition, public.vault_supplier_style_pack_composition_intelligence from anon, authenticated;
notify pgrst, 'reload schema';
