begin;

create table public.vault_shopify_manual_financial_evidence (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.vault_shopify_orders(id) on delete restrict,
  evidence_type text not null check (evidence_type in ('shipping_cost', 'payment_fee')),
  amount_gbp numeric(14,2) not null check (amount_gbp >= 0),
  reason text not null check (char_length(reason) between 10 and 2000),
  supporting_evidence text not null check (char_length(supporting_evidence) between 3 and 4000),
  recorded_by_operator_id uuid not null references public.vault_operators(id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp(),
  unique (order_id, evidence_type)
);
comment on table public.vault_shopify_manual_financial_evidence is
  'Owner-entered financial evidence for a missing Shopify shipping cost or payment fee. Immutable; never overwrites Shopify source evidence.';
alter table public.vault_shopify_manual_financial_evidence enable row level security;
revoke all on public.vault_shopify_manual_financial_evidence from public, anon, authenticated, service_role;
grant select on public.vault_shopify_manual_financial_evidence to service_role;

create trigger immutable_shopify_manual_financial_evidence before update or delete
  on public.vault_shopify_manual_financial_evidence for each row
  execute function public.reject_shopify_financial_evidence_change_mutation();

create function public.record_shopify_manual_financial_evidence(
  p_order_id uuid, p_evidence_type text, p_amount_gbp numeric,
  p_reason text, p_supporting_evidence text, p_operator_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_id uuid;
begin
  if p_evidence_type not in ('shipping_cost', 'payment_fee') or p_amount_gbp is null or p_amount_gbp < 0
     or p_amount_gbp > 1000000 or scale(p_amount_gbp) > 2
     or p_reason is null or char_length(trim(p_reason)) not between 10 and 2000
     or p_supporting_evidence is null or char_length(trim(p_supporting_evidence)) not between 3 and 4000 then
    raise exception 'Invalid manual financial evidence';
  end if;
  if not exists (select 1 from public.vault_operators where id=p_operator_id and is_active and role='owner') then
    raise exception 'Manual financial evidence requires an active owner';
  end if;
  if not exists (select 1 from public.vault_shopify_orders where id=p_order_id and source='shopify') then
    raise exception 'Shopify order is unavailable';
  end if;
  if p_evidence_type='shipping_cost' and exists (
    select 1 from public.vault_shopify_shipping_costs where order_id=p_order_id and source_state='covered' and label_cost_gbp is not null
  ) then raise exception 'Verified Shopify shipping evidence already exists'; end if;
  if p_evidence_type='payment_fee' and exists (
    select 1 from public.vault_shopify_payment_fee_coverage where order_id=p_order_id and coverage_state='covered'
  ) then raise exception 'Verified Shopify payment-fee evidence already exists'; end if;
  insert into public.vault_shopify_manual_financial_evidence(order_id,evidence_type,amount_gbp,reason,supporting_evidence,recorded_by_operator_id)
  values(p_order_id,p_evidence_type,p_amount_gbp,trim(p_reason),trim(p_supporting_evidence),p_operator_id)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Manual financial evidence already exists for this order and type';
end;
$$;
revoke all on function public.record_shopify_manual_financial_evidence(uuid,text,numeric,text,text,uuid) from public, anon, authenticated;
grant execute on function public.record_shopify_manual_financial_evidence(uuid,text,numeric,text,text,uuid) to service_role;

commit;
