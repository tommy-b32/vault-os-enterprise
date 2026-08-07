-- Secure Shopify order reconciliation fallback.
-- Webhooks remain the preferred low-latency ingestion path.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.vault_shopify_order_sync_runs (
  id uuid primary key default gen_random_uuid(),
  sync_mode text not null,
  sync_days integer not null check (sync_days > 0),
  orders_synced integer not null check (orders_synced >= 0),
  order_lines_synced integer not null check (order_lines_synced >= 0),
  started_at timestamptz not null,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists vault_shopify_order_sync_runs_completed_at_idx
on public.vault_shopify_order_sync_runs(completed_at desc);

revoke all on table public.vault_shopify_order_sync_runs from anon, authenticated;

do $do$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'vault-shopify-order-reconciliation'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;
end
$do$;

select cron.schedule(
  'vault-shopify-order-reconciliation',
  '*/10 * * * *',
  $cron$
    select net.http_post(
      url := 'https://mzrimaqjyrvtbpaeyooe.supabase.co/functions/v1/shopify-order-sync',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'vault_shopify_order_sync_service_role_jwt'
          order by created_at desc
          limit 1
        ),
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'vault_shopify_order_sync_service_role_jwt'
          order by created_at desc
          limit 1
        ),
        'x-vault-sync-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'vault_order_sync_secret'
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
