-- Complete the consent-aware Command Centre funnel with compatible live rates.
-- Privacy-limited visits never enter behavioural session populations.

create or replace view public.vault_storefront_funnel_today as
with source_status as (
  select
    exists (
      select 1 from public.vault_events
      where event_name = 'PAGE_VIEW'
        and analytics_allowed = true
        and session_id is not null
        and occurred_at is not null
    ) as sessions_available,
    exists (
      select 1 from public.vault_events
      where event_name = 'PRODUCT_ADDED_TO_CART'
        and analytics_allowed = true
        and session_id is not null
        and occurred_at is not null
    ) as add_to_cart_available,
    exists (
      select 1 from public.vault_events
      where event_name = 'CHECKOUT_STARTED'
        and analytics_allowed = true
        and session_id is not null
        and occurred_at is not null
        and shopify_checkout_token is not null
    ) as checkout_started_available,
    exists (
      select 1 from public.vault_events
      where event_name = 'CHECKOUT_COMPLETED'
        and analytics_allowed = true
        and session_id is not null
        and occurred_at is not null
        and shopify_checkout_token is not null
    ) as checkout_completed_available
),
tracked_sessions as (
  select distinct session_id
  from public.vault_events
  where event_name = 'PAGE_VIEW'
    and analytics_allowed = true
    and session_id is not null
    and occurred_at is not null
    and (occurred_at at time zone 'Europe/London')::date =
      (now() at time zone 'Europe/London')::date
),
today_events as (
  select
    (select count(*) from tracked_sessions)::integer as tracked_sessions,
    count(distinct event.session_id) filter (
      where event.event_name = 'PRODUCT_ADDED_TO_CART'
    )::integer as add_to_cart_sessions,
    count(distinct event.session_id) filter (
      where event.event_name = 'CHECKOUT_STARTED'
    )::integer as checkout_started_sessions,
    count(distinct event.session_id) filter (
      where event.event_name = 'CHECKOUT_COMPLETED'
    )::integer as checkout_completed_sessions
  from public.vault_events event
  join tracked_sessions tracked on tracked.session_id = event.session_id
  where event.analytics_allowed = true
    and event.occurred_at is not null
    and event.event_name in (
      'PRODUCT_ADDED_TO_CART',
      'CHECKOUT_STARTED',
      'CHECKOUT_COMPLETED'
    )
    and (event.occurred_at at time zone 'Europe/London')::date =
      (now() at time zone 'Europe/London')::date
),
today_abandoned_checkout as (
  select count(distinct started.shopify_checkout_token)::integer as checkout_count
  from public.vault_events started
  join tracked_sessions tracked on tracked.session_id = started.session_id
  where started.event_name = 'CHECKOUT_STARTED'
    and started.analytics_allowed = true
    and started.occurred_at is not null
    and started.shopify_checkout_token is not null
    and (started.occurred_at at time zone 'Europe/London')::date =
      (now() at time zone 'Europe/London')::date
    and started.occurred_at <= now() - interval '30 minutes'
    and not exists (
      select 1 from public.vault_events completed
      where completed.event_name = 'CHECKOUT_COMPLETED'
        and completed.analytics_allowed = true
        and completed.shopify_checkout_token = started.shopify_checkout_token
    )
    and not exists (
      select 1 from public.vault_shopify_orders orders
      where orders.shopify_checkout_token = started.shopify_checkout_token
    )
),
latest_funnel_event as (
  select max(occurred_at) as latest_activity_at
  from public.vault_events
  where analytics_allowed = true
    and session_id is not null
    and occurred_at is not null
    and event_name in (
      'PAGE_VIEW',
      'PRODUCT_ADDED_TO_CART',
      'CHECKOUT_STARTED',
      'CHECKOUT_COMPLETED'
    )
)
select
  case when source_status.add_to_cart_available
    then today_events.add_to_cart_sessions else null end as add_to_cart_sessions,
  case when source_status.checkout_started_available
    then today_abandoned_checkout.checkout_count else null end as abandoned_checkouts,
  latest_funnel_event.latest_activity_at,
  case when source_status.sessions_available
    then today_events.tracked_sessions else null end as tracked_sessions,
  case when source_status.checkout_started_available
    then today_events.checkout_started_sessions else null end as checkout_started_sessions,
  case when source_status.checkout_completed_available
    then today_events.checkout_completed_sessions else null end as checkout_completed_sessions,
  case when source_status.sessions_available and source_status.add_to_cart_available
    then round(today_events.add_to_cart_sessions * 100.0 /
      nullif(today_events.tracked_sessions, 0), 2)
    else null end as add_to_cart_rate,
  case when source_status.sessions_available and source_status.checkout_started_available
    then round(today_events.checkout_started_sessions * 100.0 /
      nullif(today_events.tracked_sessions, 0), 2)
    else null end as checkout_rate,
  case when source_status.sessions_available and source_status.checkout_completed_available
    then round(today_events.checkout_completed_sessions * 100.0 /
      nullif(today_events.tracked_sessions, 0), 2)
    else null end as conversion_rate
from source_status
cross join today_events
cross join today_abandoned_checkout
cross join latest_funnel_event;

revoke all on public.vault_storefront_funnel_today from anon, authenticated;

comment on view public.vault_storefront_funnel_today is
  'Consent-aware Shopify funnel KPIs for the current Europe/London business day. Rates use only sessions with a valid consented page view; privacy-limited visits are excluded. Checkout starts mature after 30 minutes and use exact checkout-token completion and order correlation.';

notify pgrst, 'reload schema';
