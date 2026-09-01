-- Canonical Shopify Web Pixel funnel events and truthful Command Centre metrics.
-- Existing PAGE_VIEW rows remain unchanged; new canonical fields are nullable.

alter table public.vault_events
  add column if not exists occurred_at timestamptz,
  add column if not exists shopify_checkout_token text;

alter table public.vault_shopify_orders
  add column if not exists shopify_checkout_token text;

create index if not exists vault_events_funnel_occurred_at_idx
  on public.vault_events (event_name, occurred_at desc)
  where event_name in (
    'PRODUCT_ADDED_TO_CART',
    'CHECKOUT_STARTED',
    'CHECKOUT_COMPLETED'
  );

create index if not exists vault_events_checkout_token_idx
  on public.vault_events (shopify_checkout_token, event_name)
  where shopify_checkout_token is not null;

create index if not exists vault_shopify_orders_checkout_token_idx
  on public.vault_shopify_orders (shopify_checkout_token)
  where shopify_checkout_token is not null;

create or replace view public.vault_storefront_funnel_today as
with source_status as (
  select
    exists (
      select 1
      from public.vault_events
      where event_name = 'PRODUCT_ADDED_TO_CART'
        and occurred_at is not null
    ) as add_to_cart_available,
    exists (
      select 1
      from public.vault_events
      where event_name = 'CHECKOUT_STARTED'
        and occurred_at is not null
        and shopify_checkout_token is not null
    ) as checkout_available
),
today_add_to_cart as (
  select count(distinct session_id)::integer as session_count
  from public.vault_events
  where event_name = 'PRODUCT_ADDED_TO_CART'
    and occurred_at is not null
    and (occurred_at at time zone 'Europe/London')::date =
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
      select 1
      from public.vault_events completed
      where completed.event_name = 'CHECKOUT_COMPLETED'
        and completed.shopify_checkout_token = started.shopify_checkout_token
    )
    and not exists (
      select 1
      from public.vault_shopify_orders orders
      where orders.shopify_checkout_token = started.shopify_checkout_token
    )
),
latest_funnel_event as (
  select max(occurred_at) as latest_activity_at
  from public.vault_events
  where event_name in (
    'PRODUCT_ADDED_TO_CART',
    'CHECKOUT_STARTED',
    'CHECKOUT_COMPLETED'
  )
)
select
  case when source_status.add_to_cart_available
    then today_add_to_cart.session_count
    else null
  end as add_to_cart_sessions,
  case when source_status.checkout_available
    then today_abandoned_checkout.checkout_count
    else null
  end as abandoned_checkouts,
  latest_funnel_event.latest_activity_at
from source_status
cross join today_add_to_cart
cross join today_abandoned_checkout
cross join latest_funnel_event;

revoke all on public.vault_storefront_funnel_today from anon, authenticated;

comment on view public.vault_storefront_funnel_today is
  'Consent-aware Shopify funnel KPIs for the current Europe/London business day. Checkout starts mature after 30 minutes and are excluded by exact checkout-token matches to completion events or canonical orders.';

notify pgrst, 'reload schema';
