-- Immutable server-computed preview snapshots bind review and approval to one complete inactive draft.
begin;

create table public.vault_historical_cogs_preview_snapshots (
  id uuid primary key default gen_random_uuid(),
  draft_policy_version_id uuid not null references public.vault_historical_cogs_policy_versions(id) on delete restrict,
  eligibility_rule text not null check (eligibility_rule='date_only_receipts_eligible_following_europe_london_calendar_day_v1'),
  source_snapshot_sha256 text not null check (source_snapshot_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  result_sha256 text not null check (result_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  engine_sha256 text not null check (engine_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  per_line_sha256 text not null check (per_line_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  source_evidence jsonb not null check (jsonb_typeof(source_evidence)='object'),
  calculated_line_count integer not null check (calculated_line_count>=0),
  returned_restocked_line_count integer not null check (returned_restocked_line_count>=0),
  unresolved_line_count integer not null check (unresolved_line_count=0),
  same_day_receipt_warning_count integer not null check (same_day_receipt_warning_count>=0),
  simulated_cogs_gbp numeric not null check (simulated_cogs_gbp>=0),
  existing_policy_cogs_gbp numeric not null check (existing_policy_cogs_gbp>=0),
  closing_inventory_units integer not null check (closing_inventory_units>=0),
  closing_inventory_landed_gbp numeric not null check (closing_inventory_landed_gbp>=0),
  created_by_operator_id uuid not null references public.vault_operators(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  unique(draft_policy_version_id,source_snapshot_sha256,result_sha256,engine_sha256,per_line_sha256)
);
create table public.vault_historical_cogs_preview_lines (
  preview_id uuid not null references public.vault_historical_cogs_preview_snapshots(id) on delete restrict,
  order_line_id uuid not null references public.vault_shopify_order_lines(id) on delete restrict,
  calculation_status text not null check (calculation_status in ('CALCULATED','CALCULATED_WITH_WARNING','EXCLUDED_RETURNED_RESTOCKED')),
  simulated_cogs_gbp numeric,
  existing_policy_cogs_gbp numeric,
  warning_codes jsonb not null check (jsonb_typeof(warning_codes)='array'),
  receipt_evidence jsonb not null check (jsonb_typeof(receipt_evidence)='array'),
  stock_before_units integer not null check(stock_before_units>=0), stock_after_units integer not null check(stock_after_units>=0),
  stock_before_landed_gbp numeric not null check(stock_before_landed_gbp>=0), stock_after_landed_gbp numeric not null check(stock_after_landed_gbp>=0),
  primary key(preview_id,order_line_id),
  check ((calculation_status='EXCLUDED_RETURNED_RESTOCKED' and simulated_cogs_gbp is null) or (calculation_status in ('CALCULATED','CALCULATED_WITH_WARNING') and simulated_cogs_gbp is not null))
);
create trigger historical_cogs_preview_snapshot_immutable before update or delete on public.vault_historical_cogs_preview_snapshots for each row execute function public.reject_historical_cogs_evidence_mutation();
create trigger historical_cogs_preview_line_immutable before update or delete on public.vault_historical_cogs_preview_lines for each row execute function public.reject_historical_cogs_evidence_mutation();
alter table public.vault_historical_cogs_preview_snapshots enable row level security;
alter table public.vault_historical_cogs_preview_lines enable row level security;
revoke all on public.vault_historical_cogs_preview_snapshots,public.vault_historical_cogs_preview_lines from public,anon,authenticated,service_role;
grant select on public.vault_historical_cogs_preview_snapshots,public.vault_historical_cogs_preview_lines to service_role;

create function public.record_exclusive_tee_historical_cogs_preview(
  p_draft_policy_version_id uuid,p_source_snapshot_sha256 text,p_result_sha256 text,p_engine_sha256 text,p_per_line_sha256 text,p_source_evidence jsonb,p_lines jsonb,
  p_calculated_line_count integer,p_returned_restocked_line_count integer,p_same_day_receipt_warning_count integer,p_simulated_cogs_gbp numeric,p_existing_policy_cogs_gbp numeric,p_closing_inventory_units integer,p_closing_inventory_landed_gbp numeric,p_actor_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_status text; v_legacy integer; v_governed integer; v_line_count integer;
begin
  perform public.assert_governed_historical_delivery_operator(p_actor_id);
  if p_source_snapshot_sha256 !~ '^[0-9A-Fa-f]{64}$' or p_result_sha256 !~ '^[0-9A-Fa-f]{64}$' or p_engine_sha256 !~ '^[0-9A-Fa-f]{64}$' or p_per_line_sha256 !~ '^[0-9A-Fa-f]{64}$'
    or jsonb_typeof(p_source_evidence)<>'object' or jsonb_typeof(p_lines)<>'array' or p_calculated_line_count<0 or p_returned_restocked_line_count<0 or p_same_day_receipt_warning_count<0 or p_simulated_cogs_gbp<0 or p_existing_policy_cogs_gbp<0 or p_closing_inventory_units<0 or p_closing_inventory_landed_gbp<0 then raise exception 'HISTORICAL_COGS_PREVIEW_INVALID'; end if;
  select status into v_status from public.vault_historical_cogs_policy_versions where id=p_draft_policy_version_id for share;
  if v_status is distinct from 'draft' then raise exception 'HISTORICAL_COGS_PREVIEW_DRAFT_INVALID'; end if;
  select count(*) into v_legacy from public.vault_historical_cogs_policy_batch_evidence where policy_version_id=p_draft_policy_version_id;
  select count(*) into v_governed from public.vault_historical_cogs_policy_governed_delivery_evidence where policy_version_id=p_draft_policy_version_id;
  select count(*) into v_line_count from jsonb_array_elements(p_lines);
  if v_legacy<>6 or v_governed<>2 or v_line_count<>p_calculated_line_count+p_returned_restocked_line_count then raise exception 'HISTORICAL_COGS_PREVIEW_EVIDENCE_OR_LINE_COUNT_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtext(p_draft_policy_version_id::text));
  select id into v_id from public.vault_historical_cogs_preview_snapshots where draft_policy_version_id=p_draft_policy_version_id and source_snapshot_sha256=p_source_snapshot_sha256 and result_sha256=p_result_sha256 and engine_sha256=p_engine_sha256 and per_line_sha256=p_per_line_sha256;
  if found then return v_id; end if;
  insert into public.vault_historical_cogs_preview_snapshots(draft_policy_version_id,eligibility_rule,source_snapshot_sha256,result_sha256,engine_sha256,per_line_sha256,source_evidence,calculated_line_count,returned_restocked_line_count,unresolved_line_count,same_day_receipt_warning_count,simulated_cogs_gbp,existing_policy_cogs_gbp,closing_inventory_units,closing_inventory_landed_gbp,created_by_operator_id) values(p_draft_policy_version_id,'date_only_receipts_eligible_following_europe_london_calendar_day_v1',p_source_snapshot_sha256,p_result_sha256,p_engine_sha256,p_per_line_sha256,p_source_evidence,p_calculated_line_count,p_returned_restocked_line_count,0,p_same_day_receipt_warning_count,p_simulated_cogs_gbp,p_existing_policy_cogs_gbp,p_closing_inventory_units,p_closing_inventory_landed_gbp,p_actor_id) returning id into v_id;
  insert into public.vault_historical_cogs_preview_lines(preview_id,order_line_id,calculation_status,simulated_cogs_gbp,existing_policy_cogs_gbp,warning_codes,receipt_evidence,stock_before_units,stock_after_units,stock_before_landed_gbp,stock_after_landed_gbp)
    select v_id,(x->>'id')::uuid,x->>'status',nullif(x->>'simulatedCogsGbp','')::numeric,nullif(x->>'existingPolicyCogsGbp','')::numeric,coalesce(x->'flags','[]'),coalesce(x->'receiptEvidence','[]'),(x->'stockBefore'->>'units')::integer,(x->'stockAfter'->>'units')::integer,(x->'stockBefore'->>'landedGbp')::numeric,(x->'stockAfter'->>'landedGbp')::numeric from jsonb_array_elements(p_lines) x;
  return v_id;
end $$;

create function public.create_exclusive_tee_historical_cogs_simulation_review_from_preview(p_preview_id uuid,p_actor_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.vault_historical_cogs_preview_snapshots%rowtype; v_id uuid;
begin
 perform public.assert_governed_historical_delivery_operator(p_actor_id); select * into p from public.vault_historical_cogs_preview_snapshots where id=p_preview_id for share; if not found or p.unresolved_line_count<>0 or not exists(select 1 from public.vault_historical_cogs_policy_versions where id=p.draft_policy_version_id and status='draft') then raise exception 'HISTORICAL_COGS_PREVIEW_NOT_COMPLETE_OR_STALE'; end if;
 select id into v_id from public.vault_historical_cogs_simulation_reviews where draft_policy_version_id=p.draft_policy_version_id and simulation_input_sha256=p.source_snapshot_sha256 and simulation_resolution_sha256=p.result_sha256 and simulator_code_sha256=p.engine_sha256 and per_line_report_sha256=p.per_line_sha256; if found then return v_id; end if;
 select public.create_exclusive_tee_historical_cogs_simulation_review(p.draft_policy_version_id,p.eligibility_rule,p.source_snapshot_sha256,p.result_sha256,p.engine_sha256,p.per_line_sha256,p.calculated_line_count,p.returned_restocked_line_count,p.same_day_receipt_warning_count,jsonb_build_object('unresolved',0,'preview_id',p.id),p.simulated_cogs_gbp,p.existing_policy_cogs_gbp,p.closing_inventory_units,p.closing_inventory_landed_gbp,p_actor_id) into v_id; return v_id;
end $$;

create function public.approve_exclusive_tee_historical_cogs_simulation_review_from_preview(p_review_id uuid,p_preview_id uuid,p_approval_note text,p_actor_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.vault_historical_cogs_preview_snapshots%rowtype; r public.vault_historical_cogs_simulation_reviews%rowtype; v_id uuid;
begin
 perform public.assert_historical_cogs_policy_owner(p_actor_id); select * into p from public.vault_historical_cogs_preview_snapshots where id=p_preview_id for share; if not found then raise exception 'HISTORICAL_COGS_PREVIEW_REVIEW_BINDING_MISMATCH'; end if;
 select * into r from public.vault_historical_cogs_simulation_reviews where id=p_review_id for share; if not found or p.unresolved_line_count<>0 or r.draft_policy_version_id<>p.draft_policy_version_id or r.simulation_input_sha256<>p.source_snapshot_sha256 or r.simulation_resolution_sha256<>p.result_sha256 or r.simulator_code_sha256<>p.engine_sha256 or r.per_line_report_sha256<>p.per_line_sha256 then raise exception 'HISTORICAL_COGS_PREVIEW_REVIEW_BINDING_MISMATCH'; end if;
 select public.approve_exclusive_tee_historical_cogs_simulation_review(r.id,r.policy_rule,r.simulation_input_sha256,r.simulation_resolution_sha256,r.simulator_code_sha256,r.per_line_report_sha256,p_approval_note,p_actor_id) into v_id; return v_id;
end $$;
revoke all on function public.record_exclusive_tee_historical_cogs_preview(uuid,text,text,text,text,jsonb,jsonb,integer,integer,integer,numeric,numeric,integer,numeric,uuid),public.create_exclusive_tee_historical_cogs_simulation_review_from_preview(uuid,uuid),public.approve_exclusive_tee_historical_cogs_simulation_review_from_preview(uuid,uuid,text,uuid) from public,anon,authenticated;
revoke execute on function public.create_exclusive_tee_historical_cogs_simulation_review(uuid,text,text,text,text,text,integer,integer,integer,jsonb,numeric,numeric,integer,numeric,uuid),public.approve_exclusive_tee_historical_cogs_simulation_review(uuid,text,text,text,text,text,text,uuid) from service_role;
grant execute on function public.record_exclusive_tee_historical_cogs_preview(uuid,text,text,text,text,jsonb,jsonb,integer,integer,integer,numeric,numeric,integer,numeric,uuid),public.create_exclusive_tee_historical_cogs_simulation_review_from_preview(uuid,uuid),public.approve_exclusive_tee_historical_cogs_simulation_review_from_preview(uuid,uuid,text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
