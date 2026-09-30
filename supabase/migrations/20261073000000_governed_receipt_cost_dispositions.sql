create table public.vault_purchase_order_receipt_cost_dispositions (id uuid primary key default gen_random_uuid(),purchase_order_id uuid not null references public.vault_purchase_orders(id),purchase_order_line_id uuid not null references public.vault_purchase_order_lines(id),receipt_id uuid not null references public.vault_purchase_order_receipts(id),receipt_allocation_id uuid not null references public.vault_purchase_order_receipt_allocations(id),purchase_order_line_size_allocation_id uuid not null references public.vault_purchase_order_line_size_allocations(id),governed_gbp_allocation_run_id uuid not null references public.vault_purchase_order_gbp_landed_cost_allocation_runs(id),governed_gbp_allocation_line_id uuid not null references public.vault_purchase_order_gbp_landed_cost_allocation_lines(id),disposition_type text not null check(disposition_type in('sellable_inventory','non_sellable_writeoff')),quantity integer not null check(quantity>0),allocated_gbp_minor_units bigint not null check(allocated_gbp_minor_units>=0),allocation_method text not null default 'ordered_unit_rank_cumulative_floor',allocation_method_version text not null default 'v1',provenance_key text not null unique,created_at timestamptz not null default now(),unique(receipt_allocation_id,disposition_type));
alter table public.vault_purchase_order_receipt_cost_dispositions enable row level security;
create trigger vault_purchase_order_receipt_cost_dispositions_immutable before update or delete on public.vault_purchase_order_receipt_cost_dispositions for each row execute function public.reject_purchase_cost_evidence_mutation();
revoke all on public.vault_purchase_order_receipt_cost_dispositions from public,anon,authenticated,service_role; grant select,insert on public.vault_purchase_order_receipt_cost_dispositions to service_role;
create policy vault_purchase_order_receipt_cost_dispositions_service_role_select on public.vault_purchase_order_receipt_cost_dispositions for select to service_role using (true);
create policy vault_purchase_order_receipt_cost_dispositions_service_role_insert on public.vault_purchase_order_receipt_cost_dispositions for insert to service_role with check (true);
create function public.derive_governed_purchase_order_receipt_cost_dispositions(target_purchase_order_id uuid,target_operator_id uuid,target_idempotency_key text) returns integer language plpgsql security invoker set search_path='' as $$
declare r record; total_units int; prior_units int; prior_size_units int; cursor_units int; amount bigint; inserted int:=0; row_inserted int;
begin
 if target_idempotency_key is null or length(trim(target_idempotency_key))=0 then raise exception 'RECEIPT_COST_DISPOSITION_IDEMPOTENCY_REQUIRED'; end if;
 if not exists(select 1 from public.vault_operators where id=target_operator_id and is_active) then raise exception 'ACTIVE_OPERATOR_REQUIRED'; end if;
 if not exists(select 1 from public.vault_purchase_order_current_gbp_landed_cost_allocation_runs where purchase_order_id=target_purchase_order_id) then raise exception 'GOVERNED_GBP_ALLOCATION_REQUIRED'; end if;
 for r in select rr.id receipt_id,rr.created_at,rl.purchase_order_line_id,ra.id receipt_allocation_id,ra.quantity_received,ra.non_sellable_quantity,ra.purchase_order_line_size_allocation_id,sa.purchase_order_line_id size_line_id,sa.ordered_units,gl.id governed_line_id,gl.allocation_run_id,gl.allocated_gbp_minor_units from public.vault_purchase_order_receipts rr join public.vault_purchase_order_receipt_lines rl on rl.receipt_id=rr.id join public.vault_purchase_order_lines pol on pol.id=rl.purchase_order_line_id and pol.purchase_order_id=rr.purchase_order_id join public.vault_purchase_order_receipt_allocations ra on ra.receipt_line_id=rl.id join public.vault_purchase_order_line_size_allocations sa on sa.id=ra.purchase_order_line_size_allocation_id join public.vault_purchase_order_gbp_landed_cost_allocation_lines gl on gl.purchase_order_line_id=rl.purchase_order_line_id join public.vault_purchase_order_current_gbp_landed_cost_allocation_runs gr on gr.id=gl.allocation_run_id and gr.purchase_order_id=rr.purchase_order_id where rr.purchase_order_id=target_purchase_order_id order by rr.created_at,ra.id loop
  perform pg_advisory_xact_lock(hashtextextended(r.purchase_order_line_id::text,73000));
  if r.size_line_id<>r.purchase_order_line_id then raise exception 'RECEIPT_SIZE_ALLOCATION_LINE_MISMATCH'; end if;
  if exists(select 1 from public.vault_purchase_order_receipt_cost_dispositions d where d.purchase_order_line_id=r.purchase_order_line_id and(d.governed_gbp_allocation_run_id<>r.allocation_run_id or d.governed_gbp_allocation_line_id<>r.governed_line_id)) then raise exception 'GOVERNED_ALLOCATION_RUN_CHANGED_AFTER_DISPOSITION'; end if;
  select coalesce(sum(ordered_units),0)::int into total_units from public.vault_purchase_order_line_size_allocations where purchase_order_line_id=r.purchase_order_line_id;
  select coalesce(sum(ra2.quantity_received+ra2.non_sellable_quantity),0)::int into prior_units from public.vault_purchase_order_receipt_allocations ra2 join public.vault_purchase_order_receipt_lines rl2 on rl2.id=ra2.receipt_line_id join public.vault_purchase_order_receipts rr2 on rr2.id=rl2.receipt_id where rl2.purchase_order_line_id=r.purchase_order_line_id and (rr2.created_at,ra2.id)<(r.created_at,r.receipt_allocation_id);
  select coalesce(sum(ra2.quantity_received+ra2.non_sellable_quantity),0)::int into prior_size_units from public.vault_purchase_order_receipt_allocations ra2 join public.vault_purchase_order_receipt_lines rl2 on rl2.id=ra2.receipt_line_id join public.vault_purchase_order_receipts rr2 on rr2.id=rl2.receipt_id where ra2.purchase_order_line_size_allocation_id=r.purchase_order_line_size_allocation_id and (rr2.created_at,ra2.id)<(r.created_at,r.receipt_allocation_id);
  if total_units<=0 or prior_size_units+r.quantity_received+r.non_sellable_quantity>r.ordered_units then raise exception 'RECEIPT_PHYSICAL_AUTHORITY_EXCEEDED'; end if; cursor_units:=prior_units;
  if r.quantity_received>0 then amount:=((cursor_units+r.quantity_received)*r.allocated_gbp_minor_units/total_units)-(cursor_units*r.allocated_gbp_minor_units/total_units); insert into public.vault_purchase_order_receipt_cost_dispositions(purchase_order_id,purchase_order_line_id,receipt_id,receipt_allocation_id,purchase_order_line_size_allocation_id,governed_gbp_allocation_run_id,governed_gbp_allocation_line_id,disposition_type,quantity,allocated_gbp_minor_units,provenance_key) values(target_purchase_order_id,r.purchase_order_line_id,r.receipt_id,r.receipt_allocation_id,r.purchase_order_line_size_allocation_id,r.allocation_run_id,r.governed_line_id,'sellable_inventory',r.quantity_received,amount,'ordered_unit_rank_cumulative_floor:v1:'||r.allocation_run_id||':'||r.governed_line_id||':'||r.receipt_allocation_id||':sellable_inventory') on conflict(receipt_allocation_id,disposition_type) do nothing; get diagnostics row_inserted=row_count; inserted:=inserted+row_inserted; cursor_units:=cursor_units+r.quantity_received; end if;
  if r.non_sellable_quantity>0 then amount:=((cursor_units+r.non_sellable_quantity)*r.allocated_gbp_minor_units/total_units)-(cursor_units*r.allocated_gbp_minor_units/total_units); insert into public.vault_purchase_order_receipt_cost_dispositions(purchase_order_id,purchase_order_line_id,receipt_id,receipt_allocation_id,purchase_order_line_size_allocation_id,governed_gbp_allocation_run_id,governed_gbp_allocation_line_id,disposition_type,quantity,allocated_gbp_minor_units,provenance_key) values(target_purchase_order_id,r.purchase_order_line_id,r.receipt_id,r.receipt_allocation_id,r.purchase_order_line_size_allocation_id,r.allocation_run_id,r.governed_line_id,'non_sellable_writeoff',r.non_sellable_quantity,amount,'ordered_unit_rank_cumulative_floor:v1:'||r.allocation_run_id||':'||r.governed_line_id||':'||r.receipt_allocation_id||':non_sellable_writeoff') on conflict(receipt_allocation_id,disposition_type) do nothing; get diagnostics row_inserted=row_count; inserted:=inserted+row_inserted; end if;
 end loop; return inserted; end $$;
