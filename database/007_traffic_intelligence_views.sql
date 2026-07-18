-- ============================================================
-- VAULT OS
-- Migration 007: Traffic Intelligence Views
-- ============================================================

-- Combines tracked page views and privacy-limited page views
-- into one reporting source.

create or replace view public.vault_traffic_all as

select
  created_at as occurred_at,
  date_trunc('day', created_at) as day_bucket,
  date_trunc('hour', created_at) as hour_bucket,
  page_path,
  page_type,
  'tracked'::text as privacy_mode,
  analytics_allowed,
  session_id,
  1::integer as view_count
from public.vault_events
where event_name = 'PAGE_VIEW'

union all

select
  recorded_at as occurred_at,
  date_trunc('day', recorded_at) as day_bucket,
  date_trunc('hour', recorded_at) as hour_bucket,
  page_path,
  page_type,
  'privacy_limited'::text as privacy_mode,
  analytics_allowed,
  null::text as session_id,
  total_views as view_count
from public.vault_traffic_counts;


-- Daily totals for Vault Command.

create or replace view public.vault_traffic_daily as

select
  day_bucket::date as traffic_date,

  sum(view_count) as total_page_views,

  sum(view_count)
    filter (
      where privacy_mode = 'tracked'
    ) as tracked_page_views,

  sum(view_count)
    filter (
      where privacy_mode = 'privacy_limited'
    ) as privacy_limited_page_views,

  count(distinct session_id)
    filter (
      where privacy_mode = 'tracked'
      and session_id is not null
    ) as tracked_sessions,

  round(
    (
      sum(view_count)
        filter (
          where privacy_mode = 'tracked'
        )
      * 100.0
    )
    /
    nullif(
      sum(view_count),
      0
    ),
    2
  ) as tracked_view_percentage,

  round(
    (
      sum(view_count)
        filter (
          where privacy_mode = 'privacy_limited'
        )
      * 100.0
    )
    /
    nullif(
      sum(view_count),
      0
    ),
    2
  ) as privacy_limited_percentage

from public.vault_traffic_all
group by day_bucket::date;


-- Daily totals split by page type.

create or replace view public.vault_traffic_by_page_type as

select
  day_bucket::date as traffic_date,
  coalesce(page_type, 'unknown') as page_type,

  sum(view_count) as total_page_views,

  sum(view_count)
    filter (
      where privacy_mode = 'tracked'
    ) as tracked_page_views,

  sum(view_count)
    filter (
      where privacy_mode = 'privacy_limited'
    ) as privacy_limited_page_views

from public.vault_traffic_all
group by
  day_bucket::date,
  coalesce(page_type, 'unknown');


-- Operational reporting remains private.

revoke all
  on public.vault_traffic_all
  from anon;

revoke all
  on public.vault_traffic_daily
  from anon;

revoke all
  on public.vault_traffic_by_page_type
  from anon;

notify pgrst, 'reload schema';