-- External postage evidence: separate from Shopify's refreshable snapshots.
-- Staging migration only. Do not apply to production without review.
create table public.vault_external_order_postage (
  order_id uuid primary key references public.vault_shopify_orders(id) on delete restrict,
  shopify_order_id text not null,
  amount_pence bigint not null check (amount_pence between 0 and 999999999),
  currency text not null default 'GBP' check (currency = 'GBP'),
  source text not null default 'manual_external' check (source = 'manual_external'),
  status text not null default 'approved' check (status = 'approved'),
  recorded_by_operator_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.vault_external_order_postage enable row level security;
revoke all on public.vault_external_order_postage from public, anon, authenticated;
grant select, insert on public.vault_external_order_postage to service_role;

create table public.vault_external_order_postage_audit (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.vault_shopify_orders(id) on delete restrict,
  amount_pence bigint not null,
  recorded_by_operator_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.vault_external_order_postage_audit enable row level security;
revoke all on public.vault_external_order_postage_audit from public, anon, authenticated;
grant select, insert on public.vault_external_order_postage_audit to service_role;

create function public.reject_external_order_postage_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'External postage evidence is immutable';
end;
$$;
create trigger external_order_postage_no_mutation before update or delete on public.vault_external_order_postage
for each row execute function public.reject_external_order_postage_mutation();
create trigger external_order_postage_audit_no_mutation before update or delete on public.vault_external_order_postage_audit
for each row execute function public.reject_external_order_postage_mutation();

create function public.record_external_order_postage(
  p_order_id uuid, p_amount_pence bigint, p_operator_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  canonical record;
  existing record;
begin
  if p_order_id is null or p_operator_id is null or p_amount_pence is null
    or p_amount_pence < 0 or p_amount_pence > 999999999 then
    raise exception 'Invalid external postage request';
  end if;
  select id, shopify_order_id into canonical
  from public.vault_shopify_orders
  where id = p_order_id and source = 'shopify'
  for key share;
  if not found then raise exception 'Canonical Shopify order unavailable'; end if;

  insert into public.vault_external_order_postage
    (order_id, shopify_order_id, amount_pence, recorded_by_operator_id)
  values (canonical.id, canonical.shopify_order_id, p_amount_pence, p_operator_id)
  on conflict (order_id) do nothing;

  select amount_pence, shopify_order_id into existing
  from public.vault_external_order_postage where order_id = p_order_id;
  if existing.amount_pence is distinct from p_amount_pence
    or existing.shopify_order_id is distinct from canonical.shopify_order_id then
    raise exception 'Conflicting external postage already recorded';
  end if;
  insert into public.vault_external_order_postage_audit
    (order_id, amount_pence, recorded_by_operator_id)
  select p_order_id, p_amount_pence, p_operator_id
  on conflict (order_id) do nothing;
  return jsonb_build_object('order_id', p_order_id, 'amount_pence', p_amount_pence, 'status', 'recorded');
end;
$$;
revoke all on function public.record_external_order_postage(uuid,bigint,uuid) from public, anon, authenticated;
grant execute on function public.record_external_order_postage(uuid,bigint,uuid) to service_role;

-- Overlay preserves every original financial/COGS/payment exclusion.
-- Only remove shipping exclusions when there is an approved external record
-- and no covered Shopify shipping. A later covered Shopify record is a conflict.
create view public.vault_order_external_postage_effective
with (security_invoker = true)
as
select d.order_id,
  case
    when e.order_id is not null and d.shipping_source_state = 'covered' then null::numeric
    when e.order_id is not null then e.amount_pence::numeric / 100
    else d.observed_purchased_label_cost_gbp
  end as effective_shipping_cost_gbp,
  case
    when e.order_id is not null and d.shipping_source_state = 'covered'
      then array_append(d.exclusion_reason_codes, 'shipping_source_conflict'::text)
    when e.order_id is not null and e.shopify_order_id = d.shopify_order_id
      and d.shipping_row_count <= 1
      and (d.shipping_source_state is null or d.shipping_source_state in ('missing', 'awaiting_shopify_cost'))
      then array_remove(array_remove(array_remove(d.exclusion_reason_codes,
        'missing_shipping_label_cost'::text),
        'shipping_label_not_covered'::text),
        'shipping_currency_or_amount_mismatch'::text)
    else d.exclusion_reason_codes
  end as effective_exclusion_reason_codes,
  case when e.order_id is not null then 'manual_external'::text else 'shopify'::text end as shipping_source
from public.vault_shopify_order_operational_contribution_diagnostics d
left join public.vault_external_order_postage e on e.order_id = d.order_id;
revoke all on public.vault_order_external_postage_effective from public, anon, authenticated;
grant select on public.vault_order_external_postage_effective to service_role;

create or replace view public.vault_shopify_verified_order_operational_contributions as
select d.order_id, d.shopify_order_id, d.shopify_created_at, d.order_source_updated_at,
  d.canonical_net_revenue,
  d.resolved_sold_line_cogs_gbp as trusted_net_sold_line_cogs_gbp,
  e.effective_shipping_cost_gbp as observed_purchased_label_cost_gbp,
  d.covered_payment_fees_gbp,
  d.canonical_net_revenue - d.resolved_sold_line_cogs_gbp -
    e.effective_shipping_cost_gbp - d.covered_payment_fees_gbp as estimated_operational_contribution_gbp,
  'current_customer_order_total'::text as revenue_basis,
  'included_unseparated'::text as tax_treatment,
  'unobserved'::text as duties_and_additional_fees_treatment,
  'observed_unreconciled'::text as shipping_label_status,
  'estimated_operational_contribution'::text as classification
from public.vault_shopify_order_operational_contribution_diagnostics d
join public.vault_order_external_postage_effective e on e.order_id = d.order_id
where cardinality(e.effective_exclusion_reason_codes) = 0;
