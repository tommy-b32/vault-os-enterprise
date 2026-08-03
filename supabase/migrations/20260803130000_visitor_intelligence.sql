-- Canonical, consent-safe visitor intelligence.
-- Tracked identifiers remain Shopify client IDs; privacy visit identifiers are
-- ephemeral, browser-memory-only estimates and are never linked to them.

alter table public.vault_events
  add column if not exists shopify_event_id text;

alter table public.vault_traffic_counts
  add column if not exists privacy_visit_id text,
  add column if not exists shopify_event_id text;

create unique index if not exists vault_events_shopify_event_id_uidx
  on public.vault_events (shopify_event_id)
  where shopify_event_id is not null;

create unique index if not exists vault_traffic_counts_shopify_event_id_uidx
  on public.vault_traffic_counts (shopify_event_id)
  where shopify_event_id is not null;

create index if not exists vault_traffic_counts_privacy_visit_id_idx
  on public.vault_traffic_counts (privacy_visit_id)
  where privacy_visit_id is not null;

create or replace view public.vault_traffic_all as
select
  created_at as occurred_at,
  date_trunc('day', created_at at time zone 'UTC') at time zone 'UTC'
    as day_bucket,
  date_trunc('hour', created_at at time zone 'UTC') at time zone 'UTC'
    as hour_bucket,
  page_path,
  page_type,
  'tracked'::text as privacy_mode,
  analytics_allowed,
  session_id,
  1::integer as view_count,
  null::text as privacy_visit_id
from public.vault_events
where event_name = 'PAGE_VIEW'

union all

select
  recorded_at as occurred_at,
  date_trunc('day', recorded_at at time zone 'UTC') at time zone 'UTC'
    as day_bucket,
  date_trunc('hour', recorded_at at time zone 'UTC') at time zone 'UTC'
    as hour_bucket,
  page_path,
  page_type,
  'privacy_limited'::text as privacy_mode,
  analytics_allowed,
  null::text as session_id,
  total_views as view_count,
  privacy_visit_id
from public.vault_traffic_counts;

create or replace view public.vault_traffic_daily as
with privacy_estimation as (
  select min(recorded_at) as enabled_at
  from public.vault_traffic_counts
  where privacy_visit_id is not null
)
select
  (day_bucket at time zone 'UTC')::date as traffic_date,
  sum(view_count) as total_page_views,
  sum(view_count) filter (where privacy_mode = 'tracked') as tracked_page_views,
  sum(view_count) filter (where privacy_mode = 'privacy_limited')
    as privacy_limited_page_views,
  count(distinct session_id) filter (
    where privacy_mode = 'tracked' and session_id is not null
  ) as tracked_sessions,
  round(
    sum(view_count) filter (where privacy_mode = 'tracked') * 100.0
      / nullif(sum(view_count), 0),
    2
  ) as tracked_view_percentage,
  round(
    sum(view_count) filter (where privacy_mode = 'privacy_limited') * 100.0
      / nullif(sum(view_count), 0),
    2
  ) as privacy_limited_percentage,
  count(distinct session_id) filter (
    where privacy_mode = 'tracked' and session_id is not null
  ) as tracked_visitors,
  case
    when privacy_estimation.enabled_at is null
      or (day_bucket at time zone 'UTC')::date < (privacy_estimation.enabled_at at time zone 'UTC')::date
      or count(*) filter (
        where privacy_mode = 'privacy_limited' and privacy_visit_id is null
      ) > 0
      then null
    else count(distinct privacy_visit_id) filter (
      where privacy_mode = 'privacy_limited' and privacy_visit_id is not null
    )
  end as estimated_privacy_visitors,
  case
    when privacy_estimation.enabled_at is null
      or (day_bucket at time zone 'UTC')::date < (privacy_estimation.enabled_at at time zone 'UTC')::date
      or count(*) filter (
        where privacy_mode = 'privacy_limited' and privacy_visit_id is null
      ) > 0
      then null
    else
      count(distinct session_id) filter (
        where privacy_mode = 'tracked' and session_id is not null
      )
      + count(distinct privacy_visit_id) filter (
        where privacy_mode = 'privacy_limited' and privacy_visit_id is not null
      )
  end as estimated_total_visitors,
  case
    when privacy_estimation.enabled_at is null
      or (day_bucket at time zone 'UTC')::date < (privacy_estimation.enabled_at at time zone 'UTC')::date
      or count(*) filter (
        where privacy_mode = 'privacy_limited' and privacy_visit_id is null
      ) > 0
      then null
    else round(
      count(distinct session_id) filter (
        where privacy_mode = 'tracked' and session_id is not null
      ) * 100.0 / nullif(
        count(distinct session_id) filter (
          where privacy_mode = 'tracked' and session_id is not null
        ) + count(distinct privacy_visit_id) filter (
          where privacy_mode = 'privacy_limited' and privacy_visit_id is not null
        ),
        0
      ),
      2
    )
  end as tracked_visitor_percentage,
  case
    when privacy_estimation.enabled_at is null
      or (day_bucket at time zone 'UTC')::date < (privacy_estimation.enabled_at at time zone 'UTC')::date
      or count(*) filter (
        where privacy_mode = 'privacy_limited' and privacy_visit_id is null
      ) > 0
      then null
    else round(
      count(distinct privacy_visit_id) filter (
        where privacy_mode = 'privacy_limited' and privacy_visit_id is not null
      ) * 100.0 / nullif(
        count(distinct session_id) filter (
          where privacy_mode = 'tracked' and session_id is not null
        ) + count(distinct privacy_visit_id) filter (
          where privacy_mode = 'privacy_limited' and privacy_visit_id is not null
        ),
        0
      ),
      2
    )
  end as estimated_privacy_visitor_percentage,
  case
    when (day_bucket at time zone 'UTC')::date = (now() at time zone 'UTC')::date then
      count(distinct session_id) filter (
        where privacy_mode = 'tracked'
          and session_id is not null
          and occurred_at >= now() - interval '5 minutes'
      )
    else null
  end as live_tracked_visitors,
  max(occurred_at) as latest_activity_at
from public.vault_traffic_all
cross join privacy_estimation
group by (day_bucket at time zone 'UTC')::date, privacy_estimation.enabled_at;

revoke all on public.vault_traffic_all from anon;
revoke all on public.vault_traffic_daily from anon;

comment on column public.vault_traffic_daily.tracked_visitors is
  'Distinct tracked Shopify client IDs observed during the UTC reporting day; not unique people or Shopify sessions.';
comment on column public.vault_traffic_daily.tracked_sessions is
  'Deprecated compatibility field. This is a distinct Shopify client-ID count, not a session count; use tracked_visitors.';
comment on column public.vault_traffic_daily.estimated_privacy_visitors is
  'Estimate from non-persistent, memory-only privacy visit IDs; null where estimation was unsupported or incomplete.';

notify pgrst, 'reload schema';
