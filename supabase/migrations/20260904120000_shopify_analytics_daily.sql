create table if not exists public.vault_shopify_analytics_daily (
  id bigint generated always as identity primary key,
  shop_id text not null,
  reporting_date date not null,
  reporting_timezone text not null,
  sessions integer not null check (sessions >= 0),
  online_store_visitors integer check (online_store_visitors >= 0),
  sessions_with_cart_additions integer not null check (sessions_with_cart_additions >= 0),
  sessions_that_reached_checkout integer not null check (sessions_that_reached_checkout >= 0),
  sessions_that_completed_checkout integer not null check (sessions_that_completed_checkout >= 0),
  conversion_rate numeric not null check (conversion_rate >= 0 and conversion_rate <= 1),
  fetched_at timestamptz not null,
  availability text not null check (availability in ('live', 'stale', 'unavailable', 'pending_permission')),
  created_at timestamptz not null default now(),
  unique (shop_id, reporting_date)
);

create table if not exists public.vault_shopify_analytics_sync_state (
  singleton boolean primary key default true check (singleton),
  shop_id text,
  reporting_timezone text,
  availability text not null check (availability in ('live', 'stale', 'unavailable', 'pending_permission')),
  last_attempted_at timestamptz not null,
  last_successful_at timestamptz,
  failure_code text,
  check (failure_code is null or failure_code in ('protected_data_denied', 'throttled', 'shopifyql_error'))
);

alter table public.vault_shopify_analytics_daily enable row level security;
alter table public.vault_shopify_analytics_sync_state enable row level security;
revoke all on public.vault_shopify_analytics_daily from anon, authenticated;
revoke all on public.vault_shopify_analytics_sync_state from anon, authenticated;

insert into public.vault_shopify_analytics_sync_state
  (singleton, availability, last_attempted_at, failure_code)
values (true, 'pending_permission', now(), null)
on conflict (singleton) do nothing;

create index if not exists vault_shopify_analytics_daily_date_idx
  on public.vault_shopify_analytics_daily (reporting_date desc);

select cron.schedule(
  'vault-shopify-analytics-refresh',
  '*/15 * * * *',
  $cron$
    select net.http_post(
      url := 'https://mzrimaqjyrvtbpaeyooe.supabase.co/functions/v1/shopify-analytics-sync',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'vault_shopify_order_sync_service_role_jwt' order by created_at desc limit 1),
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'vault_shopify_order_sync_service_role_jwt' order by created_at desc limit 1),
        'x-vault-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'vault_order_sync_secret' order by created_at desc limit 1),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $cron$
)
where not exists (select 1 from cron.job where jobname = 'vault-shopify-analytics-refresh');

notify pgrst, 'reload schema';
