-- Supplier + governed cost-type replacement-cost profiles.
-- Existing product costs remain the effective source until an operator explicitly
-- enables inheritance for a component.
begin;

create table public.vault_cost_types (
  id text primary key check (id ~ '^[a-z0-9_]+$'),
  display_name text not null check (nullif(trim(display_name), '') is not null),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vault_product_cost_type_assignments (
  product_id uuid primary key references public.vault_products(id) on delete restrict,
  cost_type_id text not null references public.vault_cost_types(id) on delete restrict,
  assigned_by_operator_id uuid references public.vault_operators(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vault_supplier_product_type_cost_profiles (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.vault_suppliers(id) on delete restrict,
  cost_type_id text not null references public.vault_cost_types(id) on delete restrict,
  supplier_currency text not null check (supplier_currency in ('GBP','EUR','USD','TRY')),
  exchange_rate_to_gbp numeric(12,6) not null check (exchange_rate_to_gbp > 0),
  pack_cost numeric(12,2) not null check (pack_cost > 0),
  shipping_cost_per_pack numeric(12,2) not null default 0 check (shipping_cost_per_pack >= 0),
  import_cost_per_pack numeric(12,2) not null default 0 check (import_cost_per_pack >= 0),
  units_per_pack integer not null check (units_per_pack > 0),
  price_updated_at date not null,
  effective_from timestamptz not null default clock_timestamp(),
  active boolean not null default true,
  superseded_at timestamptz,
  notes text,
  created_by_operator_id uuid references public.vault_operators(id) on delete restrict,
  updated_by_operator_id uuid references public.vault_operators(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((active and superseded_at is null) or not active)
);
create unique index vault_supplier_product_type_cost_profiles_one_active
  on public.vault_supplier_product_type_cost_profiles(supplier_id, cost_type_id) where active;

create table public.vault_supplier_product_type_cost_profile_versions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.vault_supplier_product_type_cost_profiles(id) on delete restrict,
  effective_from timestamptz not null,
  snapshot jsonb not null,
  reason text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(profile_id, effective_from)
);
create function public.reject_supplier_cost_profile_version_mutation() returns trigger
language plpgsql set search_path = '' as $$ begin raise exception 'Supplier cost profile versions are immutable'; end; $$;
create trigger supplier_cost_profile_versions_immutable before update or delete on public.vault_supplier_product_type_cost_profile_versions
for each row execute function public.reject_supplier_cost_profile_version_mutation();

-- Each boolean is an explicit operator choice.  Existing products receive no rows,
-- so their legacy product-level economics cannot silently become inherited.
create table public.vault_product_cost_profile_inheritance (
  product_id uuid primary key references public.vault_products(id) on delete restrict,
  profile_id uuid references public.vault_supplier_product_type_cost_profiles(id) on delete restrict,
  inherit_pack_cost boolean not null default false,
  inherit_shipping_cost boolean not null default false,
  inherit_import_cost boolean not null default false,
  inherit_units_per_pack boolean not null default false,
  inherit_fx boolean not null default false,
  updated_by_operator_id uuid references public.vault_operators(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (profile_id is not null or not (inherit_pack_cost or inherit_shipping_cost or inherit_import_cost or inherit_units_per_pack or inherit_fx))
);

create or replace function public.touch_supplier_cost_profile_updated_at() returns trigger
language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end; $$;
create trigger supplier_cost_profile_updated before update on public.vault_supplier_product_type_cost_profiles for each row execute function public.touch_supplier_cost_profile_updated_at();
create trigger product_cost_type_assignment_updated before update on public.vault_product_cost_type_assignments for each row execute function public.touch_supplier_cost_profile_updated_at();
create trigger product_cost_profile_inheritance_updated before update on public.vault_product_cost_profile_inheritance for each row execute function public.touch_supplier_cost_profile_updated_at();

-- Replace in place so existing replenishment and purchasing views retain their
-- dependency on the canonical public view.  The ASP migration already preserved
-- the raw operator-cost view under this stable legacy name.
create or replace view public.vault_product_commercial_intelligence as
with matched as (
  select legacy.*, asp.realised_average_selling_price_gbp as realised_average_selling_price,
    asp.net_revenue_gbp, asp.net_units_sold, asp.order_count, asp.window_start, asp.window_end,
    asp.latest_sale_at, asp.order_history_freshness, asp.history_complete, asp.mapping_complete,
    asp.availability as realised_asp_availability, asp.unavailable_reason as realised_asp_unavailable_reason,
    inheritance.profile_id as requested_profile_id,
    coalesce(inheritance.inherit_pack_cost, false) as inherit_pack_cost,
    coalesce(inheritance.inherit_shipping_cost, false) as inherit_shipping_cost,
    coalesce(inheritance.inherit_import_cost, false) as inherit_import_cost,
    coalesce(inheritance.inherit_units_per_pack, false) as inherit_units_per_pack,
    coalesce(inheritance.inherit_fx, false) as inherit_fx,
    profile.id as matched_profile_id, profile.supplier_currency as profile_currency,
    profile.exchange_rate_to_gbp as profile_fx, profile.pack_cost as profile_pack_cost,
    profile.shipping_cost_per_pack as profile_shipping, profile.import_cost_per_pack as profile_import,
    profile.units_per_pack as profile_units, profile.price_updated_at as profile_price_updated_at,
    assignment.cost_type_id, profile_version.id as matched_profile_version_id
  from public.vault_product_commercial_intelligence_legacy legacy
  left join public.vault_product_realised_selling_price asp on asp.product_id = legacy.product_id
  left join public.vault_product_cost_profile_inheritance inheritance on inheritance.product_id = legacy.product_id
  left join public.vault_product_cost_type_assignments assignment on assignment.product_id = legacy.product_id
  left join public.vault_supplier_product_type_cost_profiles profile
    on profile.id = inheritance.profile_id and profile.active
    and profile.supplier_id = legacy.supplier_id and profile.cost_type_id = assignment.cost_type_id
  left join lateral (
    select id from public.vault_supplier_product_type_cost_profile_versions
    where profile_id = profile.id
    order by effective_from desc
    limit 1
  ) profile_version on true
), effective as (
  select *,
    case when inherit_pack_cost then profile_pack_cost else pack_cost end as effective_pack_cost,
    case when inherit_shipping_cost then profile_shipping else shipping_cost_per_pack end as effective_shipping,
    case when inherit_import_cost then profile_import else import_cost_per_pack end as effective_import,
    case when inherit_units_per_pack then profile_units else units_per_pack end as effective_units,
    case when inherit_fx then profile_currency else currency end as effective_currency,
    case when inherit_fx then profile_fx else exchange_rate_to_gbp end as effective_fx,
    case when inherit_pack_cost then case when matched_profile_id is null then 'unavailable' else 'inherited' end else 'product_override' end as pack_cost_source,
    case when inherit_shipping_cost then case when matched_profile_id is null then 'unavailable' else 'inherited' end else 'product_override' end as shipping_cost_source,
    case when inherit_import_cost then case when matched_profile_id is null then 'unavailable' else 'inherited' end else 'product_override' end as import_cost_source,
    case when inherit_units_per_pack then case when matched_profile_id is null then 'unavailable' else 'inherited' end when units_per_pack is not null then 'product_override' when pack_profile in ('tee_5_piece','polo_6_piece') then 'pack_profile_fallback' else 'unavailable' end as units_source,
    case when inherit_fx then case when matched_profile_id is null then 'unavailable' else 'inherited' end else 'product_override' end as fx_source
  from matched
), costs as (
  select *, case when effective_pack_cost is null then null else round(effective_pack_cost + coalesce(effective_shipping,0) + coalesce(effective_import,0),2) end as effective_landed,
    case when effective_pack_cost is null or effective_fx is null then null else round((effective_pack_cost + coalesce(effective_shipping,0) + coalesce(effective_import,0)) * effective_fx,2) end as effective_landed_gbp
  from effective
), economics as (
  select *, case when effective_landed_gbp is null or effective_units is null or effective_units <= 0 then null else round(effective_landed_gbp/effective_units,2) end as effective_unit_cost,
    exists (select 1 from public.vault_supplier_style_pack_definitions definition
      join public.vault_style_catalogue_intelligence style on style.style_id=definition.style_id and style.supplier_id=definition.supplier_id
      where style.parent_product_id=costs.product_id and definition.active and definition.declared_units_per_pack <> costs.effective_units) as physical_pack_conflict
  from costs
)
select product_id, product_name, product_type, shopify_status, supplier_id, supplier_company, inventory_strategy, restock_enabled, pack_profile,
  effective_currency as currency, effective_fx as exchange_rate_to_gbp, effective_pack_cost as pack_cost,
  effective_shipping as shipping_cost_per_pack, effective_import as import_cost_per_pack, effective_units as units_per_pack,
  effective_landed as landed_cost_per_pack, effective_landed_gbp as landed_cost_per_pack_gbp, effective_unit_cost as landed_cost_per_unit,
  realised_average_selling_price as average_selling_price,
  case when realised_average_selling_price is null or effective_unit_cost is null then null else round(realised_average_selling_price-effective_unit_cost,2) end as estimated_gross_profit_per_unit,
  case when realised_average_selling_price is null or realised_average_selling_price <= 0 or effective_unit_cost is null then null else round((realised_average_selling_price-effective_unit_cost)/realised_average_selling_price*100,2) end as estimated_margin_percent,
  case when realised_average_selling_price is null or effective_unit_cost is null or effective_unit_cost <= 0 then null else round((realised_average_selling_price-effective_unit_cost)/effective_unit_cost*100,2) end as estimated_return_on_pack_capital_percent,
  case when inventory_strategy <> 'stocked' then true when supplier_id is null or effective_pack_cost is null or effective_pack_cost <= 0 or effective_units is null or effective_units <= 0 or realised_average_selling_price is null or realised_average_selling_price <= 0 or effective_fx is null or effective_fx <= 0 or physical_pack_conflict then false else true end as commercial_cost_trusted,
  array_remove(array[case when inventory_strategy='stocked' and supplier_id is null then 'supplier' end, case when inventory_strategy='stocked' and (effective_pack_cost is null or effective_pack_cost <= 0) then 'pack_cost' end, case when inventory_strategy='stocked' and (effective_units is null or effective_units <= 0) then 'units_per_pack' end, case when inventory_strategy='stocked' and physical_pack_conflict then 'physical_pack_definition' end, case when inventory_strategy='stocked' and (realised_average_selling_price is null or realised_average_selling_price <= 0) then 'average_selling_price' end, case when inventory_strategy='stocked' and (effective_fx is null or effective_fx <= 0) then 'exchange_rate' end], null) as missing_commercial_requirements,
  last_supplier_price_update, commercial_notes, cost_created_at, cost_updated_at,
  net_revenue_gbp, net_units_sold, order_count, window_start, window_end, latest_sale_at, order_history_freshness, history_complete, mapping_complete, realised_asp_availability, realised_asp_unavailable_reason
  ,case when matched_profile_id is null and (inherit_pack_cost or inherit_shipping_cost or inherit_import_cost or inherit_units_per_pack or inherit_fx) then 'unavailable' when inherit_pack_cost or inherit_shipping_cost or inherit_import_cost or inherit_units_per_pack or inherit_fx then case when inherit_pack_cost and inherit_shipping_cost and inherit_import_cost and inherit_units_per_pack and inherit_fx then 'inherited' else 'mixed' end else 'product_override' end as commercial_cost_resolution_mode,
  matched_profile_id as effective_profile_id, matched_profile_version_id as effective_profile_version_id, cost_type_id,
  pack_cost_source, shipping_cost_source, import_cost_source, units_source, fx_source, profile_price_updated_at
from economics;

-- Extend the established immutable parent snapshot with the resolved profile
-- provenance. This makes a profile switch auditable even when numeric values are
-- coincidentally unchanged.
create or replace function public.append_product_cost_version(target_product uuid, event_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare current_cost public.vault_product_costs%rowtype; canonical record; settings record;
  previous public.vault_product_cost_versions%rowtype; components jsonb; trusted boolean; effective timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_product::text, 731));
  select * into current_cost from public.vault_product_costs where product_id=target_product;
  select * into canonical from public.vault_product_commercial_intelligence where product_id=target_product;
  select supplier_id, inventory_strategy, pack_profile into settings from public.vault_product_settings where product_id=target_product;
  components := jsonb_build_object('cost',to_jsonb(current_cost)-'created_at'-'updated_at','settings',to_jsonb(settings),
    'resolved',jsonb_build_object('units_per_pack',canonical.units_per_pack,'landed_cost_per_pack',canonical.landed_cost_per_pack,
      'landed_cost_per_pack_gbp',canonical.landed_cost_per_pack_gbp,'unit_cogs_gbp',canonical.landed_cost_per_unit,
      'commercial_cost_trusted',canonical.commercial_cost_trusted,'profile_id',canonical.effective_profile_id,
      'profile_version_id',canonical.effective_profile_version_id,'resolution_mode',canonical.commercial_cost_resolution_mode,
      'sources',jsonb_build_object('pack_cost',canonical.pack_cost_source,'shipping',canonical.shipping_cost_source,
        'import',canonical.import_cost_source,'units',canonical.units_source,'fx',canonical.fx_source)));
  select * into previous from public.vault_product_cost_versions where product_id=target_product order by effective_from desc limit 1;
  if previous.id is not null and previous.source_components=components then return; end if;
  trusted := coalesce(canonical.commercial_cost_trusted,false) and current_cost.id is not null and canonical.landed_cost_per_unit is not null and canonical.landed_cost_per_unit>=0 and canonical.landed_cost_per_unit<>'NaN'::numeric and canonical.landed_cost_per_pack_gbp is not null and canonical.landed_cost_per_pack_gbp>=0 and canonical.landed_cost_per_pack_gbp<>'NaN'::numeric;
  effective := greatest(clock_timestamp(),previous.effective_from+interval '1 microsecond');
  insert into public.vault_product_cost_versions(product_id,effective_from,current_cost_id,currency,landed_cost_per_pack_gbp,unit_cogs_gbp,cost_status,source_components,reason)
  values(target_product,effective,current_cost.id,canonical.currency,canonical.landed_cost_per_pack_gbp,case when trusted then canonical.landed_cost_per_unit end,case when trusted then 'trusted' else 'unavailable' end,components,event_reason);
end; $$;

-- A profile edit creates a new forward-only resolved snapshot for every parent that
-- explicitly inherits at least one of its components. Raw product cost rows stay untouched.
create or replace function public.record_supplier_cost_profile_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare parent record; snapshot_at timestamptz := greatest(coalesce(new.effective_from, clock_timestamp()), clock_timestamp());
begin
  insert into public.vault_supplier_product_type_cost_profile_versions(profile_id,effective_from,snapshot,reason)
  values (new.id, snapshot_at, to_jsonb(new) - 'created_at' - 'updated_at', tg_op)
  on conflict (profile_id,effective_from) do nothing;
  for parent in select product_id from public.vault_product_cost_profile_inheritance
    where profile_id=new.id and (inherit_pack_cost or inherit_shipping_cost or inherit_import_cost or inherit_units_per_pack or inherit_fx)
  loop perform public.append_product_cost_version(parent.product_id, 'supplier_cost_profile:' || tg_op); end loop;
  return null;
end; $$;
create trigger supplier_cost_profile_version_record after insert or update on public.vault_supplier_product_type_cost_profiles
for each row execute function public.record_supplier_cost_profile_change();
create trigger product_cost_profile_inheritance_version_record after insert or update on public.vault_product_cost_profile_inheritance
for each row execute function public.record_product_cost_version();

create or replace view public.vault_product_commercial_summary as
select count(*)::integer as total_products, count(*) filter(where inventory_strategy='stocked')::integer as stocked_products,
count(*) filter(where inventory_strategy='stocked' and commercial_cost_trusted)::integer as commercially_configured_products,
count(*) filter(where inventory_strategy='stocked' and not commercial_cost_trusted)::integer as products_missing_costs,
case when count(*) filter(where inventory_strategy='stocked')=0 then 0 else round(count(*) filter(where inventory_strategy='stocked' and commercial_cost_trusted)::numeric/count(*) filter(where inventory_strategy='stocked')*100,1) end as commercial_completion_percentage
from public.vault_product_commercial_intelligence;

revoke all on public.vault_supplier_product_type_cost_profile_versions from public, anon, authenticated, service_role;
grant select on public.vault_supplier_product_type_cost_profile_versions to service_role;
notify pgrst, 'reload schema';
commit;
