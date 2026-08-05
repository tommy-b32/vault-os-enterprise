-- Canonical Shopify inventory synchronisation diagnostics and schedule.
-- Inventory values remain exclusively in vault_inventory_levels.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.vault_shopify_inventory_sync_runs (
  id uuid primary key default gen_random_uuid(),
  sync_status text not null check (sync_status in ('syncing', 'current', 'delayed', 'failed')),
  sync_started_at timestamptz not null default now(),
  sync_completed_at timestamptz,
  sync_duration_ms bigint check (sync_duration_ms is null or sync_duration_ms >= 0),
  products_processed integer check (products_processed is null or products_processed >= 0),
  products_updated integer check (products_updated is null or products_updated >= 0),
  shopify_api_success boolean,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists vault_shopify_inventory_sync_runs_started_at_idx
on public.vault_shopify_inventory_sync_runs(sync_started_at desc);

create index if not exists vault_shopify_inventory_sync_runs_completed_at_idx
on public.vault_shopify_inventory_sync_runs(sync_completed_at desc);

create unique index if not exists vault_shopify_inventory_one_active_sync_idx
on public.vault_shopify_inventory_sync_runs(sync_status)
where sync_status = 'syncing';

revoke all on table public.vault_shopify_inventory_sync_runs from anon, authenticated;

do $do$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'vault-shopify-inventory-sync'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;
end
$do$;

select cron.schedule(
  'vault-shopify-inventory-sync',
  '*/10 * * * *',
  $cron$
    select net.http_post(
      url := 'https://mzrimaqjyrvtbpaeyooe.supabase.co/functions/v1/shopify-inventory-sync',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'vault_shopify_inventory_sync_service_role_jwt'
          order by created_at desc
          limit 1
        ),
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'vault_shopify_inventory_sync_service_role_jwt'
          order by created_at desc
          limit 1
        ),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $cron$
);

notify pgrst, 'reload schema';
