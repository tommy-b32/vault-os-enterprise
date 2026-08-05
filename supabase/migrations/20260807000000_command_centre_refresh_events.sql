-- Authenticated, payload-free Command Centre refresh signals.
-- Realtime accelerates the UI only; canonical correctness remains with existing
-- webhooks, reconciliation jobs, server actions and server-rendered loaders.

create table public.vault_command_centre_refresh_events (
  id uuid primary key default gen_random_uuid(),
  domain text not null check (domain in (
    'trading',
    'inventory',
    'fulfilment',
    'refund',
    'finance',
    'purchasing',
    'catalogue',
    'supplier',
    'advisor-input'
  )),
  event_type text not null check (
    event_type = btrim(event_type)
    and length(event_type) between 1 and 100
  ),
  entity_id text check (
    entity_id is null
    or (entity_id = btrim(entity_id) and length(entity_id) between 1 and 200)
  ),
  occurred_at timestamptz not null default now(),
  source text not null check (
    source = btrim(source)
    and length(source) between 1 and 100
  ),
  created_at timestamptz not null default now()
);

create index vault_command_centre_refresh_events_occurred_at_idx
on public.vault_command_centre_refresh_events (occurred_at desc);

alter table public.vault_command_centre_refresh_events enable row level security;

revoke all on table public.vault_command_centre_refresh_events from anon, authenticated;
grant select on table public.vault_command_centre_refresh_events to authenticated;
grant insert on table public.vault_command_centre_refresh_events to service_role;

-- The browser may observe only payload-free refresh metadata, and only while
-- its authenticated operator profile remains active. Browser writes are never
-- granted; service-role/server-side mutation owners emit signals after success.
create policy "Active operators can read Command Centre refresh signals"
on public.vault_command_centre_refresh_events
for select
to authenticated
using (
  exists (
    select 1
    from public.vault_operators operator
    where operator.id = (select auth.uid())
      and operator.is_active = true
  )
);

create or replace function public.prevent_command_centre_refresh_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if current_setting('vault.command_centre_refresh_cleanup', true) = 'enabled' then
    return old;
  end if;

  raise exception 'vault_command_centre_refresh_events is append-only';
end
$function$;

create trigger vault_command_centre_refresh_events_prevent_mutation
before update or delete
on public.vault_command_centre_refresh_events
for each row
execute function public.prevent_command_centre_refresh_event_mutation();

-- Seven days comfortably exceeds the 90-second client recovery window while
-- keeping this operational signal table bounded. This service-role-only cleanup
-- deletes signals, but clients subscribe only to INSERT events.
create or replace function public.cleanup_command_centre_refresh_events(
  retain_for interval default interval '7 days'
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  deleted_rows bigint;
begin
  if retain_for < interval '1 day' or retain_for > interval '30 days' then
    raise exception 'retain_for must be between 1 and 30 days';
  end if;

  perform set_config('vault.command_centre_refresh_cleanup', 'enabled', true);

  delete from public.vault_command_centre_refresh_events
  where occurred_at < now() - retain_for;

  get diagnostics deleted_rows = row_count;
  perform set_config('vault.command_centre_refresh_cleanup', 'disabled', true);
  return deleted_rows;
end
$function$;

revoke all on function public.cleanup_command_centre_refresh_events(interval)
from public, anon, authenticated;
grant execute on function public.cleanup_command_centre_refresh_events(interval)
to service_role;

do $do$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'vault-command-centre-refresh-cleanup'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;
end
$do$;

select cron.schedule(
  'vault-command-centre-refresh-cleanup',
  '17 3 * * *',
  $cron$select public.cleanup_command_centre_refresh_events(interval '7 days');$cron$
);

do $do$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vault_command_centre_refresh_events'
  ) then
    alter publication supabase_realtime
      add table public.vault_command_centre_refresh_events;
  end if;
end
$do$;

-- Remove the superseded unauthenticated per-row Broadcast system only after
-- the authenticated refresh source and publication have been established.
drop trigger if exists vault_shopify_orders_broadcast_trading_changed
on public.vault_shopify_orders;

drop trigger if exists vault_shopify_order_lines_broadcast_trading_changed
on public.vault_shopify_order_lines;

drop function if exists public.notify_vault_trading_changed();

comment on table public.vault_command_centre_refresh_events is
  'Minimal authenticated UI refresh signals. Contains no canonical business payload and is not an event store.';

notify pgrst, 'reload schema';