revoke all on function public.derive_governed_purchase_order_receipt_cost_dispositions(uuid,uuid,text) from public,anon,authenticated; grant execute on function public.derive_governed_purchase_order_receipt_cost_dispositions(uuid,uuid,text) to service_role;

create view public.vault_purchase_order_governed_receipt_cost_state with (security_invoker=true) as
with authoritative_lines as (
  select l.purchase_order_id,l.id purchase_order_line_id,
    coalesce(sum(s.ordered_units),coalesce(l.recommended_units,l.recommended_packs*l.units_per_pack),0)::bigint ordered_physical_units
  from public.vault_purchase_order_lines l
  left join public.vault_purchase_order_line_size_allocations s on s.purchase_order_line_id=l.id
  group by l.purchase_order_id,l.id,l.recommended_units,l.recommended_packs,l.units_per_pack
), current_allocation as (
  select r.purchase_order_id,a.purchase_order_line_id,count(*) allocation_line_count,(array_agg(r.id))[1] governed_allocation_run_id,(array_agg(a.id))[1] governed_allocation_line_id,max(a.allocated_gbp_minor_units) governed_allocated_gbp_minor_units
  from public.vault_purchase_order_current_gbp_landed_cost_allocation_runs r
  join public.vault_purchase_order_gbp_landed_cost_allocation_lines a on a.allocation_run_id=r.id and a.purchase_order_id=r.purchase_order_id
  group by r.purchase_order_id,a.purchase_order_line_id
), physical_receipts as (
  select rl.purchase_order_line_id,
    coalesce(sum(ra.quantity_received),0)::bigint sellable_received_units,
    coalesce(sum(ra.non_sellable_quantity),0)::bigint non_sellable_received_units,
    bool_and((sa.id is null or sa.purchase_order_line_id=rl.purchase_order_line_id) and rr.purchase_order_id=rlpo.purchase_order_id) physical_relationship_consistent
  from public.vault_purchase_order_receipt_allocations ra
  join public.vault_purchase_order_receipt_lines rl on rl.id=ra.receipt_line_id
  join public.vault_purchase_order_receipts rr on rr.id=rl.receipt_id
  join public.vault_purchase_order_lines rlpo on rlpo.id=rl.purchase_order_line_id
  left join public.vault_purchase_order_line_size_allocations sa on sa.id=ra.purchase_order_line_size_allocation_id
  group by rl.purchase_order_line_id
), dispositions as (
  select d.purchase_order_id,d.purchase_order_line_id,
    coalesce(sum(d.quantity),0)::bigint disposition_quantity,
    coalesce(sum(d.allocated_gbp_minor_units) filter(where d.disposition_type='sellable_inventory'),0)::bigint sellable_disposition_gbp_minor_units,
    coalesce(sum(d.allocated_gbp_minor_units) filter(where d.disposition_type='non_sellable_writeoff'),0)::bigint non_sellable_disposition_gbp_minor_units,
    count(distinct d.governed_gbp_allocation_run_id) disposition_run_count,
    count(distinct d.governed_gbp_allocation_line_id) disposition_line_count,
    (array_agg(d.governed_gbp_allocation_run_id))[1] disposition_run_id,
    (array_agg(d.governed_gbp_allocation_line_id))[1] disposition_line_id
  from public.vault_purchase_order_receipt_cost_dispositions d
  group by d.purchase_order_id,d.purchase_order_line_id
), assessed as (
  select l.purchase_order_id,l.purchase_order_line_id,c.governed_allocation_run_id,c.governed_allocation_line_id,c.governed_allocated_gbp_minor_units,
    l.ordered_physical_units,coalesce(p.sellable_received_units,0) sellable_received_units,coalesce(p.non_sellable_received_units,0) non_sellable_received_units,
    coalesce(d.disposition_quantity,0) disposition_quantity,coalesce(d.sellable_disposition_gbp_minor_units,0) sellable_disposition_gbp_minor_units,coalesce(d.non_sellable_disposition_gbp_minor_units,0) non_sellable_disposition_gbp_minor_units,
    coalesce(c.allocation_line_count,0) allocation_line_count,coalesce(p.physical_relationship_consistent,true) physical_relationship_consistent,
    coalesce(d.disposition_run_count,0) disposition_run_count,coalesce(d.disposition_line_count,0) disposition_line_count,d.disposition_run_id,d.disposition_line_id
  from authoritative_lines l
  left join current_allocation c on c.purchase_order_id=l.purchase_order_id and c.purchase_order_line_id=l.purchase_order_line_id
  left join physical_receipts p on p.purchase_order_line_id=l.purchase_order_line_id
  left join dispositions d on d.purchase_order_id=l.purchase_order_id and d.purchase_order_line_id=l.purchase_order_line_id
), conserved as (
  select *,sellable_received_units+non_sellable_received_units physical_received_units,
    sellable_disposition_gbp_minor_units+non_sellable_disposition_gbp_minor_units total_disposition_gbp_minor_units
  from assessed
), resolved as (
  select *,
    case when allocation_line_count=1 then governed_allocated_gbp_minor_units-total_disposition_gbp_minor_units else null end unresolved_gbp_minor_units,
    ordered_physical_units-physical_received_units unresolved_physical_units,
    allocation_line_count=1 and (disposition_run_count=0 or (disposition_run_count=1 and disposition_line_count=1 and disposition_run_id=governed_allocation_run_id and disposition_line_id=governed_allocation_line_id)) allocation_run_identity_consistent
  from conserved
)
select purchase_order_id,purchase_order_line_id,governed_allocation_run_id,governed_allocation_line_id,governed_allocated_gbp_minor_units,ordered_physical_units,
  physical_received_units,sellable_received_units,non_sellable_received_units,disposition_quantity,sellable_disposition_gbp_minor_units,non_sellable_disposition_gbp_minor_units,total_disposition_gbp_minor_units,
  unresolved_physical_units,unresolved_gbp_minor_units,allocation_run_identity_consistent,
  case
    when allocation_line_count=0 then 'UNAVAILABLE_MISSING_GOVERNED_ALLOCATION'
    when allocation_line_count<>1 then 'UNAVAILABLE_INCONSISTENT_EVIDENCE'
    when not allocation_run_identity_consistent then 'UNAVAILABLE_RUN_MISMATCH'
    when not physical_relationship_consistent or ordered_physical_units<0 or physical_received_units<>sellable_received_units+non_sellable_received_units or physical_received_units>ordered_physical_units or disposition_quantity<>physical_received_units or total_disposition_gbp_minor_units>governed_allocated_gbp_minor_units or unresolved_physical_units<0 or unresolved_gbp_minor_units<0 then 'UNAVAILABLE_INCONSISTENT_EVIDENCE'
    when physical_received_units=0 and disposition_quantity=0 and total_disposition_gbp_minor_units=0 then 'NO_RECEIPTS'
    when physical_received_units=ordered_physical_units and disposition_quantity=physical_received_units and unresolved_physical_units=0 and unresolved_gbp_minor_units=0 then 'COMPLETE'
    when physical_received_units>0 and disposition_quantity=physical_received_units and unresolved_physical_units>0 and unresolved_gbp_minor_units>0 then 'PARTIAL'
    else 'UNAVAILABLE_INCONSISTENT_EVIDENCE'
  end readiness_status,
  case
    when allocation_line_count=0 then 'MISSING_GOVERNED_ALLOCATION'
    when allocation_line_count<>1 then 'GOVERNED_ALLOCATION_EVIDENCE_INCONSISTENT'
    when not allocation_run_identity_consistent then 'GOVERNED_ALLOCATION_RUN_CHANGED_AFTER_DISPOSITION'
    when not physical_relationship_consistent then 'RECEIPT_PHYSICAL_RELATIONSHIP_INVALID'
    when physical_received_units<>sellable_received_units+non_sellable_received_units then 'PHYSICAL_RECEIPT_CONSERVATION_INVALID'
    when disposition_quantity<>physical_received_units then 'DISPOSITION_QUANTITY_CONSERVATION_INVALID'
    when total_disposition_gbp_minor_units>governed_allocated_gbp_minor_units or unresolved_gbp_minor_units<0 then 'MONETARY_CONSERVATION_INVALID'
    when physical_received_units=0 then 'NO_RECEIPTS'
    when physical_received_units=ordered_physical_units and unresolved_gbp_minor_units=0 then 'COMPLETE'
    when physical_received_units>0 and unresolved_physical_units>0 then 'PARTIAL'
    else 'INCONSISTENT_EVIDENCE'
  end reason_code,
  case when allocation_line_count=1 and allocation_run_identity_consistent and physical_relationship_consistent and physical_received_units=sellable_received_units+non_sellable_received_units and physical_received_units<=ordered_physical_units and disposition_quantity=physical_received_units and total_disposition_gbp_minor_units<=governed_allocated_gbp_minor_units and unresolved_physical_units>=0 and unresolved_gbp_minor_units>=0 then 'CONSERVATION_OK' else 'CONSERVATION_UNAVAILABLE_OR_INCONSISTENT' end conservation_status
