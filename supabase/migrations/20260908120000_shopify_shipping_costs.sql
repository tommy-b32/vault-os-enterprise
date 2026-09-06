begin;

create table public.vault_shopify_shipping_costs (
  order_id uuid primary key references public.vault_shopify_orders(id) on delete cascade,
  shopify_order_id text not null,
  shop_id text not null,
  label_cost_gbp numeric(14,2),
  label_count integer,
  currency text not null default 'GBP' check (currency = 'GBP'),
  accounting_status text not null default 'unreconciled' check (accounting_status = 'unreconciled'),
  query_from date not null,
  fetched_at timestamptz not null,
  check ((label_cost_gbp is null and label_count is null) or
    (label_cost_gbp is not null and label_cost_gbp >= 0 and label_count is not null and label_count > 0))
);
comment on table public.vault_shopify_shipping_costs is
  'ShopifyQL purchased label totals per order, not customer shipping charges. Operational only: label refunds, adjustments and tax reconciliation unverified. NULL means missing, never assumed zero.';
alter table public.vault_shopify_shipping_costs enable row level security;
revoke all on public.vault_shopify_shipping_costs from anon, authenticated;
grant select on public.vault_shopify_shipping_costs to service_role;

create function public.record_shopify_shipping_costs(snapshots jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if jsonb_typeof(snapshots) <> 'array' or jsonb_array_length(snapshots) not between 1 and 50 then
    raise exception 'Invalid shipping batch';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(snapshots) as s(order_id uuid, shopify_order_id text, query_from date, fetched_at timestamptz)
    left join vault_shopify_orders o on o.id = s.order_id and o.shopify_order_id = s.shopify_order_id and o.source = 'shopify'
    where o.id is null or s.query_from > (o.shopify_created_at at time zone 'Europe/London')::date
      or s.fetched_at > clock_timestamp() + interval '1 minute'
  ) then raise exception 'Shipping order identity or source bounds mismatch'; end if;
  insert into vault_shopify_shipping_costs(order_id, shopify_order_id, shop_id, label_cost_gbp, label_count, query_from, fetched_at)
    select order_id, shopify_order_id, shop_id, label_cost_gbp, label_count, query_from, fetched_at
    from jsonb_to_recordset(snapshots) as s(order_id uuid, shopify_order_id text, shop_id text,
      label_cost_gbp numeric, label_count integer, query_from date, fetched_at timestamptz)
  on conflict (order_id) do update set
    label_cost_gbp = excluded.label_cost_gbp, label_count = excluded.label_count,
    shop_id = excluded.shop_id, query_from = excluded.query_from, fetched_at = excluded.fetched_at
  where excluded.fetched_at > vault_shopify_shipping_costs.fetched_at;
end;
$$;
revoke all on function public.record_shopify_shipping_costs(jsonb) from public, anon, authenticated;
grant execute on function public.record_shopify_shipping_costs(jsonb) to service_role;

create function public.get_shopify_daily_shipping(target_at timestamptz default now())
returns table(total_shipping_gbp numeric, order_count bigint, covered_orders bigint, source_at timestamptz, accounting_status text)
language sql stable security definer set search_path = public as $$
  with cohort as (
    select o.id, s.label_cost_gbp, s.fetched_at
    from vault_shopify_orders o left join vault_shopify_shipping_costs s
      on s.order_id = o.id and s.shopify_order_id = o.shopify_order_id
    where o.source = 'shopify' and o.cancelled_at is null and o.metadata->>'test' = 'false'
      and o.shopify_created_at >= date_trunc('day', target_at at time zone 'Europe/London') at time zone 'Europe/London'
      and o.shopify_created_at < (date_trunc('day', target_at at time zone 'Europe/London') + interval '1 day') at time zone 'Europe/London'
  ) select case when count(*) > 0 and count(label_cost_gbp) = count(*) then sum(label_cost_gbp) end,
    count(*), count(label_cost_gbp), min(fetched_at), 'unreconciled'::text from cohort;
$$;
revoke all on function public.get_shopify_daily_shipping(timestamptz) from public, anon, authenticated;
grant execute on function public.get_shopify_daily_shipping(timestamptz) to service_role;
notify pgrst, 'reload schema';
commit;
