-- Append-only canonical inventory availability observations.
-- Collection starts at deployment; no historical inventory is reconstructed.

create table public.vault_inventory_level_snapshots (
  id uuid primary key default gen_random_uuid(),
  inventory_sync_run_id uuid not null references public.vault_shopify_inventory_sync_runs(id) on delete restrict,
  variant_id uuid not null references public.vault_variants(id) on delete restrict,
  location_id uuid not null references public.vault_locations(id) on delete restrict,
  observed_at timestamptz not null,
  available integer not null,
  committed integer not null,
  incoming integer not null,
  on_hand integer not null,
  available_for_sale boolean,
  inventory_tracked boolean,
  created_at timestamptz not null default now(),
  unique (inventory_sync_run_id, variant_id, location_id)
);

create index vault_inventory_level_snapshots_variant_observed_idx
  on public.vault_inventory_level_snapshots (variant_id, observed_at desc);
create index vault_inventory_level_snapshots_observed_idx
  on public.vault_inventory_level_snapshots (observed_at desc);
create index vault_inventory_level_snapshots_run_idx
  on public.vault_inventory_level_snapshots (inventory_sync_run_id);

create or replace function public.reject_inventory_snapshot_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'vault_inventory_level_snapshots is append-only';
end;
$$;

create trigger vault_inventory_level_snapshots_append_only
before update or delete on public.vault_inventory_level_snapshots
for each row execute function public.reject_inventory_snapshot_mutation();

alter table public.vault_inventory_level_snapshots enable row level security;

create policy "Active operators can read inventory snapshots"
  on public.vault_inventory_level_snapshots
  for select
  to authenticated
  using (exists (
    select 1
    from public.vault_operators operator
    where operator.id = (select auth.uid())
      and operator.is_active = true
  ));

revoke all on public.vault_inventory_level_snapshots from anon, authenticated;
grant select on public.vault_inventory_level_snapshots to authenticated;

create or replace view public.vault_variant_inventory_availability_evidence
with (security_barrier = true)
as
select
  variant.id as variant_id,
  variant.product_id as parent_product_id,
  variant.option_1 as raw_style_value,
  variant.option_1 as raw_option_1,
  variant.option_2 as raw_option_2,
  variant.option_3 as raw_option_3,
  null::text as normalized_size,
  'unavailable_option_names_not_persisted'::text as size_normalization_state,
  min(snapshot.observed_at) as earliest_observed_at,
  max(snapshot.observed_at) as latest_observed_at,
  count(snapshot.id)::bigint as observation_count,
  current_level.available_quantity as current_available_quantity,
  count(snapshot.id) > 0 as observation_history_exists
from public.vault_variants variant
left join (
  select observation.*
  from public.vault_inventory_level_snapshots observation
  join public.vault_shopify_inventory_sync_runs successful_run
    on successful_run.id = observation.inventory_sync_run_id
   and successful_run.sync_status = 'current'
) snapshot on snapshot.variant_id = variant.id
left join lateral (
  select sum(level.available_quantity)::integer as available_quantity
  from public.vault_inventory_levels level
  where level.variant_id = variant.id
) current_level on true
where variant.source = 'shopify'
  and (
    (select auth.role()) = 'service_role'
    or exists (
      select 1
      from public.vault_operators operator
      where operator.id = (select auth.uid())
        and operator.is_active = true
    )
  )
group by
  variant.id,
  variant.product_id,
  variant.option_1,
  variant.option_2,
  variant.option_3,
  current_level.available_quantity;

revoke all on public.vault_variant_inventory_availability_evidence from anon, authenticated;
grant select on public.vault_variant_inventory_availability_evidence to authenticated;

comment on table public.vault_inventory_level_snapshots is
  'Append-only Shopify variant/location inventory observations. Retain for at least 120 days; no automatic deletion is configured.';
comment on view public.vault_variant_inventory_availability_evidence is
  'Current variant identity and successful-run observation bounds. Observation count does not imply 7/14/30-day completeness.';

notify pgrst, 'reload schema';
