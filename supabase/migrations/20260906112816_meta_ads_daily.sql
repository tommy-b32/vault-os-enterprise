create table if not exists public.vault_meta_ads_daily (
  id bigint generated always as identity primary key,
  ad_account_id text not null,
  reporting_date date not null,
  reporting_timezone text not null,
  currency text not null,
  spend numeric not null check (spend >= 0),
  impressions bigint not null check (impressions >= 0),
  clicks bigint not null check (clicks >= 0),
  link_clicks bigint not null check (link_clicks >= 0),
  landing_page_views bigint not null check (landing_page_views >= 0),
  ctr numeric not null check (ctr >= 0),
  cpc numeric not null check (cpc >= 0),
  purchases integer not null check (purchases >= 0),
  purchase_value numeric not null check (purchase_value >= 0),
  add_to_carts integer not null check (add_to_carts >= 0),
  checkouts integer not null check (checkouts >= 0),
  roas numeric not null check (roas >= 0),
  fetched_at timestamptz not null,
  availability text not null
    check (availability in ('live', 'stale', 'unavailable', 'pending_configuration')),
  created_at timestamptz not null default now(),
  unique (ad_account_id, reporting_date)
);

create table if not exists public.vault_meta_ads_sync_state (
  singleton boolean primary key default true check (singleton),
  ad_account_id text,
  reporting_timezone text,
  currency text,
  availability text not null
    check (availability in ('live', 'stale', 'unavailable', 'pending_configuration')),
  last_attempted_at timestamptz not null,
  last_successful_at timestamptz,
  failure_code text,
  check (
    failure_code is null
    or failure_code in (
      'configuration_missing',
      'unauthorized',
      'throttled',
      'meta_api_error',
      'invalid_response'
    )
  )
);

alter table public.vault_meta_ads_daily enable row level security;
alter table public.vault_meta_ads_sync_state enable row level security;

revoke all on public.vault_meta_ads_daily from anon, authenticated;
revoke all on public.vault_meta_ads_sync_state from anon, authenticated;

insert into public.vault_meta_ads_sync_state
  (
    singleton,
    availability,
    last_attempted_at,
    failure_code
  )
values (
  true,
  'pending_configuration',
  now(),
  null
)
on conflict (singleton) do nothing;

create index if not exists vault_meta_ads_daily_date_idx
  on public.vault_meta_ads_daily (reporting_date desc);

notify pgrst, 'reload schema';
