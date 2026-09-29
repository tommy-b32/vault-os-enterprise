begin;

-- A derived monetary-authority model.  It deliberately does not consult the
-- landed-cost completeness label: evidence, not that label, selects money.
create view public.vault_purchase_order_governed_liability
with (security_invoker=true) as
with current_gbp_run_counts as (
  select purchase_order_id, count(*)::integer as current_run_count
  from public.vault_purchase_order_current_gbp_landed_cost_allocation_runs
  group by purchase_order_id
), current_freight_run_counts as (
  select purchase_order_id, count(*)::integer as current_run_count
  from public.vault_purchase_order_current_freight_allocation_runs
  group by purchase_order_id
), sole_current_gbp_runs as (
  select r.*
  from public.vault_purchase_order_current_gbp_landed_cost_allocation_runs r
  join current_gbp_run_counts counts on counts.purchase_order_id=r.purchase_order_id and counts.current_run_count=1
), sole_current_freight_runs as (
  select r.*
  from public.vault_purchase_order_current_freight_allocation_runs r
  join current_freight_run_counts counts on counts.purchase_order_id=r.purchase_order_id and counts.current_run_count=1
), current_gbp_run_validation as (
  select
    r.purchase_order_id,
    r.id as governed_gbp_allocation_run_id,
    r.fx_commitment_evidence_id,
    r.freight_allocation_run_id,
    bool_and(
      c.purchase_order_id=r.purchase_order_id
      and l.purchase_order_id=r.purchase_order_id
      and l.recommended_packs>0
      and l.units_per_pack>0
      and l.recommended_units=l.recommended_packs*l.units_per_pack
      and m.purchase_order_id=r.purchase_order_id
      and m.purchase_order_line_id=l.id
      and m.id=c.merchandise_evidence_id
      and m.supplier_currency='USD'
      and m.pack_count=l.recommended_packs
      and m.units_per_pack=l.units_per_pack
      and m.merchandise_line_total>0
      and m.merchandise_line_total*100=trunc(m.merchandise_line_total*100)
      and f.purchase_order_id=r.purchase_order_id
      and f.purchase_order_line_id=l.id
      and f.id=c.freight_allocation_line_id
      and f.allocation_run_id=r.freight_allocation_run_id
      and f.currency='USD'
      and f.pack_count=l.recommended_packs
      and f.units_per_pack=l.units_per_pack
      and f.pack_count*f.units_per_pack=l.recommended_units
      and c.source_merchandise_usd_minor_units=(m.merchandise_line_total*100)::bigint
      and c.source_freight_usd_minor_units=f.allocated_amount_minor_units
      and c.source_landed_usd_minor_units=c.source_merchandise_usd_minor_units+c.source_freight_usd_minor_units
      and c.source_currency=r.source_currency
      and c.target_currency=r.target_currency
      and c.allocation_method=r.allocation_method
      and c.allocation_method_version=r.allocation_method_version
    ) as child_identity_valid,
    count(c.*)::integer as child_count,
    count(distinct c.purchase_order_line_id)::integer as child_line_count,
    count(distinct c.remainder_rank)::integer as child_rank_count,
    min(c.remainder_rank)::integer as child_min_rank,
    max(c.remainder_rank)::integer as child_max_rank,
    count(distinct l.id)::integer as covered_po_line_count,
    coalesce(sum(c.source_merchandise_usd_minor_units),0)::bigint as child_merchandise_usd_minor_units,
    coalesce(sum(c.source_freight_usd_minor_units),0)::bigint as child_freight_usd_minor_units,
    coalesce(sum(c.source_landed_usd_minor_units),0)::bigint as child_landed_usd_minor_units,
    coalesce(sum(c.allocated_gbp_minor_units),0)::bigint as child_gbp_minor_units
  from sole_current_gbp_runs r
  left join public.vault_purchase_order_gbp_landed_cost_allocation_lines c
    on c.allocation_run_id=r.id
  left join public.vault_purchase_order_lines l
    on l.id=c.purchase_order_line_id
  left join public.vault_purchase_order_line_merchandise_cost_evidence m
    on m.id=c.merchandise_evidence_id
  left join public.vault_purchase_order_freight_allocation_lines f
    on f.id=c.freight_allocation_line_id
  group by r.purchase_order_id,r.id,r.fx_commitment_evidence_id,r.freight_allocation_run_id
), po_lines as (
  select purchase_order_id, count(*)::integer as line_count,
    coalesce(sum(recommended_packs),0)::integer as pack_count,
    coalesce(sum(recommended_units),0)::integer as unit_count
  from public.vault_purchase_order_lines
  group by purchase_order_id
), legacy_estimate_eligible as (
  -- Preserve the former absence-based estimate path without treating its
  -- completeness label as a monetary authority.
  select po.id as purchase_order_id
  from public.vault_purchase_orders po
  where po.estimated_total_gbp is not null
    and po.estimated_total_gbp>0
    and not exists (
      select 1 from public.vault_purchase_order_line_merchandise_cost_evidence m
      where m.purchase_order_id=po.id
    )
    and not exists (
      select 1 from public.vault_purchase_order_freight_evidence f
      where f.purchase_order_id=po.id
        and not exists (
          select 1 from public.vault_purchase_order_freight_evidence correction
          where correction.supersedes_evidence_id=f.id
        )
    )
)
select
  po.id as purchase_order_id,
  case
    when coalesce(gbp_counts.current_run_count,0)>0 and (
      gbp_counts.current_run_count<>1
      or validation.governed_gbp_allocation_run_id is null
      or fx.commitment_evidence_state<>'available'
      or validation.fx_commitment_evidence_id is distinct from fx.fx_commitment_evidence_id
      or coalesce(freight_counts.current_run_count,0)<>1
      or validation.freight_allocation_run_id is distinct from freight.id
      or validation.child_count is distinct from validation_parent.line_count
      or validation.child_line_count is distinct from validation_parent.line_count
      or validation.child_rank_count is distinct from validation_parent.line_count
      or validation.child_min_rank is distinct from 1
      or validation.child_max_rank is distinct from validation_parent.line_count
      or validation.covered_po_line_count is distinct from validation_parent.line_count
      or validation_parent.line_count is distinct from po_lines.line_count
      or po.total_packs is distinct from po_lines.pack_count
      or validation.child_identity_valid is not true
      or validation.child_merchandise_usd_minor_units+validation.child_freight_usd_minor_units is distinct from validation.child_landed_usd_minor_units
      or validation.child_landed_usd_minor_units is distinct from validation_parent.source_usd_liability_minor_units
      or fx.supplier_liability_amount*100<>trunc(fx.supplier_liability_amount*100)
      or fx.gbp_commitment_amount*100<>trunc(fx.gbp_commitment_amount*100)
      or validation.child_landed_usd_minor_units is distinct from (fx.supplier_liability_amount*100)::bigint
      or validation.child_gbp_minor_units is distinct from validation_parent.target_gbp_minor_units
      or validation_parent.target_gbp_minor_units is distinct from (fx.gbp_commitment_amount*100)::bigint
      or validation_parent.source_currency is distinct from 'USD'
      or validation_parent.target_currency is distinct from 'GBP'
      or validation_parent.allocation_method is distinct from 'governed_usd_landed_cents_pro_rata_largest_remainder'
      or validation_parent.allocation_method_version is distinct from 'v1'
    ) then 'unavailable'
    when coalesce(gbp_counts.current_run_count,0)=1 then 'available'
    when fx.commitment_evidence_state='available' then 'available'
    when fx.commitment_evidence_state='missing' and legacy.purchase_order_id is not null then 'available'
    else 'unavailable'
  end as liability_evidence_state,
  case
    when coalesce(gbp_counts.current_run_count,0)=1 and validation.governed_gbp_allocation_run_id is not null
      and fx.commitment_evidence_state='available'
      and validation.fx_commitment_evidence_id=fx.fx_commitment_evidence_id
      and freight_counts.current_run_count=1
      and validation.freight_allocation_run_id=freight.id
      and validation.child_count=validation_parent.line_count
      and validation.child_line_count=validation_parent.line_count
      and validation.child_rank_count=validation_parent.line_count
      and validation.child_min_rank=1 and validation.child_max_rank=validation_parent.line_count
      and validation.covered_po_line_count=validation_parent.line_count
      and validation_parent.line_count=po_lines.line_count
      and po.total_packs=po_lines.pack_count
      and validation.child_identity_valid is true
      and validation.child_merchandise_usd_minor_units+validation.child_freight_usd_minor_units=validation.child_landed_usd_minor_units
      and validation.child_landed_usd_minor_units=validation_parent.source_usd_liability_minor_units
      and fx.supplier_liability_amount*100=trunc(fx.supplier_liability_amount*100)
      and fx.gbp_commitment_amount*100=trunc(fx.gbp_commitment_amount*100)
      and validation.child_landed_usd_minor_units=(fx.supplier_liability_amount*100)::bigint
      and validation.child_gbp_minor_units=validation_parent.target_gbp_minor_units
      and validation_parent.target_gbp_minor_units=(fx.gbp_commitment_amount*100)::bigint
      and validation_parent.source_currency='USD' and validation_parent.target_currency='GBP'
      and validation_parent.allocation_method='governed_usd_landed_cents_pro_rata_largest_remainder'
      and validation_parent.allocation_method_version='v1'
      then 'governed_gbp_landed_cost_allocation'
    when coalesce(gbp_counts.current_run_count,0)>0 then 'unavailable'
    when fx.commitment_evidence_state='available' then 'governed_fx_commitment'
    when fx.commitment_evidence_state='missing' and legacy.purchase_order_id is not null then 'legacy_estimated_total'
    else 'unavailable'
  end as liability_source,
  case
    when coalesce(gbp_counts.current_run_count,0)=1 and validation.governed_gbp_allocation_run_id is not null
      and fx.commitment_evidence_state='available'
      and validation.fx_commitment_evidence_id=fx.fx_commitment_evidence_id
      and freight_counts.current_run_count=1 and validation.freight_allocation_run_id=freight.id
      and validation.child_count=validation_parent.line_count and validation.child_line_count=validation_parent.line_count
      and validation.child_rank_count=validation_parent.line_count and validation.covered_po_line_count=validation_parent.line_count
      and validation.child_min_rank=1 and validation.child_max_rank=validation_parent.line_count
      and validation_parent.line_count=po_lines.line_count and po.total_packs=po_lines.pack_count and validation.child_identity_valid is true
      and validation.child_merchandise_usd_minor_units+validation.child_freight_usd_minor_units=validation.child_landed_usd_minor_units
      and validation.child_landed_usd_minor_units=validation_parent.source_usd_liability_minor_units
      and fx.supplier_liability_amount*100=trunc(fx.supplier_liability_amount*100)
      and fx.gbp_commitment_amount*100=trunc(fx.gbp_commitment_amount*100)
      and validation.child_landed_usd_minor_units=(fx.supplier_liability_amount*100)::bigint
      and validation.child_gbp_minor_units=validation_parent.target_gbp_minor_units
      and validation_parent.target_gbp_minor_units=(fx.gbp_commitment_amount*100)::bigint
      and validation_parent.source_currency='USD' and validation_parent.target_currency='GBP'
      and validation_parent.allocation_method='governed_usd_landed_cents_pro_rata_largest_remainder'
      and validation_parent.allocation_method_version='v1' then validation.child_gbp_minor_units
    when coalesce(gbp_counts.current_run_count,0)>0 then null
    when fx.commitment_evidence_state='available' then (fx.gbp_commitment_amount*100)::bigint
    when fx.commitment_evidence_state='missing' and legacy.purchase_order_id is not null then (po.estimated_total_gbp*100)::bigint
    else null
  end as selected_gbp_minor_units,
  case
    when coalesce(gbp_counts.current_run_count,0)=1 and validation.governed_gbp_allocation_run_id is not null
      and fx.commitment_evidence_state='available'
      and validation.fx_commitment_evidence_id=fx.fx_commitment_evidence_id
      and freight_counts.current_run_count=1 and validation.freight_allocation_run_id=freight.id
      and validation.child_count=validation_parent.line_count and validation.child_line_count=validation_parent.line_count
      and validation.child_rank_count=validation_parent.line_count and validation.covered_po_line_count=validation_parent.line_count
      and validation.child_min_rank=1 and validation.child_max_rank=validation_parent.line_count
      and validation_parent.line_count=po_lines.line_count and po.total_packs=po_lines.pack_count and validation.child_identity_valid is true
      and validation.child_merchandise_usd_minor_units+validation.child_freight_usd_minor_units=validation.child_landed_usd_minor_units
      and validation.child_landed_usd_minor_units=validation_parent.source_usd_liability_minor_units
      and fx.supplier_liability_amount*100=trunc(fx.supplier_liability_amount*100)
      and fx.gbp_commitment_amount*100=trunc(fx.gbp_commitment_amount*100)
      and validation.child_landed_usd_minor_units=(fx.supplier_liability_amount*100)::bigint
      and validation.child_gbp_minor_units=validation_parent.target_gbp_minor_units
      and validation_parent.target_gbp_minor_units=(fx.gbp_commitment_amount*100)::bigint
      and validation_parent.source_currency='USD' and validation_parent.target_currency='GBP'
      and validation_parent.allocation_method='governed_usd_landed_cents_pro_rata_largest_remainder'
      and validation_parent.allocation_method_version='v1' then validation.child_gbp_minor_units::numeric/100
    when coalesce(gbp_counts.current_run_count,0)>0 then null
    when fx.commitment_evidence_state='available' then fx.gbp_commitment_amount
    when fx.commitment_evidence_state='missing' and legacy.purchase_order_id is not null then po.estimated_total_gbp
    else null
  end::numeric(12,2) as selected_gbp_amount,
  case when coalesce(gbp_counts.current_run_count,0)=1 then validation.governed_gbp_allocation_run_id else null end as governed_gbp_allocation_run_id,
  case when fx.commitment_evidence_state='available' then fx.fx_commitment_evidence_id else null end as fx_commitment_evidence_id,
  case when coalesce(freight_counts.current_run_count,0)=1 then freight.id else null end as freight_allocation_run_id