from resolved;

create view public.vault_purchase_order_governed_receipt_cost_conservation with (security_invoker=true) as
select purchase_order_id,count(*)::integer line_count,
  count(*) filter(where readiness_status='COMPLETE')::integer complete_line_count,
  count(*) filter(where readiness_status='PARTIAL')::integer partial_line_count,
  count(*) filter(where readiness_status='NO_RECEIPTS')::integer no_receipt_line_count,
  count(*) filter(where readiness_status like 'UNAVAILABLE%')::integer unavailable_line_count,
  coalesce(sum(governed_allocated_gbp_minor_units),0)::bigint total_governed_gbp_minor_units,
  coalesce(sum(sellable_disposition_gbp_minor_units),0)::bigint total_sellable_disposition_gbp_minor_units,
  coalesce(sum(non_sellable_disposition_gbp_minor_units),0)::bigint total_non_sellable_disposition_gbp_minor_units,
  coalesce(sum(total_disposition_gbp_minor_units),0)::bigint total_disposition_gbp_minor_units,
  coalesce(sum(unresolved_gbp_minor_units),0)::bigint total_unresolved_gbp_minor_units,
  coalesce(sum(ordered_physical_units),0)::bigint total_ordered_physical_units,
  coalesce(sum(physical_received_units),0)::bigint total_physical_received_units,
  coalesce(sum(unresolved_physical_units),0)::bigint total_unresolved_physical_units,
  case when count(*) filter(where readiness_status like 'UNAVAILABLE%')>0 then 'CONSERVATION_UNAVAILABLE_OR_INCONSISTENT'
    when sum(governed_allocated_gbp_minor_units)=sum(total_disposition_gbp_minor_units)+sum(unresolved_gbp_minor_units) and sum(ordered_physical_units)=sum(physical_received_units)+sum(unresolved_physical_units) then 'CONSERVATION_OK'
    else 'CONSERVATION_UNAVAILABLE_OR_INCONSISTENT' end conservation_status,
  case when count(*) filter(where readiness_status like 'UNAVAILABLE%')>0 then 'UNAVAILABLE_INCONSISTENT_EVIDENCE'
    when count(*)=count(*) filter(where readiness_status='COMPLETE') then 'COMPLETE'
    when count(*)=count(*) filter(where readiness_status='NO_RECEIPTS') then 'NO_RECEIPTS'
    else 'PARTIAL' end readiness_status,
  case when count(*) filter(where readiness_status='UNAVAILABLE_RUN_MISMATCH')>0 then 'GOVERNED_ALLOCATION_RUN_CHANGED_AFTER_DISPOSITION'
    when count(*) filter(where readiness_status='UNAVAILABLE_MISSING_GOVERNED_ALLOCATION')>0 then 'MISSING_GOVERNED_ALLOCATION'
    when count(*) filter(where readiness_status='UNAVAILABLE_INCONSISTENT_EVIDENCE')>0 then 'INCONSISTENT_EVIDENCE'
    when count(*)=count(*) filter(where readiness_status='COMPLETE') then 'COMPLETE'
    when count(*)=count(*) filter(where readiness_status='NO_RECEIPTS') then 'NO_RECEIPTS'
    else 'PARTIAL' end reason_code
from public.vault_purchase_order_governed_receipt_cost_state
group by purchase_order_id;

revoke all on public.vault_purchase_order_governed_receipt_cost_state,public.vault_purchase_order_governed_receipt_cost_conservation from public,anon,authenticated;
grant select on public.vault_purchase_order_governed_receipt_cost_state,public.vault_purchase_order_governed_receipt_cost_conservation to service_role;
notify pgrst,'reload schema';
