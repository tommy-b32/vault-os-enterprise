-- Complete the consent-aware Command Centre funnel with live tracked-session rates.
-- These rates deliberately use only analytics-consented Shopify client sessions;
-- privacy-limited visits remain visible in traffic totals but are never inferred
-- into behavioural funnel events.

create or replace view public.vault_storefront_funnel_today as
with source_status as (
  select
    exists (
      select 1 from public.vault_events
      where event_name = 'PAGE_VIEW' and session_id is not null
    ) as sessions_available,
    exists (
      select 1 from public.vault_events
      where event_name = 'PRODUCT_ADDED_TO_CART' and occurred_at is not null
    ) as add_to_cart_available,
    exists (
      select 1 from public.vault_events
      where event_name = 'CHECKOUT_STARTED'
        and occurred_at is not null
        and shopify_checkout_token is not null
    ) as checkout_available
),
today_events as (
  select
    count(distinct session_id) filter (
      where event_name = 'PAGE_VIEW' and session_id is not null
    )::integer as tracked_sessions,
    count(distinct session_id) filter (
      where event_name = 'PRODUCT_ADDED_TO_CART' and session_id is not null
    )::integer as add_to_cart_sessions,
    count(distinct session_id) filter (
      where event_name = 'CHECKOUT_STARTED' and session_id is not null
    )::integer as checkout_started_sessions,
    count(distinct session_id) filter (
      where event_name = 'CHECKOUT_COMPLETED' and session_id is not null
    )::integer as checkout_completed_sessions
  from public.vault_events
  where event_name in (
    'PAGE_VIEW',
    'PRODUCT_ADDED_TO_CART',
    'CHECKOUT_STARTED',
    'CHECKOUT_COMPLETED'
  )
    and (coalesce(occurred_at, created_at) at time zone 'Europe/London')::date =
      (now() at time zone 'Europe/London')::date
),
today_abandoned_checkout as (
  select count(distinct started.shopify_checkout_token)::integer as checkout_count
  from public.vault_events started
  where started.event_name = 'CHECKOUT_STARTED'
    and started.occurred_at is not null
    and started.shopify_checkout_token is not null
    and (started.occurred_at at time zone 'Europe/London')::date =
      (now() at time zone 'Europe/London')::date
    and started.occurred_at <= now() - interval '30 minutes'
    and not exists (
      select 1 from public.vault_events completed
      where completed.event_name = 'CHECKOUT_COMPLETED'
        and completed.shopify_checkout_token = started.shopify_checkout_token
    )
    and not exists (
      select 1 from public.vault_shopify_orders orders
      where orders.shopify_checkout_token = started.shopify_checkout_token
    )
),
latest_funnel_event as (
  select max(coalesce(occurred_at, created_at)) as latest_activity_at
  from public.vault_events
  where event_name in (
    'PAGE_VIEW',
    'PRODUCT_ADDED_TO_CART',
    'CHECKOUT_STARTED',
    'CHECKOUT_COMPLETED'
  )
)
select
  case when source_status.sessions_available
    then today_events.tracked_sessions else null end as tracked_sessions,
  case when source_status.add_to_cart_available
    then today_events.add_to_cart_sessions else null end as add_to_cart_sessions,
  case when source_status.checkout_available
    then today_events.checkout_started_sessions else null end as checkout_started_sessions,
  case when source_status.checkout_available
    then today_events.checkout_completed_sessions else null end as checkout_completed_sessions,
  case when source_status.checkout_available
    then today_abandoned_checkout.checkout_count else null end as abandoned_checkouts,
  case when source_status.sessions_available and source_status.add_to_cart_available
    then round(today_events.add_to_cart_sessions * 100.0 /
      nullif(today_events.tracked_sessions, 0), 2)
    else null end as add_to_cart_rate,
  case when source_status.sessions_available and source_status.checkout_available
    then round(today_events.checkout_started_sessions * 100.0 /
      nullif(today_events.tracked_sessions, 0), 2)
    else null end as checkout_rate,
  case when source_status.sessions_available and source_status.checkout_available
    then round(today_events.checkout_completed_sessions * 100.0 /
      nullif(today_events.tracked_sessions, 0), 2)
    else null end as conversion_rate,
  latest_funnel_event.latest_activity_at
from source_status
cross join today_events
cross join today_abandoned_checkout
cross join latest_funnel_event;

revoke all on public.vault_storefront_funnel_today from anon, authenticated;

comment on view public.vault_storefront_funnel_today is
  'Consent-aware live Shopify funnel KPIs for the current Europe/London business day. Behavioural rates use tracked sessions only; no privacy-limited behaviour is inferred.';

notify pgrst, 'reload schema';
