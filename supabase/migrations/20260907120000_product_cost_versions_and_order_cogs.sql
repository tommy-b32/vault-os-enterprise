-- Forward-only commercial-cost history. Never backdate current costs to old sales.
begin;
lock table public.vault_product_costs, public.vault_product_settings in share row exclusive mode;

create table public.vault_product_cost_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.vault_products(id) on delete restrict,
  effective_from timestamptz not null,
  current_cost_id uuid,
  currency text,
  landed_cost_per_pack_gbp numeric(14,2),
  unit_cogs_gbp numeric(14,2),
  cost_status text not null check (cost_status in ('trusted', 'unavailable')),
  source_components jsonb not null,
  reason text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(product_id, effective_from),
  check ((cost_status = 'trusted' and unit_cogs_gbp is not null and unit_cogs_gbp >= 0
    and unit_cogs_gbp <> 'NaN'::numeric and landed_cost_per_pack_gbp >= 0)
    or (cost_status = 'unavailable' and unit_cogs_gbp is null))
);
alter table public.vault_product_cost_versions enable row level security;
revoke all on public.vault_product_cost_versions from public, anon, authenticated, service_role;
grant select on public.vault_product_cost_versions to service_role;

create function public.reject_product_cost_version_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Product cost versions are immutable';
end;
$$;
create trigger product_cost_versions_immutable before update or delete
on public.vault_product_cost_versions for each row execute function public.reject_product_cost_version_mutation();

-- Serialize cost and settings edits for the same product; settings affect the canonical
-- pack-size fallback and commercial trust. Retries with identical inputs append nothing.
create function public.lock_product_cost_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.product_id is distinct from old.product_id then
    raise exception 'Canonical cost/settings product identity cannot be changed';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(new.product_id, old.product_id)::text, 731));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create function public.append_product_cost_version(target_product uuid, event_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  current_cost public.vault_product_costs%rowtype;
  canonical record;
  settings record;
  previous public.vault_product_cost_versions%rowtype;
  components jsonb;
  trusted boolean;
  effective timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_product::text, 731));
  select * into current_cost from public.vault_product_costs where product_id = target_product;
  select * into canonical from public.vault_product_commercial_intelligence where product_id = target_product;
  select supplier_id, inventory_strategy, pack_profile into settings
    from public.vault_product_settings where product_id = target_product;
  -- Copy the existing canonical view's final values, including its rounding/FX rules.
  -- Historical readers NEVER re-evaluate this view or mutable cost/settings rows.
  components := jsonb_build_object(
    'cost', to_jsonb(current_cost) - 'created_at' - 'updated_at',
    'settings', to_jsonb(settings),
    'resolved', jsonb_build_object('units_per_pack', canonical.units_per_pack,
      'landed_cost_per_pack', canonical.landed_cost_per_pack,
      'landed_cost_per_pack_gbp', canonical.landed_cost_per_pack_gbp,
      'unit_cogs_gbp', canonical.landed_cost_per_unit,
      'commercial_cost_trusted', canonical.commercial_cost_trusted));
  select * into previous from public.vault_product_cost_versions
    where product_id = target_product order by effective_from desc limit 1;
  if previous.id is not null and previous.source_components = components then return; end if;
  trusted := coalesce(canonical.commercial_cost_trusted, false)
    and current_cost.id is not null and canonical.landed_cost_per_unit is not null
    and canonical.landed_cost_per_unit >= 0 and canonical.landed_cost_per_unit <> 'NaN'::numeric
    and canonical.landed_cost_per_pack_gbp is not null and canonical.landed_cost_per_pack_gbp >= 0
    and canonical.landed_cost_per_pack_gbp <> 'NaN'::numeric;
  effective := greatest(clock_timestamp(), previous.effective_from + interval '1 microsecond');
  insert into public.vault_product_cost_versions(product_id, effective_from, current_cost_id,
    currency, landed_cost_per_pack_gbp, unit_cogs_gbp, cost_status, source_components, reason)
  values (target_product, effective, current_cost.id, canonical.currency,
    canonical.landed_cost_per_pack_gbp, case when trusted then canonical.landed_cost_per_unit end,
    case when trusted then 'trusted' else 'unavailable' end, components, event_reason);
end;
$$;

create function public.record_product_cost_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.append_product_cost_version(coalesce(new.product_id, old.product_id), tg_table_name || ':' || tg_op);
  return null;
end;
$$;

create trigger product_cost_version_lock before insert or update or delete on public.vault_product_costs
for each row execute function public.lock_product_cost_version();
create trigger product_cost_version_record after insert or update or delete on public.vault_product_costs
for each row execute function public.record_product_cost_version();
create trigger product_settings_cost_version_lock before insert or update or delete on public.vault_product_settings
for each row execute function public.lock_product_cost_version();
create trigger product_settings_cost_version_record after insert or update or delete on public.vault_product_settings
for each row execute function public.record_product_cost_version();

-- These baselines begin NOW, not at created_at, updated_at, or supplier-price dates.
do $$ declare product record; begin
  for product in select id from public.vault_products loop
    perform public.append_product_cost_version(product.id, 'deployment_baseline');
  end loop;
end $$;

