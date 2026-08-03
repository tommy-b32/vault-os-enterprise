create table if not exists public.vault_shopify_payments_snapshots (
  id uuid primary key default gen_random_uuid(),
  activated boolean not null,
  default_currency char(3) not null,
  balances jsonb not null default '[]'::jsonb,
  today_payout jsonb,
  next_scheduled_payout jsonb,
  latest_successful_payout jsonb,
  synced_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists vault_shopify_payments_snapshots_synced_at_idx
  on public.vault_shopify_payments_snapshots (synced_at desc);

alter table public.vault_shopify_payments_snapshots enable row level security;

revoke all on public.vault_shopify_payments_snapshots from anon, authenticated;

comment on table public.vault_shopify_payments_snapshots is
  'Server-only Shopify Payments balance and payout summaries. Contains no bank-account details or transaction records.';

notify pgrst, 'reload schema';
