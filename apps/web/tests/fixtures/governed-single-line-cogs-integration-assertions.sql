do $$
declare proposal uuid;
begin
  set local role service_role;
  proposal := public.stage_governed_historical_line_cogs_proposal(
    '93061d97-9d55-467b-ae9d-15c9590b899b', 'eabb625c-4da1-4a30-9f41-b8a1e6f8bec7',
    11.0730, 'Owner confirmed most recently received Exclusive delivery.',
    '00000000-0000-0000-0000-000000000001');
  if proposal is null then raise exception 'expected pending proposal'; end if;
end $$;

do $$
begin
  if (select count(*) from public.vault_governed_historical_line_cogs_proposals) <> 1 then raise exception 'proposal missing'; end if;
  if (select count(*) from public.vault_governed_historical_line_cogs_proposal_audit where event_type='PROPOSED') <> 1 then raise exception 'proposal audit missing'; end if;
  if exists (select 1 from public.vault_stage1_sold_line_cogs_resolutions where order_line_id='93061d97-9d55-467b-ae9d-15c9590b899b') then raise exception 'pending proposal resolved'; end if;
end $$;

do $$
declare proposal uuid;
begin
  select id into proposal from public.vault_governed_historical_line_cogs_proposals;
  set local role service_role;
  begin
    perform public.decide_governed_historical_line_cogs_proposal(proposal,'APPROVED','operator cannot approve','00000000-0000-0000-0000-000000000001');
    raise exception 'non-owner approval was allowed';
  exception when others then
    if position('GOVERNED_HISTORICAL_LINE_COGS_OWNER_APPROVAL_REQUIRED' in sqlerrm)=0 then raise; end if;
  end;
  perform public.decide_governed_historical_line_cogs_proposal(proposal,'APPROVED','Owner approval recorded.','00000000-0000-0000-0000-000000000002');
end $$;

do $$
declare proposal uuid;
begin
  select id into proposal from public.vault_governed_historical_line_cogs_proposals;
  if (select resolved_cogs_gbp from public.vault_stage1_sold_line_cogs_resolutions where order_line_id='93061d97-9d55-467b-ae9d-15c9590b899b') <> 11.0730 then raise exception 'approved proposal did not resolve'; end if;
  if (select round(74.95 - 15.58 - sum(resolved_cogs_gbp) - 4.04 - 2.95, 2) from public.vault_stage1_sold_line_cogs_resolutions where order_line_id='93061d97-9d55-467b-ae9d-15c9590b899b') <> 41.31 then raise exception 'resolver contribution is not 41.31'; end if;
  begin
    update public.vault_governed_historical_line_cogs_proposal_audit set note='mutate' where proposal_id=proposal;
    raise exception 'audit mutation was allowed';
  exception when others then
    if position('GOVERNED_HISTORICAL_LINE_COGS_AUDIT_APPEND_ONLY' in sqlerrm)=0 then raise; end if;
  end;
  begin
    perform public.stage_governed_historical_line_cogs_proposal('93061d97-9d55-467b-ae9d-15c9590b899b','eabb625c-4da1-4a30-9f41-b8a1e6f8bec7',11.0730,'duplicate','00000000-0000-0000-0000-000000000001');
    raise exception 'duplicate or resolver conflict was allowed';
  exception when others then
    if position('GOVERNED_HISTORICAL_LINE_COGS_RESOLVER_CONFLICT' in sqlerrm)=0 then raise; end if;
  end;
  begin
    perform public.stage_governed_historical_line_cogs_proposal('20000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000004',11.0730,'invalid evidence','00000000-0000-0000-0000-000000000001');
    raise exception 'invalid evidence was allowed';
  exception when others then
    if position('GOVERNED_HISTORICAL_LINE_COGS_DELIVERY_NOT_ELIGIBLE' in sqlerrm)=0 then raise; end if;
  end;
  begin
    perform public.stage_governed_historical_line_cogs_proposal('20000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000005',11.0730,'post sale','00000000-0000-0000-0000-000000000001');
    raise exception 'post-sale evidence was allowed';
  exception when others then
    if position('GOVERNED_HISTORICAL_LINE_COGS_POST_SALE_DELIVERY' in sqlerrm)=0 then raise; end if;
  end;
  begin
    perform public.stage_governed_historical_line_cogs_proposal('30000000-0000-0000-0000-000000000003','eabb625c-4da1-4a30-9f41-b8a1e6f8bec7',11.0730,'direct conflict','00000000-0000-0000-0000-000000000001');
    raise exception 'direct COGS conflict was allowed';
  exception when others then
    if position('GOVERNED_HISTORICAL_LINE_COGS_DIRECT_CONFLICT' in sqlerrm)=0 then raise; end if;
  end;
end $$;

do $$
begin
  update public.vault_historical_delivery_cost_batches set validation_status='REVIEW'
  where id='eabb625c-4da1-4a30-9f41-b8a1e6f8bec7';
  if exists (select 1 from public.vault_stage1_sold_line_cogs_resolutions where order_line_id='93061d97-9d55-467b-ae9d-15c9590b899b') then raise exception 'invalidated delivery still resolved'; end if;
  update public.vault_historical_delivery_cost_batches set validation_status='VALID'
  where id='eabb625c-4da1-4a30-9f41-b8a1e6f8bec7';
  if has_table_privilege('service_role','public.vault_governed_historical_line_cogs_proposals','INSERT') then raise exception 'service role has direct proposal insert'; end if;
  if has_table_privilege('authenticated','public.vault_governed_historical_line_cogs_proposals','SELECT') then raise exception 'authenticated has proposal read'; end if;
  if not has_function_privilege('service_role','public.stage_governed_historical_line_cogs_proposal(uuid,uuid,numeric,text,uuid)','EXECUTE') then raise exception 'service role cannot stage'; end if;
  if has_function_privilege('authenticated','public.stage_governed_historical_line_cogs_proposal(uuid,uuid,numeric,text,uuid)','EXECUTE') then raise exception 'authenticated can stage'; end if;
  if round(74.95 - 15.58 - 11.0730 - 4.04 - 2.95, 2) <> 41.31 then raise exception 'preview contribution is not 41.31'; end if;
end $$;
