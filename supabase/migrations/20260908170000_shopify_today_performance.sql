begin;

create function public.get_shopify_today_performance(target_at timestamptz default now())
returns table(
  today_revenue_gbp numeric,
  expected_revenue_gbp numeric,
  revenue_pace_percent numeric,
  today_orders bigint,
  expected_orders numeric,
  today_aov_gbp numeric,
  historical_aov_gbp numeric,
  projected_revenue_gbp numeric,
  baseline_sample_count bigint,
  source_at timestamptz,
  availability text
)
language sql stable security definer set search_path = public as $$
  with clock as (
    select (target_at at time zone 'Europe/London')::date as today,
      (target_at at time zone 'Europe/London')::time as local_time,
      extract(dow from target_at at time zone 'Europe/London')::integer as weekday
  ), eligible as (
    select o.shopify_created_at, o.net_revenue, o.currency, o.synced_at,
      (o.shopify_created_at at time zone 'Europe/London')::date as business_date
    from vault_shopify_orders o
    where o.source = 'shopify' and o.cancelled_at is null and o.metadata->>'test' = 'false'
  ), current_day as (
    select coalesce(sum(net_revenue) filter (where currency = 'GBP' and shopify_created_at < ((c.today::timestamp + c.local_time) at time zone 'Europe/London')), 0) as revenue,
      count(*) filter (where currency = 'GBP' and shopify_created_at < ((c.today::timestamp + c.local_time) at time zone 'Europe/London')) as orders,
      count(*) filter (where currency <> 'GBP') as incompatible_orders,
      (select max(e2.synced_at) from eligible e2 cross join clock c2 where e2.business_date <= c2.today) as source_at
    from eligible e cross join clock c where e.business_date = c.today
  ), historical_days as (
    select e.business_date, sum(e.net_revenue) as full_revenue, count(*) as full_orders,
      sum(e.net_revenue) filter (where e.shopify_created_at < ((e.business_date::timestamp + c.local_time) at time zone 'Europe/London')) as revenue_by_now,
      count(*) filter (where e.shopify_created_at < ((e.business_date::timestamp + c.local_time) at time zone 'Europe/London')) as orders_by_now,
      bool_and(e.currency = 'GBP') as is_gbp
    from eligible e cross join clock c
    where e.business_date < c.today and e.business_date <> date '2026-05-03'
      and extract(dow from e.business_date)::integer = c.weekday
    group by e.business_date
  ), recent_twelve as (
    select * from historical_days
    where is_gbp
    order by business_date desc limit 12
  ), baseline as (
    select count(*) filter (where full_revenue > 0 and coalesce(revenue_by_now, 0) >= 0 and coalesce(revenue_by_now, 0) <= full_revenue) as samples,
      avg(revenue_by_now) filter (where full_revenue > 0 and coalesce(revenue_by_now, 0) >= 0 and coalesce(revenue_by_now, 0) <= full_revenue) as expected_revenue,
      avg(orders_by_now) filter (where full_revenue > 0 and coalesce(revenue_by_now, 0) >= 0 and coalesce(revenue_by_now, 0) <= full_revenue) as expected_orders,
      sum(revenue_by_now) filter (where full_revenue > 0 and coalesce(revenue_by_now, 0) >= 0 and coalesce(revenue_by_now, 0) <= full_revenue) / nullif(sum(orders_by_now) filter (where full_revenue > 0 and coalesce(revenue_by_now, 0) >= 0 and coalesce(revenue_by_now, 0) <= full_revenue), 0) as historical_aov,
      avg(revenue_by_now / nullif(full_revenue, 0)) filter (where full_revenue > 0 and coalesce(revenue_by_now, 0) >= 0 and coalesce(revenue_by_now, 0) <= full_revenue) as completion_fraction
    from recent_twelve
  ) select case when b.samples >= 4 and d.incompatible_orders = 0 then d.revenue end,
    case when b.samples >= 4 and d.incompatible_orders = 0 then b.expected_revenue end,
    case when b.samples >= 4 and d.incompatible_orders = 0 and b.expected_revenue > 0 then d.revenue / b.expected_revenue * 100 end,
    case when b.samples >= 4 and d.incompatible_orders = 0 then d.orders end,
    case when b.samples >= 4 and d.incompatible_orders = 0 then b.expected_orders end,
    case when b.samples >= 4 and d.incompatible_orders = 0 then d.revenue / nullif(d.orders, 0) end,
    case when b.samples >= 4 and d.incompatible_orders = 0 then b.historical_aov end,
    case when b.samples >= 4 and d.incompatible_orders = 0 and b.completion_fraction > 0 and b.completion_fraction <= 1 then d.revenue / b.completion_fraction end,
    b.samples, d.source_at,
    case when b.samples >= 4 and d.incompatible_orders = 0 then 'available' else 'unavailable' end
  from current_day d cross join baseline b;
$$;

revoke all on function public.get_shopify_today_performance(timestamptz) from public, anon, authenticated;
grant execute on function public.get_shopify_today_performance(timestamptz) to service_role;
notify pgrst, 'reload schema';
commit;
