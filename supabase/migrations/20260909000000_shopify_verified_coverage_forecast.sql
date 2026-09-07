-- Historical created_at coverage is recorded only by successful backfill runs.
-- Existing runs deliberately remain unscoped and cannot prove a zero-order day.
begin;

alter table public.vault_shopify_order_sync_runs
  add column if not exists created_from timestamptz,
  add column if not exists created_before timestamptz;

alter table public.vault_shopify_order_sync_runs
  drop constraint if exists vault_shopify_order_sync_runs_created_coverage_check;
alter table public.vault_shopify_order_sync_runs
  add constraint vault_shopify_order_sync_runs_created_coverage_check check (
    (created_from is null and created_before is null)
    or (sync_mode = 'historical_orders_by_created_at'
      and created_from is not null and created_before is not null and created_from < created_before)
  );

create index if not exists vault_shopify_order_sync_runs_created_coverage_idx
  on public.vault_shopify_order_sync_runs (created_from, created_before)
  where sync_mode = 'historical_orders_by_created_at';

-- A candidate is included only if the union of persisted successful historical
-- windows covers its entire Europe/London calendar day.  This permits adjacent
-- UTC windows to cover a BST day without inventing coverage from order rows.
create function public.get_shopify_verified_weekday_samples(
  target_at timestamptz,
  matching_weekday integer
)
returns table(
  business_date date,
  full_revenue_gbp numeric,
  full_orders bigint,
  revenue_by_now_gbp numeric,
  orders_by_now bigint
)
language sql stable security definer set search_path = public as $$
  with clock as (
    select (target_at at time zone 'Europe/London')::date as today,
      (target_at at time zone 'Europe/London')::time as local_time
  ), coverage as (
    select range_agg(tstzrange(created_from, created_before, '[)')) as covered,
      min((created_from at time zone 'Europe/London')::date) as first_day
    from vault_shopify_order_sync_runs
    where sync_mode = 'historical_orders_by_created_at'
      and created_from is not null and created_before is not null
  ), candidates as (
    select day::date as business_date
    from coverage cross join clock,
      lateral generate_series(coverage.first_day, clock.today - 1, interval '1 day') day
    where extract(dow from day)::integer = matching_weekday
      and day::date <> date '2026-05-03'
      and coverage.covered @> tstzrange(
        (day::date::timestamp at time zone 'Europe/London'),
        ((day::date + 1)::timestamp at time zone 'Europe/London'), '[)'
      )
  ), daily as (
    select c.business_date,
      coalesce(sum(o.net_revenue) filter (where o.currency = 'GBP'), 0)::numeric as full_revenue_gbp,
      count(*) filter (where o.currency = 'GBP')::bigint as full_orders,
      coalesce(sum(o.net_revenue) filter (where o.currency = 'GBP' and o.shopify_created_at < ((c.business_date::timestamp + clock.local_time) at time zone 'Europe/London')), 0)::numeric as revenue_by_now_gbp,
      count(*) filter (where o.currency = 'GBP' and o.shopify_created_at < ((c.business_date::timestamp + clock.local_time) at time zone 'Europe/London'))::bigint as orders_by_now,
      coalesce(bool_or(o.currency <> 'GBP'), false) as has_non_gbp
    from candidates c cross join clock
    left join vault_shopify_orders o on (o.shopify_created_at at time zone 'Europe/London')::date = c.business_date
      and o.source = 'shopify' and o.cancelled_at is null and o.metadata->>'test' = 'false'
    group by c.business_date
  )
  select business_date, full_revenue_gbp, full_orders, revenue_by_now_gbp, orders_by_now
  from daily
  where not has_non_gbp
  order by business_date desc;
$$;

