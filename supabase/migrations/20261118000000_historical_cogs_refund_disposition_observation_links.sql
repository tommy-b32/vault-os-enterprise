-- Forward-only multi-observation evidence for inactive historical COGS refund dispositions.
begin;

do $$
begin
  if exists (select 1 from public.vault_historical_cogs_refund_dispositions) then
    raise exception 'HISTORICAL_COGS_REFUND_DISPOSITION_LINK_MIGRATION_REQUIRES_EXPLICIT_EXISTING_RECORD_REVIEW';
  end if;
end;
$$;

create table public.vault_historical_cogs_refund_disposition_observation_links (
  id uuid primary key default gen_random_uuid(),
  disposition_id uuid not null references public.vault_historical_cogs_refund_dispositions(id) on delete restrict,
  refund_line_observation_id uuid not null references public.vault_shopify_refund_line_observations(id) on delete restrict,
  shopify_order_id text not null check (length(trim(shopify_order_id)) > 0),
  shopify_refund_id text not null check (length(trim(shopify_refund_id)) > 0),
  shopify_refund_line_item_id text not null check (length(trim(shopify_refund_line_item_id)) > 0),
  shopify_line_item_id text,
  refund_source_updated_at timestamptz not null,
  refunded_quantity integer not null check (refunded_quantity > 0),
  restocked boolean not null check (restocked),
  unique (disposition_id, refund_line_observation_id)
);

create trigger historical_cogs_refund_disposition_observation_link_immutable
before update or delete on public.vault_historical_cogs_refund_disposition_observation_links
for each row execute function public.reject_historical_cogs_evidence_mutation();

alter table public.vault_historical_cogs_refund_disposition_observation_links enable row level security;
revoke all on public.vault_historical_cogs_refund_disposition_observation_links from public, anon, authenticated, service_role;
grant select on public.vault_historical_cogs_refund_disposition_observation_links to service_role;

revoke execute on function public.record_exclusive_tee_historical_cogs_refund_disposition(uuid,uuid,uuid,text,text,uuid) from service_role;

