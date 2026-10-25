-- Inactive, immutable evidence assembly only. It does not activate or resolve COGS.
begin;

alter table public.vault_historical_cogs_policy_versions
  drop constraint vault_historical_cogs_policy_versions_status_check;
alter table public.vault_historical_cogs_policy_versions
  add constraint vault_historical_cogs_policy_versions_status_check
  check (status in ('governed_simulation_foundation','draft'));
alter table public.vault_historical_cogs_policy_versions add column evidence_set_fingerprint text;
create unique index vault_historical_cogs_policy_versions_draft_evidence_set_unique
  on public.vault_historical_cogs_policy_versions(policy_id,evidence_set_fingerprint)
  where evidence_set_fingerprint is not null;

do $$
declare v_source public.vault_historical_cogs_policy_versions%rowtype; v_probe uuid; v_visible boolean;
begin
  select * into v_source from public.vault_historical_cogs_policy_versions order by created_at,id limit 1;
  if not found then return; end if;
  begin
    insert into public.vault_historical_cogs_policy_versions(policy_id,version_number,methodology,evidence_method,sale_period_from,sale_period_through,membership_provenance,status)
    values(v_source.policy_id,(select max(version_number)+1 from public.vault_historical_cogs_policy_versions where policy_id=v_source.policy_id),v_source.methodology,v_source.evidence_method,v_source.sale_period_from,v_source.sale_period_through,v_source.membership_provenance,'draft') returning id into v_probe;
    select exists(select 1 from public.vault_historical_policy_derived_cogs_line_attributions where policy_version_id=v_probe) into v_visible;
    if v_visible then raise exception 'Historical attribution must exclude draft policy versions'; end if;
    raise exception 'DRAFT_ATTRIBUTION_PROBE_ROLLBACK';
  exception when raise_exception then
    if sqlerrm <> 'DRAFT_ATTRIBUTION_PROBE_ROLLBACK' then raise; end if;
  end;
end $$;

create table public.vault_historical_cogs_policy_governed_delivery_evidence (
  policy_version_id uuid not null references public.vault_historical_cogs_policy_versions(id) on delete restrict,
  delivery_batch_id uuid not null references public.vault_historical_delivery_cost_batches(id) on delete restrict,
  approval_revision bigint not null check (approval_revision > 0),
  linked_by_operator_id uuid not null references public.vault_operators(id) on delete restrict,
  linked_at timestamptz not null default clock_timestamp(),
  evidence_provenance text not null default 'governed_historical_delivery' check (evidence_provenance='governed_historical_delivery'),
  primary key (policy_version_id, delivery_batch_id)
);
create trigger historical_policy_governed_delivery_link_immutable before update or delete on public.vault_historical_cogs_policy_governed_delivery_evidence for each row execute function public.reject_historical_cogs_evidence_mutation();
alter table public.vault_historical_cogs_policy_governed_delivery_evidence enable row level security;
revoke all on public.vault_historical_cogs_policy_governed_delivery_evidence from public, anon, authenticated, service_role;
grant select on public.vault_historical_cogs_policy_governed_delivery_evidence to service_role;

