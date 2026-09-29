begin;

-- Completeness reports landed-cost evidence state only. Monetary authority is
-- selected independently by vault_purchase_order_governed_liability.
create or replace view public.vault_purchase_order_landed_cost_completeness
with (security_invoker=true) as
select
  po.id as purchase_order_id,
  case
    when liability.liability_evidence_state='available'
      and liability.liability_source='governed_gbp_landed_cost_allocation'
      and liability.governed_gbp_allocation_run_id is not null
      and liability.selected_gbp_minor_units is not null
      and liability.selected_gbp_minor_units>0
      then 'complete_landed_cost'
    -- A current but invalid or conflicting GBP allocation is higher-authority
    -- evidence and must not fall through to the historical absence rule.
    when exists (
      select 1
      from public.vault_purchase_order_current_gbp_landed_cost_allocation_runs run
      where run.purchase_order_id=po.id
    ) then 'landed_cost_pending'
    -- Retain the historical result for untouched legacy POs only.
    when not exists (
      select 1
      from public.vault_purchase_order_line_merchandise_cost_evidence line
      where line.purchase_order_id=po.id
    ) and not exists (
      select 1
      from public.vault_purchase_order_freight_evidence freight
      where freight.purchase_order_id=po.id
        and not exists (
          select 1
          from public.vault_purchase_order_freight_evidence correction
          where correction.supersedes_evidence_id=freight.id
        )
    ) then 'complete_landed_cost'
    else 'landed_cost_pending'
  end as landed_cost_completeness
from public.vault_purchase_orders po
join public.vault_purchase_order_governed_liability liability
  on liability.purchase_order_id=po.id;

-- Preserve the established approval function verbatim except for its former
-- assumption that every non-legacy-cost PO must remain pending.
do $$
declare
  definition text;
  old_branch text:= $old$if complete_line_count<> (select count(*) from public.vault_purchase_order_lines line where line.purchase_order_id=po.id) then
    select landed_cost_completeness into landed_cost_state from public.vault_purchase_order_landed_cost_completeness where purchase_order_id=po.id;
    if landed_cost_state<>'landed_cost_pending' then raise exception 'MIXED_PO_LANDED_COST_COMPLETENESS_INVALID'; end if;
    select * into fx from public.vault_purchase_order_current_fx_commitment where purchase_order_id=po.id;
    if not found or fx.commitment_evidence_state<>'available' or fx.gbp_commitment_amount is null or fx.gbp_commitment_amount<=0 or not exists(select 1 from public.vault_purchase_order_fx_commitment_evidence evidence where evidence.id=fx.fx_commitment_evidence_id and evidence.purchase_order_id=po.id and evidence.supplier_id=po.supplier_id and evidence.gbp_commitment_amount=fx.gbp_commitment_amount and not exists(select 1 from public.vault_purchase_order_fx_commitment_evidence correction where correction.supersedes_evidence_id=evidence.id)) then raise exception 'MIXED_PO_FX_COMMITMENT_REQUIRED'; end if;
  end if;$old$;
  new_branch text:= $new$if complete_line_count<> (select count(*) from public.vault_purchase_order_lines line where line.purchase_order_id=po.id) then
    select landed_cost_completeness into landed_cost_state from public.vault_purchase_order_landed_cost_completeness where purchase_order_id=po.id;
    select * into governed_liability from public.vault_purchase_order_governed_liability where purchase_order_id=po.id;
    if landed_cost_state='complete_landed_cost' and governed_liability.liability_evidence_state='available' and governed_liability.liability_source='governed_gbp_landed_cost_allocation' and governed_liability.selected_gbp_minor_units is not null and governed_liability.selected_gbp_minor_units>0 and governed_liability.governed_gbp_allocation_run_id is not null then
      null;
    elsif exists(select 1 from public.vault_purchase_order_current_gbp_landed_cost_allocation_runs run where run.purchase_order_id=po.id) then
      raise exception 'MIXED_PO_GOVERNED_LANDED_COST_INVALID';
    else
      if landed_cost_state<>'landed_cost_pending' then raise exception 'MIXED_PO_LANDED_COST_COMPLETENESS_INVALID'; end if;
      select * into fx from public.vault_purchase_order_current_fx_commitment where purchase_order_id=po.id;
      if not found or fx.commitment_evidence_state<>'available' or fx.gbp_commitment_amount is null or fx.gbp_commitment_amount<=0 or not exists(select 1 from public.vault_purchase_order_fx_commitment_evidence evidence where evidence.id=fx.fx_commitment_evidence_id and evidence.purchase_order_id=po.id and evidence.supplier_id=po.supplier_id and evidence.gbp_commitment_amount=fx.gbp_commitment_amount and not exists(select 1 from public.vault_purchase_order_fx_commitment_evidence correction where correction.supersedes_evidence_id=evidence.id)) then raise exception 'MIXED_PO_FX_COMMITMENT_REQUIRED'; end if;
    end if;
  end if;$new$;
begin
  select pg_get_functiondef('public.approve_mixed_supplier_purchase_order(uuid,uuid)'::regprocedure) into definition;
  definition:=replace(definition,'  fx record;','  fx record; governed_liability record;');
  definition:=replace(definition,old_branch,new_branch);
  if position('MIXED_PO_GOVERNED_LANDED_COST_INVALID' in definition)=0 then raise exception '69000_APPROVAL_FUNCTION_UNEXPECTED'; end if;
  execute definition;
end $$;

commit;