create function public.record_exclusive_tee_historical_cogs_refund_disposition(
  p_draft_policy_version_id uuid,
  p_subject_order_line_id uuid,
  p_refund_line_observation_ids uuid[],
  p_disposition text,
  p_owner_attestation text,
  p_actor_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_existing public.vault_historical_cogs_refund_dispositions%rowtype; v_subject record; v_primary record; v_id uuid; v_all_count integer; v_selected_count integer;
begin
  perform public.assert_historical_cogs_policy_owner(p_actor_id);
  if p_disposition not in ('retained_sale','returned_restocked') or nullif(trim(p_owner_attestation),'') is null
    or cardinality(p_refund_line_observation_ids) is null or cardinality(p_refund_line_observation_ids) < 1
    or (select count(distinct x) from unnest(p_refund_line_observation_ids) x) <> cardinality(p_refund_line_observation_ids) then
    raise exception 'HISTORICAL_COGS_REFUND_DISPOSITION_INVALID';
  end if;
  if not exists (
    select 1 from public.vault_historical_cogs_policy_versions v
    join public.vault_historical_cogs_policies p on p.id=v.policy_id and p.merchandise_class_id='exclusive_tee'
    where v.id=p_draft_policy_version_id and v.status='draft'
  ) then raise exception 'HISTORICAL_COGS_REFUND_DISPOSITION_DRAFT_INVALID'; end if;
  select l.id,o.shopify_order_id,l.shopify_line_item_id,l.refunded_quantity into v_subject
    from public.vault_shopify_order_lines l join public.vault_shopify_orders o on o.id=l.order_id and o.cancelled_at is null
    join public.vault_variants v on v.source='shopify' and v.source_variant_id=l.shopify_variant_id
    join public.vault_historical_merchandise_class_memberships m on m.product_id=v.product_id and m.merchandise_class_id='exclusive_tee'
      and (o.shopify_created_at at time zone 'Europe/London')::date between m.effective_from and m.effective_through
    where l.id=p_subject_order_line_id and l.source='shopify';
  if not found then raise exception 'HISTORICAL_COGS_REFUND_DISPOSITION_SUBJECT_INVALID'; end if;
  select count(*) into v_all_count from public.vault_shopify_refund_line_observations
    where source='shopify' and evidence_mode='historical' and currency='GBP' and shopify_order_id=v_subject.shopify_order_id and quantity>0;
  select count(*) into v_selected_count from public.vault_shopify_refund_line_observations
    where id=any(p_refund_line_observation_ids) and source='shopify' and evidence_mode='historical' and currency='GBP'
      and shopify_order_id=v_subject.shopify_order_id and quantity>0 and restocked;
  if v_all_count <> cardinality(p_refund_line_observation_ids) or v_selected_count <> cardinality(p_refund_line_observation_ids) then
    raise exception 'HISTORICAL_COGS_REFUND_DISPOSITION_EVIDENCE_SET_INVALID';
  end if;
  if p_disposition='retained_sale' then
    if v_subject.refunded_quantity <> 0 or exists(select 1 from public.vault_shopify_refund_line_observations where id=any(p_refund_line_observation_ids) and (shopify_line_item_id is null or shopify_line_item_id=v_subject.shopify_line_item_id)) then
      raise exception 'HISTORICAL_COGS_RETAINED_SALE_EVIDENCE_INVALID';
    end if;
  else
    if cardinality(p_refund_line_observation_ids) <> 1 or not exists(select 1 from public.vault_shopify_refund_line_observations where id=p_refund_line_observation_ids[1] and shopify_line_item_id=v_subject.shopify_line_item_id and quantity=v_subject.refunded_quantity) then
      raise exception 'HISTORICAL_COGS_RETURNED_RESTOCKED_EVIDENCE_INVALID';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtext(p_draft_policy_version_id::text || ':' || p_subject_order_line_id::text));
  select * into v_existing from public.vault_historical_cogs_refund_dispositions where draft_policy_version_id=p_draft_policy_version_id and subject_order_line_id=p_subject_order_line_id;
  if found then
    if v_existing.disposition=p_disposition and v_existing.owner_attestation=p_owner_attestation
      and not exists ((select refund_line_observation_id from public.vault_historical_cogs_refund_disposition_observation_links where disposition_id=v_existing.id) except (select unnest(p_refund_line_observation_ids)))
      and not exists ((select unnest(p_refund_line_observation_ids)) except (select refund_line_observation_id from public.vault_historical_cogs_refund_disposition_observation_links where disposition_id=v_existing.id)) then return v_existing.id; end if;
    raise exception 'HISTORICAL_COGS_REFUND_DISPOSITION_CONFLICT';
  end if;
  select id,shopify_refund_id,shopify_refund_line_item_id,shopify_line_item_id,refund_source_updated_at,quantity,restocked into v_primary from public.vault_shopify_refund_line_observations where id=any(p_refund_line_observation_ids) order by id limit 1;
  insert into public.vault_historical_cogs_refund_dispositions(draft_policy_version_id,subject_order_line_id,refund_line_observation_id,disposition,subject_shopify_order_id,subject_shopify_line_item_id,observed_shopify_refund_id,observed_shopify_refund_line_item_id,observed_shopify_line_item_id,observed_refund_source_updated_at,observed_refund_quantity,observed_restocked,evidence_provenance,owner_attestation,attested_by_operator_id)
  values(p_draft_policy_version_id,p_subject_order_line_id,v_primary.id,p_disposition,v_subject.shopify_order_id,v_subject.shopify_line_item_id,v_primary.shopify_refund_id,v_primary.shopify_refund_line_item_id,v_primary.shopify_line_item_id,v_primary.refund_source_updated_at,v_primary.quantity,v_primary.restocked,'shopify_refund_line_observation_with_owner_attestation',p_owner_attestation,p_actor_id) returning id into v_id;
  insert into public.vault_historical_cogs_refund_disposition_observation_links(disposition_id,refund_line_observation_id,shopify_order_id,shopify_refund_id,shopify_refund_line_item_id,shopify_line_item_id,refund_source_updated_at,refunded_quantity,restocked)
    select v_id,id,shopify_order_id,shopify_refund_id,shopify_refund_line_item_id,shopify_line_item_id,refund_source_updated_at,quantity,restocked from public.vault_shopify_refund_line_observations where id=any(p_refund_line_observation_ids) order by id;
  return v_id;
end;
$$;

revoke all on function public.record_exclusive_tee_historical_cogs_refund_disposition(uuid,uuid,uuid[],text,text,uuid) from public, anon, authenticated;
grant execute on function public.record_exclusive_tee_historical_cogs_refund_disposition(uuid,uuid,uuid[],text,text,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
