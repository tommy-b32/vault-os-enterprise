-- Storage-safe inventory history and atomic supplier catalogue replacement.
-- This migration changes future behaviour only. Production history cleanup is
-- exposed as a bounded operator-invoked function and is not run here.

alter table public.vault_inventory_level_snapshots
  add column if not exists history_kind text not null default 'legacy';
alter table public.vault_inventory_level_snapshots
  alter column history_kind set default 'change';

alter table public.vault_inventory_level_snapshots
  drop constraint if exists vault_inventory_level_snapshots_history_kind_check;
alter table public.vault_inventory_level_snapshots
  add constraint vault_inventory_level_snapshots_history_kind_check
  check (history_kind in ('legacy', 'change', 'daily_baseline'));

create unique index if not exists vault_inventory_level_snapshots_daily_baseline_idx
  on public.vault_inventory_level_snapshots (
    variant_id,
    location_id,
    ((observed_at at time zone 'Europe/London')::date)
  ) where history_kind = 'daily_baseline';

create index if not exists vault_inventory_level_snapshots_pair_observed_idx
  on public.vault_inventory_level_snapshots
  (variant_id, location_id, observed_at desc, created_at desc);

create or replace function public.record_inventory_level_history(
  target_sync_run_id uuid,
  target_observed_at timestamptz,
  observations jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if jsonb_typeof(observations) <> 'array' then
    raise exception 'Inventory history observations must be a JSON array';
  end if;

  -- Serialise history decisions so overlapping syncs cannot both insert the
  -- same daily baseline or duplicate the same quantity transition.
  perform pg_advisory_xact_lock(hashtextextended('vault_inventory_level_snapshots', 0));
  perform set_config('vault.inventory_history_cleanup', 'on', true);

  -- Failed partial runs are not canonical history and must not suppress the
  -- next successful transition or occupy its daily-baseline identity.
  delete from public.vault_inventory_level_snapshots snapshot
  using public.vault_shopify_inventory_sync_runs failed_run
  where failed_run.id = snapshot.inventory_sync_run_id
    and failed_run.sync_status = 'failed'
    and exists (
      select 1 from jsonb_array_elements(observations) observation
      where (observation->>'variant_id')::uuid = snapshot.variant_id
        and (observation->>'location_id')::uuid = snapshot.location_id
    );

  with incoming as (
    select distinct on (value->>'variant_id', value->>'location_id')
      (value->>'variant_id')::uuid as variant_id,
      (value->>'location_id')::uuid as location_id,
      (value->>'available')::integer as available,
      (value->>'committed')::integer as committed,
      (value->>'incoming')::integer as incoming,
      (value->>'on_hand')::integer as on_hand,
      (value->>'available_for_sale')::boolean as available_for_sale,
      (value->>'inventory_tracked')::boolean as inventory_tracked
    from jsonb_array_elements(observations)
  ),
  classified as (
    select incoming.*,
      previous.id as previous_id,
      previous.available as previous_available,
      previous.committed as previous_committed,
      baseline.id as baseline_id
    from incoming
    left join lateral (
      select snapshot.id, snapshot.available, snapshot.committed
      from public.vault_inventory_level_snapshots snapshot
      join public.vault_shopify_inventory_sync_runs successful_run
        on successful_run.id = snapshot.inventory_sync_run_id
       and successful_run.sync_status = 'current'
      where snapshot.variant_id = incoming.variant_id
        and snapshot.location_id = incoming.location_id
      order by snapshot.observed_at desc, snapshot.created_at desc, snapshot.id desc
      limit 1
    ) previous on true
    left join lateral (
      select snapshot.id
      from public.vault_inventory_level_snapshots snapshot
      join public.vault_shopify_inventory_sync_runs successful_run
        on successful_run.id = snapshot.inventory_sync_run_id
       and successful_run.sync_status = 'current'
      where snapshot.variant_id = incoming.variant_id
        and snapshot.location_id = incoming.location_id
        and (snapshot.observed_at at time zone 'Europe/London')::date =
            (target_observed_at at time zone 'Europe/London')::date
        and snapshot.history_kind = 'daily_baseline'
      limit 1
    ) baseline on true
  )
  insert into public.vault_inventory_level_snapshots (
    inventory_sync_run_id, variant_id, location_id, observed_at,
    available, committed, incoming, on_hand, available_for_sale,
    inventory_tracked, history_kind
  )
  select target_sync_run_id, variant_id, location_id, target_observed_at,
    available, committed, incoming, on_hand, available_for_sale,
    inventory_tracked,
    case
      when previous_id is null or baseline_id is null then 'daily_baseline'
      else 'change'
    end
  from classified
  where previous_id is null
     or baseline_id is null
     or available is distinct from previous_available
     or committed is distinct from previous_committed
  on conflict do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.record_inventory_level_history(uuid, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_inventory_level_history(uuid, timestamptz, jsonb)
  to service_role;

create or replace function public.inventory_history_retention_dry_run(
  reference_time timestamptz default now()
)
returns table (total_rows bigint, retained_rows bigint, removable_rows bigint)
language sql
security definer
set search_path = ''
as $$
  with ranked as (
    select snapshot.id, snapshot.observed_at,
      row_number() over (
        partition by snapshot.variant_id, snapshot.location_id
        order by snapshot.observed_at desc, snapshot.created_at desc, snapshot.id desc
      ) as latest_rank,
      row_number() over (
        partition by snapshot.variant_id, snapshot.location_id,
          (snapshot.observed_at at time zone 'Europe/London')::date
        order by snapshot.observed_at asc, snapshot.created_at asc, snapshot.id asc
      ) as daily_rank
    from public.vault_inventory_level_snapshots snapshot
  ), removable as (
    select id from ranked
    where latest_rank <> 1
      and (
        observed_at < reference_time - interval '12 months'
        or (observed_at < reference_time - interval '48 hours' and daily_rank <> 1)
      )
  )
  select count(*)::bigint,
    (count(*) - (select count(*) from removable))::bigint,
    (select count(*) from removable)::bigint
  from ranked;
$$;

revoke all on function public.inventory_history_retention_dry_run(timestamptz)
  from public, anon, authenticated;

create or replace function public.cleanup_inventory_level_history_batch(
  batch_size integer default 10000,
  reference_time timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  if batch_size < 1 or batch_size > 25000 then
    raise exception 'Inventory history cleanup batch size must be between 1 and 25000';
  end if;

  perform set_config('vault.inventory_history_cleanup', 'on', true);

  with ranked as (
    select snapshot.id, snapshot.observed_at,
      row_number() over (
        partition by snapshot.variant_id, snapshot.location_id
        order by snapshot.observed_at desc, snapshot.created_at desc, snapshot.id desc
      ) as latest_rank,
      row_number() over (
        partition by snapshot.variant_id, snapshot.location_id,
          (snapshot.observed_at at time zone 'Europe/London')::date
        order by snapshot.observed_at asc, snapshot.created_at asc, snapshot.id asc
      ) as daily_rank
    from public.vault_inventory_level_snapshots snapshot
  ), targets as (
    select id from ranked
    where latest_rank <> 1
      and (
        observed_at < reference_time - interval '12 months'
        or (observed_at < reference_time - interval '48 hours' and daily_rank <> 1)
      )
    order by observed_at asc, id
    limit batch_size
  )
  delete from public.vault_inventory_level_snapshots snapshot
  using targets
  where snapshot.id = targets.id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_inventory_level_history_batch(integer, timestamptz)
  from public, anon, authenticated;

create or replace function public.reject_inventory_snapshot_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and current_setting('vault.inventory_history_cleanup', true) = 'on'
  then
    return old;
  end if;
  raise exception 'vault_inventory_level_snapshots is append-only';
end;
$$;

comment on table public.vault_inventory_level_snapshots is
  'Shopify variant/location quantity changes plus one Europe/London daily baseline. Detailed history is retained for 48 hours, daily history for 12 months; cleanup is operator-controlled and batched.';

alter table public.vault_supplier_catalogue_archives
  drop constraint if exists vault_supplier_catalogue_archives_status_check;
alter table public.vault_supplier_catalogue_archives
  add constraint vault_supplier_catalogue_archives_status_check
  check (status in ('uploading', 'processing', 'ready_for_review', 'in_review', 'completed', 'superseded', 'failed'));
alter table public.vault_supplier_catalogue_archives
  add column if not exists is_active boolean not null default false,
  add column if not exists activated_at timestamptz,
  add column if not exists superseded_at timestamptz;

with ranked_catalogues as (
  select id, row_number() over (
    partition by supplier_id, catalogue_type
    order by updated_at desc, created_at desc, id desc
  ) as rank
  from public.vault_supplier_catalogue_archives
  where status = 'completed'
)
update public.vault_supplier_catalogue_archives archive
set is_active = true,
    activated_at = coalesce(archive.activated_at, archive.updated_at)
from ranked_catalogues ranked
where archive.id = ranked.id and ranked.rank = 1;

with ranked_catalogues as (
  select id, row_number() over (
    partition by supplier_id, catalogue_type
    order by updated_at desc, created_at desc, id desc
  ) as rank
  from public.vault_supplier_catalogue_archives
  where status = 'completed'
)
update public.vault_supplier_catalogue_archives archive
set status = 'superseded',
    is_active = false,
    superseded_at = coalesce(archive.superseded_at, archive.updated_at)
from ranked_catalogues ranked
where archive.id = ranked.id and ranked.rank > 1;

create unique index if not exists vault_supplier_catalogue_one_active_type_idx
  on public.vault_supplier_catalogue_archives (supplier_id, catalogue_type)
  where is_active;

alter table public.vault_supplier_catalogue_pages
  add column if not exists source_objects jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'supplier-catalogue-temporary',
  'supplier-catalogue-temporary',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.contains_embedded_catalogue_binary(value jsonb)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select value::text ~ '"data:(image/|application/pdf)';
$$;

alter table public.vault_supplier_catalogue_pages
  drop constraint if exists vault_supplier_catalogue_pages_no_embedded_binary;
alter table public.vault_supplier_catalogue_pages
  add constraint vault_supplier_catalogue_pages_no_embedded_binary
  check (
    not (parsed_evidence ? 'sourcePage')
    and not public.contains_embedded_catalogue_binary(parsed_evidence)
    and not public.contains_embedded_catalogue_binary(source_objects)
  );

alter table public.vault_supplier_catalogue_review_items
  drop constraint if exists vault_supplier_catalogue_review_no_embedded_binary;
alter table public.vault_supplier_catalogue_review_items
  add constraint vault_supplier_catalogue_review_no_embedded_binary
  check (
    not public.contains_embedded_catalogue_binary(supplier_product_evidence)
    and not public.contains_embedded_catalogue_binary(coalesce(proposed_match, '{}'::jsonb))
    and not public.contains_embedded_catalogue_binary(review_payload)
  ) not valid;

create or replace function public.refresh_supplier_catalogue_archive(target_archive_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending_count integer;
  resolved_count integer;
  detected_count integer;
  matched_count integer;
  target_supplier_id uuid;
  target_catalogue_type text;
  next_status text;
  expected_page_count integer;
  terminal_page_count integer;
begin
  select supplier_id, catalogue_type
    into target_supplier_id, target_catalogue_type
  from public.vault_supplier_catalogue_archives
  where id = target_archive_id
  for update;

  if target_supplier_id is null then
    raise exception 'Supplier catalogue archive does not exist';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(target_supplier_id::text || ':' || target_catalogue_type, 0)
  );

  select count(*),
         count(*) filter (where review_status = 'matched'),
         count(*) filter (where review_status = 'pending')
    into detected_count, matched_count, pending_count
  from public.vault_supplier_catalogue_review_items
  where archive_id = target_archive_id;

  resolved_count := detected_count - pending_count;
  select archive.page_count,
         count(page.id) filter (where page.analysis_state in ('complete', 'skipped'))
    into expected_page_count, terminal_page_count
  from public.vault_supplier_catalogue_archives archive
  left join public.vault_supplier_catalogue_pages page on page.archive_id = archive.id
  where archive.id = target_archive_id
  group by archive.page_count;

  select case
    when status = 'failed' then 'failed'
    when detected_count = 0 then status
    when pending_count = 0
      and expected_page_count > 0
      and terminal_page_count = expected_page_count then 'completed'
    when resolved_count > 0 then 'in_review'
    else 'ready_for_review'
  end into next_status
  from public.vault_supplier_catalogue_archives
  where id = target_archive_id;

  if next_status = 'completed' then
    update public.vault_supplier_catalogue_archives
    set status = 'superseded', is_active = false, superseded_at = now(), updated_at = now()
    where supplier_id = target_supplier_id
      and catalogue_type = target_catalogue_type
      and is_active
      and id <> target_archive_id;

    update public.vault_supplier_catalogue_archives
    set detected_product_count = detected_count,
        matched_product_count = matched_count,
        unmatched_product_count = detected_count - matched_count,
        status = 'completed', is_active = true, activated_at = coalesce(activated_at, now()),
        superseded_at = null, updated_at = now()
    where id = target_archive_id;

    -- Keep lightweight analysis/audit evidence, but remove resumability payloads.
    update public.vault_supplier_catalogue_pages
    set parsed_evidence = parsed_evidence - 'sourcePage',
        updated_at = now()
    where archive_id = target_archive_id;
  else
    update public.vault_supplier_catalogue_archives
    set detected_product_count = detected_count,
        matched_product_count = matched_count,
        unmatched_product_count = detected_count - matched_count,
        status = next_status,
        updated_at = now()
    where id = target_archive_id;
  end if;
end;
$$;

create or replace view public.vault_active_supplier_catalogue_items
with (security_invoker = true, security_barrier = true)
as
select
  archive.supplier_id,
  archive.catalogue_type,
  archive.id as archive_id,
  item.id as review_item_id,
  item.review_item_id as source_item_id,
  item.supplier_product_evidence,
  item.proposed_match,
  item.review_status,
  item.linked_product_id,
  item.decided_at
from public.vault_supplier_catalogue_archives archive
join public.vault_supplier_catalogue_review_items item
  on item.archive_id = archive.id
where archive.is_active
  and archive.status = 'completed';

revoke all on public.vault_active_supplier_catalogue_items from anon, authenticated;
grant select on public.vault_active_supplier_catalogue_items to authenticated;

comment on column public.vault_supplier_catalogue_archives.is_active is
  'True only for the latest successfully completed catalogue per supplier and catalogue type.';
comment on column public.vault_supplier_catalogue_pages.source_objects is
  'Lightweight object-storage references for temporary rendered page images; embedded binary data is prohibited.';
comment on view public.vault_active_supplier_catalogue_items is
  'Only items and canonical product matches belonging to the single active completed catalogue per supplier/type.';

-- These are new retention jobs; the existing ten-minute order and inventory
-- refresh schedules are intentionally untouched.
select cron.schedule(
  'vault-inventory-history-retention',
  '23 2 * * *',
  $cron$select public.cleanup_inventory_level_history_batch(25000);$cron$
)
where not exists (
  select 1 from cron.job where jobname = 'vault-inventory-history-retention'
);

select cron.schedule(
  'vault-supplier-catalogue-artifact-retention',
  '41 2 * * *',
  $cron$
    with service_role_credential as (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'vault_shopify_order_sync_service_role_jwt'
      order by created_at desc
      limit 1
    )
    select net.http_post(
      url := 'https://mzrimaqjyrvtbpaeyooe.supabase.co/functions/v1/supplier-catalogue-artifact-cleanup',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || decrypted_secret,
        'apikey', decrypted_secret,
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    )
    from service_role_credential;
  $cron$
)
where not exists (
  select 1 from cron.job where jobname = 'vault-supplier-catalogue-artifact-retention'
);

notify pgrst, 'reload schema';
