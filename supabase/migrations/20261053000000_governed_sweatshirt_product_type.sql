begin;

-- Compatibility is a governed relationship, not an inference from a shared
-- pack quantity. Commercial profiles remain independently supplier-specific.
create table public.vault_cost_type_pack_profile_compatibilities (
  cost_type_id text not null references public.vault_cost_types(id) on delete restrict,
  pack_profile_id text not null references public.vault_pack_profiles(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (cost_type_id, pack_profile_id)
);

-- Preserve only existing same-name identities; equal unit counts alone are not
-- evidence that a product type and pack profile are compatible.
insert into public.vault_cost_type_pack_profile_compatibilities (cost_type_id, pack_profile_id)
select cost_type.id, pack_profile.id
from public.vault_cost_types cost_type
join public.vault_pack_profiles pack_profile
  on lower(regexp_replace(trim(cost_type.display_name), 's$', ''))
   = lower(regexp_replace(trim(pack_profile.display_name), 's$', ''))
where cost_type.active and pack_profile.active and pack_profile.units_per_pack is not null
on conflict (cost_type_id, pack_profile_id) do nothing;

insert into public.vault_cost_types (id, display_name)
values ('sweatshirt', 'Sweatshirt')
on conflict (id) do nothing;

insert into public.vault_pack_profiles (id, display_name, units_per_pack)
values ('sweatshirt_5_piece', 'Sweatshirt', 5)
on conflict (id) do nothing;

insert into public.vault_cost_type_pack_profile_compatibilities (cost_type_id, pack_profile_id)
values ('sweatshirt', 'sweatshirt_5_piece')
on conflict (cost_type_id, pack_profile_id) do nothing;

-- A complete replacement-cost profile requires verified FX, shipping, and all
-- landed-cost components. Record the supplied merchandise fact separately so
-- unknown Sweatshirt shipping cannot be represented as zero or borrowed from
-- another Exclusive product type.
create table public.vault_supplier_product_type_merchandise_cost_evidence (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.vault_suppliers(id) on delete restrict,
  cost_type_id text not null references public.vault_cost_types(id) on delete restrict,
  pack_profile_id text not null references public.vault_pack_profiles(id) on delete restrict,
  supplier_currency text not null check (supplier_currency in ('GBP','EUR','USD','TRY')),
  merchandise_pack_cost numeric(12,2) not null check (merchandise_pack_cost > 0),
  cost_scope text not null check (cost_scope = 'merchandise_only'),
  shipping_evidence_status text not null check (shipping_evidence_status = 'unknown'),
  recorded_at timestamptz not null default clock_timestamp(),
  source_note text not null check (nullif(trim(source_note), '') is not null),
  unique (supplier_id, cost_type_id, pack_profile_id, recorded_at)
);

create function public.reject_supplier_product_type_merchandise_cost_evidence_mutation() returns trigger
language plpgsql set search_path = '' as $$ begin
  raise exception 'Supplier product-type merchandise cost evidence is immutable';
end $$;

create trigger supplier_product_type_merchandise_cost_evidence_immutable
before update or delete on public.vault_supplier_product_type_merchandise_cost_evidence
for each row execute function public.reject_supplier_product_type_merchandise_cost_evidence_mutation();

do $evidence$
declare exclusive_supplier_id uuid;
begin
  select supplier.id into exclusive_supplier_id
  from public.vault_suppliers supplier
  where lower(trim(supplier.supplier_name)) = 'exclusive' and supplier.is_active;
  if exclusive_supplier_id is null then raise exception 'Active Exclusive supplier is required for Sweatshirt merchandise-cost evidence'; end if;
  insert into public.vault_supplier_product_type_merchandise_cost_evidence
    (supplier_id, cost_type_id, pack_profile_id, supplier_currency, merchandise_pack_cost, cost_scope, shipping_evidence_status, source_note)
  values
    (exclusive_supplier_id, 'sweatshirt', 'sweatshirt_5_piece', 'USD', 80.00, 'merchandise_only', 'unknown', 'Owner-supplied Exclusive Sweatshirt merchandise cost: USD 80.00 per five-unit pack; shipping evidence is not yet supplied.')
  on conflict do nothing;
end $evidence$;

alter table public.vault_cost_type_pack_profile_compatibilities enable row level security;
revoke all on public.vault_cost_type_pack_profile_compatibilities from public, anon, authenticated;
grant select, insert, update on public.vault_cost_type_pack_profile_compatibilities to service_role;

alter table public.vault_supplier_product_type_merchandise_cost_evidence enable row level security;
revoke all on public.vault_supplier_product_type_merchandise_cost_evidence from public, anon, authenticated, service_role;
grant select, insert on public.vault_supplier_product_type_merchandise_cost_evidence to service_role;
revoke all on function public.reject_supplier_product_type_merchandise_cost_evidence_mutation() from public, anon, authenticated, service_role;

-- The predecessor already validates active type and pack identities. Add the
-- compatibility gate without altering its commercial-cost fail-closed path.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.create_pending_catalogue_purchase_line(jsonb)'::regprocedure) into definition;
  definition := replace(definition,
    'if v_governed_units is null or v_governed_units<=0 then raise exception ''PENDING_CATALOGUE_PACK_PROFILE_INVALID''; end if;',
    'if v_governed_units is null or v_governed_units<=0 then raise exception ''PENDING_CATALOGUE_PACK_PROFILE_INVALID''; end if; if not exists(select 1 from public.vault_cost_type_pack_profile_compatibilities c where c.cost_type_id=v_cost_type and c.pack_profile_id=v_pack_profile and c.active) then raise exception ''PENDING_CATALOGUE_PACK_PROFILE_INCOMPATIBLE''; end if;');
  if position('PENDING_CATALOGUE_PACK_PROFILE_INCOMPATIBLE' in definition)=0 then raise exception 'Pending catalogue compatibility predecessor was not found'; end if;
  execute definition;
end $migration$;

notify pgrst, 'reload schema';
commit;