create or replace function public.get_shopify_today_performance(target_at timestamptz default now())
returns table(
  today_revenue_gbp numeric, expected_revenue_gbp numeric, revenue_pace_percent numeric,
  today_orders bigint, expected_orders numeric, today_aov_gbp numeric, historical_aov_gbp numeric,
  projected_revenue_gbp numeric, baseline_sample_count bigint, source_at timestamptz, availability text
)
language sql stable security definer set search_path = public as $$
  with clock as (
    select (target_at at time zone 'Europe/London')::date as today,
      (target_at at time zone 'Europe/London')::time as local_time,
      extract(dow from target_at at time zone 'Europe/London')::integer as weekday
  ), current_day as (
    select coalesce(sum(o.net_revenue) filter (where o.currency = 'GBP'), 0) as revenue,
      count(*) filter (where o.currency = 'GBP') as orders,
      coalesce(bool_or(o.currency <> 'GBP'), false) as incompatible_orders
    from vault_shopify_orders o cross join clock c
    where o.source = 'shopify' and o.cancelled_at is null and o.metadata->>'test' = 'false'
      and (o.shopify_created_at at time zone 'Europe/London')::date = c.today
      and o.shopify_created_at < ((c.today::timestamp + c.local_time) at time zone 'Europe/London')
  ), recent_twelve as (
    select s.* from clock c cross join lateral get_shopify_verified_weekday_samples(target_at, c.weekday) s
    order by s.business_date desc limit 12
  ), baseline as (
    select count(*)::bigint as samples, avg(revenue_by_now_gbp) as expected_revenue,
      avg(orders_by_now) as expected_orders,
      sum(revenue_by_now_gbp) / nullif(sum(orders_by_now), 0) as historical_aov,
      avg(revenue_by_now_gbp / nullif(full_revenue_gbp, 0)) filter (where full_revenue_gbp > 0) as completion_fraction
    from recent_twelve
  ), source as (
    select max(completed_at) as source_at from vault_shopify_order_sync_runs
    where sync_mode = 'historical_orders_by_created_at' and created_from is not null and created_before is not null
  )
  select case when b.samples >= 4 and not d.incompatible_orders then d.revenue end,
    case when b.samples >= 4 and not d.incompatible_orders then b.expected_revenue end,
    case when b.samples >= 4 and not d.incompatible_orders and b.expected_revenue > 0 then d.revenue / b.expected_revenue * 100 end,
    case when b.samples >= 4 and not d.incompatible_orders then d.orders end,
    case when b.samples >= 4 and not d.incompatible_orders then b.expected_orders end,
    case when b.samples >= 4 and not d.incompatible_orders then d.revenue / nullif(d.orders, 0) end,
    case when b.samples >= 4 and not d.incompatible_orders then b.historical_aov end,
    case when b.samples >= 4 and not d.incompatible_orders and b.completion_fraction > 0 and b.completion_fraction <= 1 then d.revenue / b.completion_fraction end,
    b.samples, source.source_at,
    case when b.samples >= 4 and not d.incompatible_orders and source.source_at is not null then 'available' else 'unavailable' end
  from current_day d cross join baseline b cross join source;
$$;

create function public.get_shopify_seven_day_forecast(target_at timestamptz default now())
returns table(
  forecast_revenue_gbp numeric, forecast_orders numeric, expected_aov_gbp numeric,
  average_revenue_per_day_gbp numeric, strongest_day date, strongest_revenue_gbp numeric,
  weakest_day date, weakest_revenue_gbp numeric, minimum_sample_count bigint,
  maximum_sample_count bigint, coverage_sample_count bigint, source_at timestamptz, availability text
)
language sql stable security definer set search_path = public as $$
  with clock as (
    select (target_at at time zone 'Europe/London')::date as today
  ), targets as (
    select day::date as business_date, extract(dow from day)::integer as weekday
    from clock, lateral generate_series(clock.today + 1, clock.today + 7, interval '1 day') day
  ), forecasts as (
    select t.business_date, count(s.*)::bigint as samples,
      avg(s.full_revenue_gbp) as revenue, avg(s.full_orders)::numeric as orders
    from targets t left join lateral (
      select * from get_shopify_verified_weekday_samples(target_at, t.weekday)
      limit 12
    ) s on true
    group by t.business_date
  ), evidence as (
    select min(samples) as minimum_sample_count, max(samples) as maximum_sample_count,
      sum(samples) as coverage_sample_count from forecasts
  ), source as (
    select max(completed_at) as source_at from vault_shopify_order_sync_runs
    where sync_mode = 'historical_orders_by_created_at' and created_from is not null and created_before is not null
  ), totals as (
    select sum(revenue) as revenue, sum(orders) as orders from forecasts
  )
  select case when e.minimum_sample_count >= 4 then totals.revenue end,
    case when e.minimum_sample_count >= 4 then totals.orders end,
    case when e.minimum_sample_count >= 4 then totals.revenue / nullif(totals.orders, 0) end,
    case when e.minimum_sample_count >= 4 then totals.revenue / 7 end,
    case when e.minimum_sample_count >= 4 then (select business_date from forecasts order by revenue desc, business_date limit 1) end,
    case when e.minimum_sample_count >= 4 then (select revenue from forecasts order by revenue desc, business_date limit 1) end,
    case when e.minimum_sample_count >= 4 then (select business_date from forecasts order by revenue, business_date limit 1) end,
    case when e.minimum_sample_count >= 4 then (select revenue from forecasts order by revenue, business_date limit 1) end,
    e.minimum_sample_count, e.maximum_sample_count, e.coverage_sample_count, source.source_at,
    case when e.minimum_sample_count >= 4 and source.source_at is not null then 'available' else 'unavailable' end
  from totals cross join evidence e cross join source;
$$;

revoke all on function public.get_shopify_verified_weekday_samples(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.get_shopify_today_performance(timestamptz) from public, anon, authenticated;
revoke all on function public.get_shopify_seven_day_forecast(timestamptz) from public, anon, authenticated;
grant execute on function public.get_shopify_today_performance(timestamptz) to service_role;
grant execute on function public.get_shopify_seven_day_forecast(timestamptz) to service_role;
commit;
