begin;

create table public.vault_shopify_payment_fee_records (
  order_id uuid not null references public.vault_shopify_orders(id) on delete cascade,
  shopify_order_id text not null,
  shopify_order_transaction_id text not null,
  fee_id text not null,
  gateway text not null,
  transaction_kind text not null,
  transaction_status text not null,
  processed_at timestamptz,
  fee_amount numeric(14,2) not null check (fee_amount >= 0),
  fee_currency text not null,
  tax_amount numeric(14,2) not null check (tax_amount >= 0),
  tax_currency text not null,
  source_classification text not null check (source_classification in ('shopify_payments', 'unsupported_gateway')),
  reconciliation_state text not null check (reconciliation_state in ('covered', 'unsupported_gateway', 'unresolved_reversal_or_adjustment', 'unresolved_duplicate_payment', 'unresolved_missing_fee', 'unresolved_currency')),
  counts_toward_profit boolean not null default false,
  fetched_at timestamptz not null,
  primary key (shopify_order_transaction_id, fee_id)
);
comment on table public.vault_shopify_payment_fee_records is
  'Exact Order.transactions[].fees records. Only covered successful Shopify Payments charges count; no payout-difference inference.';
alter table public.vault_shopify_payment_fee_records enable row level security;
revoke all on public.vault_shopify_payment_fee_records from anon, authenticated;
grant select on public.vault_shopify_payment_fee_records to service_role;

create table public.vault_shopify_payment_fee_coverage (
  order_id uuid primary key references public.vault_shopify_orders(id) on delete cascade,
  shopify_order_id text not null,
  coverage_state text not null check (coverage_state in ('covered', 'unsupported_gateway', 'unresolved_reversal_or_adjustment', 'unresolved_duplicate_payment', 'unresolved_missing_fee', 'unresolved_currency')),
  fetched_at timestamptz not null
);
comment on table public.vault_shopify_payment_fee_coverage is
  'Per-order fee completeness. Any non-covered order prevents Profit Today payment-fee availability.';
alter table public.vault_shopify_payment_fee_coverage enable row level security;
revoke all on public.vault_shopify_payment_fee_coverage from anon, authenticated;
grant select on public.vault_shopify_payment_fee_coverage to service_role;

create function public.record_shopify_payment_fees(fee_records jsonb, coverage_snapshots jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if jsonb_typeof(fee_records) <> 'array' or jsonb_array_length(fee_records) > 500 or
     jsonb_typeof(coverage_snapshots) <> 'array' or jsonb_array_length(coverage_snapshots) not between 1 and 50 then
    raise exception 'Invalid payment-fee batch';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(coverage_snapshots) as c(order_id uuid, shopify_order_id text, fetched_at timestamptz)
    left join vault_shopify_orders o on o.id = c.order_id and o.shopify_order_id = c.shopify_order_id and o.source = 'shopify'
    where o.id is null or c.fetched_at > clock_timestamp() + interval '1 minute'
  ) then raise exception 'Payment-fee order identity mismatch'; end if;
  if exists (
    select 1 from jsonb_to_recordset(fee_records) as r(order_id uuid, shopify_order_id text, fetched_at timestamptz)
    left join vault_shopify_orders o on o.id = r.order_id and o.shopify_order_id = r.shopify_order_id and o.source = 'shopify'
    where o.id is null or r.fetched_at > clock_timestamp() + interval '1 minute'
  ) then raise exception 'Payment-fee record identity mismatch'; end if;
  insert into vault_shopify_payment_fee_coverage(order_id, shopify_order_id, coverage_state, fetched_at)
    select order_id, shopify_order_id, coverage_state, fetched_at
    from jsonb_to_recordset(coverage_snapshots) as c(order_id uuid, shopify_order_id text, coverage_state text, fetched_at timestamptz)
  on conflict (order_id) do update set shopify_order_id = excluded.shopify_order_id, coverage_state = excluded.coverage_state, fetched_at = excluded.fetched_at
    where excluded.fetched_at > vault_shopify_payment_fee_coverage.fetched_at;
  insert into vault_shopify_payment_fee_records(order_id, shopify_order_id, shopify_order_transaction_id, fee_id, gateway, transaction_kind, transaction_status, processed_at, fee_amount, fee_currency, tax_amount, tax_currency, source_classification, reconciliation_state, counts_toward_profit, fetched_at)
    select order_id, shopify_order_id, shopify_order_transaction_id, fee_id, gateway, transaction_kind, transaction_status, processed_at, fee_amount, fee_currency, tax_amount, tax_currency, source_classification, reconciliation_state, counts_toward_profit, fetched_at
    from jsonb_to_recordset(fee_records) as r(order_id uuid, shopify_order_id text, shopify_order_transaction_id text, fee_id text, gateway text, transaction_kind text, transaction_status text, processed_at timestamptz, fee_amount numeric, fee_currency text, tax_amount numeric, tax_currency text, source_classification text, reconciliation_state text, counts_toward_profit boolean, fetched_at timestamptz)
  on conflict (shopify_order_transaction_id, fee_id) do update set order_id = excluded.order_id, shopify_order_id = excluded.shopify_order_id, gateway = excluded.gateway, transaction_kind = excluded.transaction_kind, transaction_status = excluded.transaction_status, processed_at = excluded.processed_at, fee_amount = excluded.fee_amount, fee_currency = excluded.fee_currency, tax_amount = excluded.tax_amount, tax_currency = excluded.tax_currency, source_classification = excluded.source_classification, reconciliation_state = excluded.reconciliation_state, counts_toward_profit = excluded.counts_toward_profit, fetched_at = excluded.fetched_at
    where excluded.fetched_at > vault_shopify_payment_fee_records.fetched_at;
end;
$$;
revoke all on function public.record_shopify_payment_fees(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_shopify_payment_fees(jsonb, jsonb) to service_role;

create function public.get_shopify_daily_payment_fees(target_at timestamptz default now())
returns table(total_payment_fees_gbp numeric, order_count bigint, covered_orders bigint, source_at timestamptz)
language sql stable security definer set search_path = public as $$
  with cohort as (
    select o.id, c.coverage_state, c.fetched_at
    from vault_shopify_orders o left join vault_shopify_payment_fee_coverage c on c.order_id = o.id and c.shopify_order_id = o.shopify_order_id
    where o.source = 'shopify' and o.cancelled_at is null and o.metadata->>'test' = 'false'
      and o.shopify_created_at >= date_trunc('day', target_at at time zone 'Europe/London') at time zone 'Europe/London'
      and o.shopify_created_at < (date_trunc('day', target_at at time zone 'Europe/London') + interval '1 day') at time zone 'Europe/London'
  ) select case when count(*) > 0 and count(*) filter (where coverage_state = 'covered') = count(*)
      then (select sum(r.fee_amount + r.tax_amount) from vault_shopify_payment_fee_records r join cohort c on c.id = r.order_id where r.counts_toward_profit and r.fee_currency = 'GBP' and r.tax_currency = 'GBP') end,
    count(*), count(*) filter (where coverage_state = 'covered'), min(fetched_at) from cohort;
$$;
revoke all on function public.get_shopify_daily_payment_fees(timestamptz) from public, anon, authenticated;
grant execute on function public.get_shopify_daily_payment_fees(timestamptz) to service_role;
notify pgrst, 'reload schema';
commit;