alter table public.vault_shopify_order_lines
  add column unit_cogs_gbp numeric(14,2),
  add column cogs_history_id uuid references public.vault_product_cost_versions(id) on delete restrict,
  add column cogs_snapshotted_at timestamptz,
  add column cogs_status text not null default 'unavailable',
  add column cogs_quantity integer generated always as (greatest(quantity - refunded_quantity, 0)) stored,
  add column total_cogs_gbp numeric(18,2) generated always as (unit_cogs_gbp * greatest(quantity - refunded_quantity, 0)) stored,
  add constraint order_line_cogs_valid check (
    (cogs_status = 'trusted' and unit_cogs_gbp is not null and unit_cogs_gbp >= 0
      and unit_cogs_gbp <> 'NaN'::numeric and cogs_history_id is not null and cogs_snapshotted_at is not null)
    or (cogs_status in ('unavailable', 'missing_variant', 'no_effective_cost', 'invalid_cost', 'future_sale')
      and unit_cogs_gbp is null and cogs_history_id is null and cogs_snapshotted_at is null));

create function public.snapshot_shopify_order_line_cogs() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  product uuid;
  sold_at timestamptz;
  version public.vault_product_cost_versions%rowtype;
begin
  if tg_op = 'UPDATE' and old.cogs_status = 'trusted' then
    if (new.order_id, new.shopify_variant_id, new.shopify_line_item_id, new.source)
       is distinct from (old.order_id, old.shopify_variant_id, old.shopify_line_item_id, old.source) then
      raise exception 'A costed order line cannot change canonical identity';
    end if;
    new.unit_cogs_gbp := old.unit_cogs_gbp;
    new.cogs_history_id := old.cogs_history_id;
    new.cogs_snapshotted_at := old.cogs_snapshotted_at;
    new.cogs_status := old.cogs_status;
    return new;
  end if;
  new.unit_cogs_gbp := null; new.cogs_history_id := null; new.cogs_snapshotted_at := null;
  select variant.product_id into product from public.vault_variants variant
    join public.vault_products parent on parent.id = variant.product_id
    where variant.source = 'shopify' and parent.source = 'shopify'
      and variant.source_variant_id = new.shopify_variant_id
      and (new.shopify_product_id is null or parent.source_product_id = new.shopify_product_id);
  if product is null then new.cogs_status := 'missing_variant'; return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(product::text, 731));
  select shopify_created_at into sold_at from public.vault_shopify_orders where id = new.order_id;
  if sold_at > clock_timestamp() then new.cogs_status := 'future_sale'; return new; end if;
  -- Do not skip a newer unavailable version and fall back to an older valid cost.
  select * into version from public.vault_product_cost_versions
    where product_id = product and effective_from <= sold_at order by effective_from desc limit 1;
  if version.id is null then new.cogs_status := 'no_effective_cost'; return new; end if;
  if version.cost_status <> 'trusted' then new.cogs_status := 'invalid_cost'; return new; end if;
  new.unit_cogs_gbp := version.unit_cogs_gbp;
  new.cogs_history_id := version.id;
  new.cogs_snapshotted_at := clock_timestamp();
  new.cogs_status := 'trusted';
  return new;
end;
$$;
-- Shared by webhook, scheduled sync and bounded backfill upserts. No extra API calls.
create trigger shopify_order_line_cogs before insert or update on public.vault_shopify_order_lines
for each row execute function public.snapshot_shopify_order_line_cogs();

revoke all on function public.reject_product_cost_version_mutation(), public.lock_product_cost_version(),
  public.append_product_cost_version(uuid,text), public.record_product_cost_version(),
  public.snapshot_shopify_order_line_cogs() from public, anon, authenticated, service_role;

-- Aggregate in PostgreSQL numeric, without paging limits or floating-point money sums.
-- Same London order-day, cancellation/test exclusions and net-unit basis as trading.
create function public.get_shopify_daily_cogs(target_at timestamptz)
returns table(total_cogs_gbp numeric, total_units bigint, costed_units bigint,
  missing_cost_lines bigint, order_count bigint, source_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  with lines as (
    select orders.id as order_id, line.id as line_id, line.cogs_quantity,
      line.cogs_status, line.total_cogs_gbp,
      least(orders.synced_at, line.synced_at) as source_at
    from public.vault_shopify_orders orders
    left join public.vault_shopify_order_lines line on line.order_id = orders.id
    where orders.shopify_created_at >= ((target_at at time zone 'Europe/London')::date::timestamp at time zone 'Europe/London')
      and orders.shopify_created_at < (((target_at at time zone 'Europe/London')::date + 1)::timestamp at time zone 'Europe/London')
      and orders.cancelled_at is null and orders.metadata->>'test' = 'false'
  ), totals as (
    select coalesce(sum(cogs_quantity), 0)::bigint as units,
      coalesce(sum(cogs_quantity) filter(where cogs_status = 'trusted'), 0)::bigint as costed,
      count(*) filter(where line_id is null or (cogs_quantity > 0 and cogs_status <> 'trusted')) as missing,
      coalesce(sum(total_cogs_gbp) filter(where cogs_status = 'trusted'), 0) as cost,
      count(distinct order_id) as orders, min(source_at) as oldest_source from lines
  ) select case when missing = 0 then cost end, units, costed, missing, orders, oldest_source from totals;
$$;
revoke all on function public.get_shopify_daily_cogs(timestamptz) from public, anon, authenticated;
grant execute on function public.get_shopify_daily_cogs(timestamptz) to service_role;
notify pgrst, 'reload schema';
commit;