from public.vault_purchase_orders po
join public.vault_purchase_order_current_fx_commitment fx on fx.purchase_order_id=po.id
left join current_gbp_run_counts gbp_counts on gbp_counts.purchase_order_id=po.id
left join sole_current_gbp_runs validation_parent on validation_parent.purchase_order_id=po.id
left join current_gbp_run_validation validation on validation.purchase_order_id=po.id
left join current_freight_run_counts freight_counts on freight_counts.purchase_order_id=po.id
left join sole_current_freight_runs freight on freight.purchase_order_id=po.id
left join po_lines on po_lines.purchase_order_id=po.id
left join legacy_estimate_eligible legacy on legacy.purchase_order_id=po.id;

revoke all on public.vault_purchase_order_governed_liability from public,anon,authenticated;
grant select on public.vault_purchase_order_governed_liability to service_role;

create or replace view public.vault_purchasing_wallet as
with ledger as (
  select coalesce(sum(amount_gbp),0)::numeric(12,2) as ledger_balance_gbp,max(updated_at) as last_updated_at
  from public.vault_cash_transactions
), commitment_rows as (
  select po.id,po.updated_at,po.paid_amount_gbp,liability.liability_evidence_state,
    case when liability.liability_evidence_state<>'available' then true else false end as unresolved_commitment,
    case when liability.liability_evidence_state='available' then greatest(liability.selected_gbp_amount-po.paid_amount_gbp,0) else null end as commitment_amount_gbp
  from public.vault_purchase_orders po
  join public.vault_purchase_order_governed_liability liability on liability.purchase_order_id=po.id
  where po.status in ('approved','ordered','part_paid','shipped','received')
), commitments as (
  select coalesce(sum(commitment_amount_gbp),0)::numeric(12,2) as known_committed_orders_gbp,
    count(*) filter(where unresolved_commitment)::integer as unresolved_commitment_order_count,max(updated_at) as last_updated_at
  from commitment_rows
), policy as (
  select protected_reserve_gbp,manual_spending_limit_gbp,reserve_override_allowed,wallet_freshness_threshold_minutes,updated_at
  from public.vault_purchasing_policy where policy_key='primary'
), resolved as (
  select ledger.ledger_balance_gbp,coalesce(policy.protected_reserve_gbp,0)::numeric(12,2) as protected_reserve_gbp,
    commitments.known_committed_orders_gbp,commitments.unresolved_commitment_order_count,
    ledger.last_updated_at as ledger_last_updated_at,commitments.last_updated_at as commitments_last_updated_at,
    policy.manual_spending_limit_gbp,coalesce(policy.reserve_override_allowed,false) as reserve_override_allowed,
    policy.updated_at as policy_updated_at,policy.wallet_freshness_threshold_minutes
  from ledger cross join commitments left join policy on true
)
select ledger_balance_gbp,protected_reserve_gbp,
  case when unresolved_commitment_order_count>0 then null else known_committed_orders_gbp end::numeric(12,2) as committed_orders_gbp,
  case when unresolved_commitment_order_count>0 then null else greatest(ledger_balance_gbp-protected_reserve_gbp-known_committed_orders_gbp,0) end::numeric(12,2) as calculated_purchasing_power_gbp,
  case when unresolved_commitment_order_count>0 then null when manual_spending_limit_gbp is null then greatest(ledger_balance_gbp-protected_reserve_gbp-known_committed_orders_gbp,0) else least(manual_spending_limit_gbp,greatest(ledger_balance_gbp-protected_reserve_gbp-known_committed_orders_gbp,0)) end::numeric(12,2) as available_purchasing_power_gbp,
  manual_spending_limit_gbp,reserve_override_allowed,
  case when unresolved_commitment_order_count>0 then 'unavailable' when ledger_balance_gbp<=0 then 'no_cash' when ledger_balance_gbp-protected_reserve_gbp-known_committed_orders_gbp<=0 then 'reserve_protected' when ledger_balance_gbp-protected_reserve_gbp-known_committed_orders_gbp<500 then 'limited' else 'healthy' end as purchasing_power_state,
  case when unresolved_commitment_order_count>0 then null else greatest(ledger_last_updated_at,commitments_last_updated_at,policy_updated_at) end as wallet_last_updated,
  wallet_freshness_threshold_minutes,unresolved_commitment_order_count
from resolved;

commit;
