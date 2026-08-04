-- ============================================================
-- VAULT OS
-- Canonical append-only business event store
-- ============================================================

create table if not exists public.vault_business_events (
  id text primary key,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  event_type text not null
    check (event_type in (
      'shopify-order-created',
      'shopify-order-fulfilled',
      'shopify-refund'
    )),
  severity text not null
    check (severity in ('info', 'success', 'warning', 'critical')),
  source text not null
    check (source in (
      'shopify',
      'inventory',
      'website',
      'finance',
      'trustpilot',
      'vault-brain'
    )),
  entity_type text not null,
  entity_id text not null,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists vault_business_events_occurred_at_idx
on public.vault_business_events(occurred_at desc);

create index if not exists vault_business_events_entity_idx
on public.vault_business_events(entity_type, entity_id, occurred_at desc);

alter table public.vault_business_events enable row level security;

revoke all on table public.vault_business_events from anon, authenticated;

comment on table public.vault_business_events is
  'Private append-only record of deterministic canonical business events. No historical backfill is performed.';

create or replace function public.prevent_business_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  raise exception 'vault_business_events is append-only';
end
$function$;

drop trigger if exists vault_business_events_prevent_mutation
on public.vault_business_events;

create trigger vault_business_events_prevent_mutation
before update or delete
on public.vault_business_events
for each row
execute function public.prevent_business_event_mutation();

create or replace function public.capture_shopify_order_business_events()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if tg_op = 'INSERT' then
    insert into public.vault_business_events (
      id,
      occurred_at,
      event_type,
      severity,
      source,
      entity_type,
      entity_id,
      title,
      description,
      metadata
    ) values (
      'shopify-order-created:' || new.shopify_order_id,
      new.shopify_created_at,
      'shopify-order-created',
      'success',
      'shopify',
      'shopify-order',
      new.shopify_order_id,
      new.order_name || ' created',
      null,
      jsonb_build_object(
        'orderId', new.shopify_order_id,
        'orderName', new.order_name,
        'amount', new.net_revenue,
        'currency', new.currency,
        'financialStatus', new.financial_status,
        'fulfilmentStatus', new.fulfilment_status
      )
    )
    on conflict (id) do nothing;

    return new;
  end if;

  if
    upper(coalesce(new.fulfilment_status, '')) = 'FULFILLED'
    and upper(coalesce(old.fulfilment_status, '')) <> 'FULFILLED'
  then
    insert into public.vault_business_events (
      id,
      occurred_at,
      event_type,
      severity,
      source,
      entity_type,
      entity_id,
      title,
      description,
      metadata
    ) values (
      'shopify-order-fulfilled:' || new.shopify_order_id,
      new.shopify_updated_at,
      'shopify-order-fulfilled',
      'success',
      'shopify',
      'shopify-order',
      new.shopify_order_id,
      new.order_name || ' fulfilled',
      null,
      jsonb_build_object(
        'orderId', new.shopify_order_id,
        'orderName', new.order_name,
        'amount', new.net_revenue,
        'currency', new.currency,
        'financialStatus', new.financial_status,
        'fulfilmentStatus', new.fulfilment_status
      )
    )
    on conflict (id) do nothing;
  end if;

  if new.refunds > old.refunds then
    insert into public.vault_business_events (
      id,
      occurred_at,
      event_type,
      severity,
      source,
      entity_type,
      entity_id,
      title,
      description,
      metadata
    ) values (
      'shopify-refund:' || new.shopify_order_id || ':' || new.refunds::text,
      new.shopify_updated_at,
      'shopify-refund',
      'warning',
      'shopify',
      'shopify-order',
      new.shopify_order_id,
      new.order_name || ' refund recorded',
      null,
      jsonb_build_object(
        'orderId', new.shopify_order_id,
        'orderName', new.order_name,
        'refundAmount', new.refunds - old.refunds,
        'totalRefunded', new.refunds,
        'currency', new.currency,
        'financialStatus', new.financial_status,
        'fulfilmentStatus', new.fulfilment_status
      )
    )
    on conflict (id) do nothing;
  end if;

  return new;
end
$function$;

drop trigger if exists vault_shopify_orders_capture_business_events
on public.vault_shopify_orders;

create trigger vault_shopify_orders_capture_business_events
after insert or update
on public.vault_shopify_orders
for each row
execute function public.capture_shopify_order_business_events();

notify pgrst, 'reload schema';
