-- ============================================================
-- VAULT OS
-- Migration 001: Initial Event Schema
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Consented or otherwise permitted storefront events
-- ------------------------------------------------------------

create table if not exists public.vault_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  session_id text not null,
  event_name text not null,
  event_source text not null default 'storefront',

  page_path text,
  page_type text,

  product_id text,
  product_handle text,
  product_title text,
  variant_id text,
  variant_title text,
  selected_colour text,
  selected_size text,

  qualifies_for_bundle boolean not null default false,

  customer_item_count integer not null default 0,
  qualifying_item_count integer not null default 0,
  qualifying_pair_count integer not null default 0,
  secured_saving numeric(10, 2) not null default 0,

  vaultcare_active boolean not null default false,

  operator_intent text,
  operator_mission text,
  operator_message_id text,
  confidence_score integer,

  analytics_allowed boolean not null default false,

  metadata jsonb not null default '{}'::jsonb,

  constraint vault_events_session_id_length
    check (char_length(session_id) between 1 and 150),

  constraint vault_events_event_name_length
    check (char_length(event_name) between 1 and 100),

  constraint vault_events_customer_items_valid
    check (customer_item_count >= 0),

  constraint vault_events_qualifying_items_valid
    check (qualifying_item_count >= 0),

  constraint vault_events_qualifying_pairs_valid
    check (qualifying_pair_count >= 0),

  constraint vault_events_saving_valid
    check (secured_saving >= 0),

  constraint vault_events_confidence_valid
    check (
      confidence_score is null
      or confidence_score between 0 and 100
    )
);

create index if not exists vault_events_created_at_idx
  on public.vault_events (created_at desc);

create index if not exists vault_events_event_name_idx
  on public.vault_events (event_name);

create index if not exists vault_events_session_id_idx
  on public.vault_events (session_id);

create index if not exists vault_events_product_handle_idx
  on public.vault_events (product_handle);

-- ------------------------------------------------------------
-- Privacy-limited aggregate traffic
--
-- No persistent customer identifier.
-- No journey replay.
-- No fingerprinting.
-- ------------------------------------------------------------

create table if not exists public.vault_traffic_counts (
  id uuid primary key default gen_random_uuid(),
  recorded_at timestamptz not null default now(),

  minute_bucket timestamptz not null,
  page_path text,
  page_type text,

  total_views integer not null default 1,
  analytics_allowed boolean not null default false,

  metadata jsonb not null default '{}'::jsonb,

  constraint vault_traffic_total_views_valid
    check (total_views >= 1)
);

create index if not exists vault_traffic_minute_bucket_idx
  on public.vault_traffic_counts (minute_bucket desc);

create index if not exists vault_traffic_page_path_idx
  on public.vault_traffic_counts (page_path);

-- ------------------------------------------------------------
-- Security
-- Storefront may insert only.
-- Storefront cannot read, edit or delete analytics records.
-- ------------------------------------------------------------

alter table public.vault_events
  enable row level security;

alter table public.vault_traffic_counts
  enable row level security;

drop policy if exists
  "Allow storefront event inserts"
  on public.vault_events;

create policy
  "Allow storefront event inserts"
  on public.vault_events
  for insert
  to anon
  with check (
    session_id is not null
    and event_name is not null
    and event_source = 'storefront'
  );

drop policy if exists
  "Allow aggregate traffic inserts"
  on public.vault_traffic_counts;

create policy
  "Allow aggregate traffic inserts"
  on public.vault_traffic_counts
  for insert
  to anon
  with check (
    total_views >= 1
  );

revoke all
  on table public.vault_events
  from anon;

revoke all
  on table public.vault_traffic_counts
  from anon;

grant insert
  on table public.vault_events
  to anon;

grant insert
  on table public.vault_traffic_counts
  to anon;