-- Owner-attested disposition of immutable Shopify refund evidence for inactive historical COGS drafts only.
-- This table is evidence for a future preview; it has no inventory, attribution, or policy-activation side effects.
begin;

create table public.vault_historical_cogs_refund_dispositions (
  id uuid primary key default gen_random_uuid(),
  draft_policy_version_id uuid not null references public.vault_historical_cogs_policy_versions(id) on delete restrict,
  subject_order_line_id uuid not null references public.vault_shopify_order_lines(id) on delete restrict,
  refund_line_observation_id uuid not null references public.vault_shopify_refund_line_observations(id) on delete restrict,
  disposition text not null check (disposition in ('retained_sale','returned_restocked')),
  subject_shopify_order_id text not null check (length(trim(subject_shopify_order_id)) > 0),
  subject_shopify_line_item_id text not null check (length(trim(subject_shopify_line_item_id)) > 0),
  observed_shopify_refund_id text not null check (length(trim(observed_shopify_refund_id)) > 0),
  observed_shopify_refund_line_item_id text not null check (length(trim(observed_shopify_refund_line_item_id)) > 0),
  observed_shopify_line_item_id text,
  observed_refund_source_updated_at timestamptz not null,
  observed_refund_quantity integer not null check (observed_refund_quantity > 0),
  observed_restocked boolean not null,
  evidence_provenance text not null check (evidence_provenance = 'shopify_refund_line_observation_with_owner_attestation'),
  owner_attestation text not null check (length(trim(owner_attestation)) > 0),
  attested_by_operator_id uuid not null references public.vault_operators(id) on delete restrict,
  attested_at timestamptz not null default clock_timestamp(),
  unique (draft_policy_version_id, subject_order_line_id)
);

create trigger historical_cogs_refund_disposition_immutable
before update or delete on public.vault_historical_cogs_refund_dispositions
for each row execute function public.reject_historical_cogs_evidence_mutation();

alter table public.vault_historical_cogs_refund_dispositions enable row level security;
revoke all on public.vault_historical_cogs_refund_dispositions from public, anon, authenticated, service_role;
grant select on public.vault_historical_cogs_refund_dispositions to service_role;

create function public.record_exclusive_tee_historical_cogs_refund_disposition(
  p_draft_policy_version_id uuid,
  p_subject_order_line_id uuid,
  p_refund_line_observation_id uuid,
  p_disposition text,
  p_owner_attestation text,
  p_actor_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_existing public.vault_historical_cogs_refund_dispositions%rowtype; v_subject record; v_observation record; v_id uuid;
begin
  perform public.assert_historical_cogs_policy_owner(p_actor_id);
  if p_disposition not in ('retained_sale','returned_restocked') or nullif(trim(p_owner_attestation),'') is null then
    raise exception 'HISTORICAL_COGS_REFUND_DISPOSITION_INVALID';
  end if;
  if not exists (
    select 1 from public.vault_historical_cogs_policy_versions v
    join public.vault_historical_cogs_policies p on p.id=v.policy_id and p.merchandise_class_id='exclusive_tee'
    where v.id=p_draft_policy_version_id and v.status='draft'
  ) then raise exception 'HISTORICAL_COGS_REFUND_DISPOSITION_DRAFT_INVALID'; end if;
  select l.id, o.shopify_order_id, l.shopify_line_item_id, l.refunded_quantity, o.shopify_created_at
    into v_subject
    from public.vault_shopify_order_lines l
    join public.vault_shopify_orders o on o.id=l.order_id and o.cancelled_at is null
    join public.vault_variants v on v.source='shopify' and v.source_variant_id=l.shopify_variant_id
    join public.vault_historical_merchandise_class_memberships m on m.product_id=v.product_id and m.merchandise_class_id='exclusive_tee'
      and (o.shopify_created_at at time zone 'Europe/London')::date between m.effective_from and m.effective_through
    where l.id=p_subject_order_line_id and l.source='shopify';
  if not found then raise exception 'HISTORICAL_COGS_REFUND_DISPOSITION_SUBJECT_INVALID'; end if;
  select id, shopify_order_id, shopify_refund_id, shopify_refund_line_item_id, shopify_line_item_id, refund_source_updated_at, quantity, restocked
    into v_observation
    from public.vault_shopify_refund_line_observations
    where id=p_refund_line_observation_id and source='shopify' and evidence_mode='historical' and currency='GBP' and quantity>0;
  if not found or v_observation.shopify_order_id <> v_subject.shopify_order_id then
    raise exception 'HISTORICAL_COGS_REFUND_DISPOSITION_EVIDENCE_INVALID';
  end if;
  if p_disposition='retained_sale' then
    if v_subject.refunded_quantity <> 0 or v_observation.shopify_line_item_id is null or v_observation.shopify_line_item_id = v_subject.shopify_line_item_id or not v_observation.restocked then
      raise exception 'HISTORICAL_COGS_RETAINED_SALE_EVIDENCE_INVALID';
    end if;
  else
    if v_observation.shopify_line_item_id is distinct from v_subject.shopify_line_item_id or v_subject.refunded_quantity <> v_observation.quantity or not v_observation.restocked then
      raise exception 'HISTORICAL_COGS_RETURNED_RESTOCKED_EVIDENCE_INVALID';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtext(p_draft_policy_version_id::text || ':' || p_subject_order_line_id::text));
  select * into v_existing from public.vault_historical_cogs_refund_dispositions where draft_policy_version_id=p_draft_policy_version_id and subject_order_line_id=p_subject_order_line_id;
  if found then
    if v_existing.refund_line_observation_id=p_refund_line_observation_id and v_existing.disposition=p_disposition and v_existing.owner_attestation=p_owner_attestation then return v_existing.id; end if;
    raise exception 'HISTORICAL_COGS_REFUND_DISPOSITION_CONFLICT';
  end if;
  insert into public.vault_historical_cogs_refund_dispositions(
    draft_policy_version_id,subject_order_line_id,refund_line_observation_id,disposition,subject_shopify_order_id,subject_shopify_line_item_id,
    observed_shopify_refund_id,observed_shopify_refund_line_item_id,observed_shopify_line_item_id,observed_refund_source_updated_at,observed_refund_quantity,observed_restocked,
    evidence_provenance,owner_attestation,attested_by_operator_id
  ) values (
    p_draft_policy_version_id,p_subject_order_line_id,p_refund_line_observation_id,p_disposition,v_subject.shopify_order_id,v_subject.shopify_line_item_id,
    v_observation.shopify_refund_id,v_observation.shopify_refund_line_item_id,v_observation.shopify_line_item_id,v_observation.refund_source_updated_at,v_observation.quantity,v_observation.restocked,
    'shopify_refund_line_observation_with_owner_attestation',p_owner_attestation,p_actor_id
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_exclusive_tee_historical_cogs_refund_disposition(uuid,uuid,uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.record_exclusive_tee_historical_cogs_refund_disposition(uuid,uuid,uuid,text,text,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