create function public.create_exclusive_tee_historical_cogs_draft(
  p_legacy_batch_ids uuid[], p_governed_delivery_batch_ids uuid[], p_actor_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_policy uuid; v_source public.vault_historical_cogs_policy_versions%rowtype; v_version uuid; v_legacy_count integer; v_governed_count integer; v_fingerprint text;
begin
  perform public.assert_governed_historical_delivery_operator(p_actor_id);
  if cardinality(p_legacy_batch_ids)<>6 or cardinality(p_governed_delivery_batch_ids)<>2
    or (select count(distinct x) from unnest(p_legacy_batch_ids) x)<>6
    or (select count(distinct x) from unnest(p_governed_delivery_batch_ids) x)<>2 then raise exception 'HISTORICAL_COGS_DRAFT_EVIDENCE_SET_INVALID'; end if;
  select id into v_policy from public.vault_historical_cogs_policies where merchandise_class_id='exclusive_tee' and status='governed_simulation_foundation';
  if v_policy is null then raise exception 'EXCLUSIVE_TEE_POLICY_NOT_FOUND'; end if;
  v_fingerprint := md5(array_to_string(array(select unnest(p_legacy_batch_ids) order by 1),',')||'|'||array_to_string(array(select unnest(p_governed_delivery_batch_ids) order by 1),','));
  select * into v_source from public.vault_historical_cogs_policy_versions where policy_id=v_policy and status='governed_simulation_foundation' order by version_number desc limit 1;
  select count(*) into v_legacy_count from public.vault_historical_supplier_batch_evidence b where b.id=any(p_legacy_batch_ids) and b.merchandise_class_id='exclusive_tee' and b.evidence_status='valid_received' and b.received_date is not null and b.landed_total_gbp>=0;
  if v_legacy_count<>6 then raise exception 'HISTORICAL_COGS_DRAFT_LEGACY_EVIDENCE_INVALID'; end if;
  select count(*) into v_governed_count from public.vault_historical_delivery_cost_batches b join public.vault_suppliers s on s.id=b.supplier_id where b.id=any(p_governed_delivery_batch_ids) and b.merchandise_class_id='exclusive_tee' and s.supplier_name='Exclusive' and b.receipt_status='RECEIVED' and b.validation_status='VALID' and b.approval_status='APPROVED' and b.revision>=2 and b.received_at is not null and b.landed_cost_gbp>=0 and nullif(trim(b.source_document_reference),'') is not null and exists(select 1 from public.vault_historical_delivery_cost_batch_approvals a where a.batch_id=b.id);
  if v_governed_count<>2 then raise exception 'HISTORICAL_COGS_DRAFT_GOVERNED_EVIDENCE_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtext(v_policy::text));
  select id into v_version from public.vault_historical_cogs_policy_versions where policy_id=v_policy and evidence_set_fingerprint=v_fingerprint;
  if found then return v_version; end if;
  begin
    insert into public.vault_historical_cogs_policy_versions(policy_id,version_number,methodology,evidence_method,sale_period_from,sale_period_through,membership_provenance,status,evidence_set_fingerprint)
    values(v_policy,(select max(version_number)+1 from public.vault_historical_cogs_policy_versions where policy_id=v_policy),v_source.methodology,v_source.evidence_method,v_source.sale_period_from,v_source.sale_period_through,v_source.membership_provenance,'draft',v_fingerprint) returning id into v_version;
  exception when unique_violation then
    select id into v_version from public.vault_historical_cogs_policy_versions where policy_id=v_policy and evidence_set_fingerprint=v_fingerprint;
    if found then return v_version; end if;
    raise;
  end;
  insert into public.vault_historical_cogs_policy_batch_evidence(policy_version_id,batch_evidence_id) select v_version,id from public.vault_historical_supplier_batch_evidence where id=any(p_legacy_batch_ids);
  insert into public.vault_historical_cogs_policy_governed_delivery_evidence(policy_version_id,delivery_batch_id,approval_revision,linked_by_operator_id) select v_version,id,revision,p_actor_id from public.vault_historical_delivery_cost_batches where id=any(p_governed_delivery_batch_ids);
  return v_version;
end $$;
revoke all on function public.create_exclusive_tee_historical_cogs_draft(uuid[],uuid[],uuid) from public, anon, authenticated;
grant execute on function public.create_exclusive_tee_historical_cogs_draft(uuid[],uuid[],uuid) to service_role;

create view public.vault_historical_cogs_policy_evidence_review with (security_barrier=true,security_invoker=true) as
select l.policy_version_id,'legacy_supplier_batch'::text evidence_kind,b.id evidence_id,b.received_date receipt_date,b.quantity,b.landed_total_gbp landed_cost_gbp,b.documentary_provenance provenance from public.vault_historical_cogs_policy_batch_evidence l join public.vault_historical_supplier_batch_evidence b on b.id=l.batch_evidence_id
union all
select l.policy_version_id,l.evidence_provenance,b.id,b.received_at::date,b.received_quantity,b.landed_cost_gbp,b.source_document_reference from public.vault_historical_cogs_policy_governed_delivery_evidence l join public.vault_historical_delivery_cost_batches b on b.id=l.delivery_batch_id;
revoke all on public.vault_historical_cogs_policy_evidence_review from public, anon, authenticated;
grant select on public.vault_historical_cogs_policy_evidence_review to service_role;
notify pgrst,'reload schema';
commit;
