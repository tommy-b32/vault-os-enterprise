-- Phase 1B6B: factual observed-size exposure only; no curve, confidence, or buying decision.
create view public.vault_observed_size_exposure as
with size_rows as (
  select s.canonical_style_id,s.parent_product_id,s.model_design,s.trading_evidence_maturity,s.size_evidence_sufficiency_state,
    s.current_evidence_available,s.current_evidence_unavailable_reason,s.historical_evidence_available,s.historical_evidence_unavailable_reason,s.availability_censoring_limitation,
    a.canonical_size,a.current_observed_units,a.historical_observed_units,a.observed_current,a.observed_historically,
    c.net_available_stock,c.trusted inventory_trusted
  from public.vault_size_evidence_sufficiency s
  join public.vault_size_distribution_evidence_assessment a using(canonical_style_id)
  left join public.vault_model_size_replenishment_intelligence c on c.style_id=s.canonical_style_id and c.normalized_size=a.canonical_size
), facts as (
  select canonical_style_id,min(parent_product_id::text)::uuid parent_product_id,min(model_design) model_design,min(trading_evidence_maturity) trading_evidence_maturity,
    min(size_evidence_sufficiency_state) size_evidence_sufficiency_state,bool_and(current_evidence_available) current_evidence_available,
    (array_agg(current_evidence_unavailable_reason) filter(where current_evidence_unavailable_reason is not null))[1] current_evidence_unavailable_reason,
    bool_and(historical_evidence_available) historical_evidence_available,
    (array_agg(historical_evidence_unavailable_reason) filter(where historical_evidence_unavailable_reason is not null))[1] historical_evidence_unavailable_reason,
    min(availability_censoring_limitation) availability_censoring_limitation,
    bool_and(coalesce(inventory_trusted,false)) filter(where observed_current or observed_historically) observed_inventory_trusted,
    array_agg(canonical_size order by canonical_size) filter(where observed_current) current_observed_sizes,
    array_agg(canonical_size order by canonical_size) filter(where observed_current and coalesce(inventory_trusted,false) and net_available_stock<=0) current_observed_unavailable_sizes,
    array_agg(canonical_size order by canonical_size) filter(where observed_current and coalesce(inventory_trusted,false) and net_available_stock>0) current_observed_serviceable_sizes,
    sum(current_observed_units) filter(where observed_current) current_observed_units,
    sum(current_observed_units) filter(where observed_current and coalesce(inventory_trusted,false) and net_available_stock>0) current_observed_serviceable_units,
    sum(current_observed_units) filter(where observed_current and coalesce(inventory_trusted,false) and net_available_stock<=0) current_observed_exposed_units,
    array_agg(canonical_size order by canonical_size) filter(where observed_historically) historical_observed_sizes,
    array_agg(canonical_size order by canonical_size) filter(where observed_historically and coalesce(inventory_trusted,false) and net_available_stock<=0) historical_observed_unavailable_sizes,
    array_agg(canonical_size order by canonical_size) filter(where observed_historically and coalesce(inventory_trusted,false) and net_available_stock>0) historical_observed_serviceable_sizes,
    sum(historical_observed_units) filter(where observed_historically) historical_observed_units,
    sum(historical_observed_units) filter(where observed_historically and coalesce(inventory_trusted,false) and net_available_stock>0) historical_observed_serviceable_units,
    sum(historical_observed_units) filter(where observed_historically and coalesce(inventory_trusted,false) and net_available_stock<=0) historical_observed_exposed_units,
    sum(net_available_stock) filter(where coalesce(inventory_trusted,false)) total_current_stock,
    sum(net_available_stock) filter(where coalesce(inventory_trusted,false) and observed_historically) current_stock_in_historically_observed_sizes,
    sum(net_available_stock) filter(where coalesce(inventory_trusted,false) and not observed_historically) current_stock_in_historically_unobserved_sizes
  from size_rows group by canonical_style_id
)
select canonical_style_id,parent_product_id,model_design,trading_evidence_maturity,size_evidence_sufficiency_state,
  current_evidence_available,current_evidence_unavailable_reason,historical_evidence_available,historical_evidence_unavailable_reason,availability_censoring_limitation,
  case when size_evidence_sufficiency_state='DESCRIPTIVE_ONLY' and observed_inventory_trusted then true else false end observed_exposure_available,
  case when size_evidence_sufficiency_state='UNAVAILABLE' then 'size_evidence_unavailable' when size_evidence_sufficiency_state='NOT_OBSERVED' then 'no_governed_observed_sizes' when not observed_inventory_trusted then 'observed_size_inventory_untrusted_or_unavailable' else null end observed_exposure_unavailable_reason,
  case when current_evidence_available then coalesce(current_observed_sizes,array[]::text[]) end current_observed_sizes,
  case when size_evidence_sufficiency_state='DESCRIPTIVE_ONLY' and observed_inventory_trusted then coalesce(current_observed_unavailable_sizes,array[]::text[]) end current_observed_unavailable_sizes,
  case when size_evidence_sufficiency_state='DESCRIPTIVE_ONLY' and observed_inventory_trusted then coalesce(current_observed_serviceable_sizes,array[]::text[]) end current_observed_serviceable_sizes,
  case when current_evidence_available then current_observed_units end current_observed_units,
  case when size_evidence_sufficiency_state='DESCRIPTIVE_ONLY' and observed_inventory_trusted then coalesce(current_observed_serviceable_units,0) end current_observed_serviceable_units,
  case when size_evidence_sufficiency_state='DESCRIPTIVE_ONLY' and observed_inventory_trusted then coalesce(current_observed_exposed_units,0) end current_observed_exposed_units,
  case when size_evidence_sufficiency_state='DESCRIPTIVE_ONLY' and observed_inventory_trusted and current_observed_units>0 then coalesce(current_observed_serviceable_units,0)/current_observed_units end current_observed_serviceable_share,
  case when size_evidence_sufficiency_state='DESCRIPTIVE_ONLY' and observed_inventory_trusted and current_observed_units>0 then coalesce(current_observed_exposed_units,0)/current_observed_units end current_observed_exposed_share,
  case when historical_evidence_available then coalesce(historical_observed_sizes,array[]::text[]) end historical_observed_sizes,
  case when size_evidence_sufficiency_state='DESCRIPTIVE_ONLY' and observed_inventory_trusted then coalesce(historical_observed_unavailable_sizes,array[]::text[]) end historical_observed_unavailable_sizes,
  case when size_evidence_sufficiency_state='DESCRIPTIVE_ONLY' and observed_inventory_trusted then coalesce(historical_observed_serviceable_sizes,array[]::text[]) end historical_observed_serviceable_sizes,
  case when historical_evidence_available then historical_observed_units end historical_observed_units,
  case when size_evidence_sufficiency_state='DESCRIPTIVE_ONLY' and observed_inventory_trusted then coalesce(historical_observed_serviceable_units,0) end historical_observed_serviceable_units,
  case when size_evidence_sufficiency_state='DESCRIPTIVE_ONLY' and observed_inventory_trusted then coalesce(historical_observed_exposed_units,0) end historical_observed_exposed_units,
  case when size_evidence_sufficiency_state='DESCRIPTIVE_ONLY' and observed_inventory_trusted and historical_observed_units>0 then coalesce(historical_observed_serviceable_units,0)/historical_observed_units end historical_observed_serviceable_share,
  case when size_evidence_sufficiency_state='DESCRIPTIVE_ONLY' and observed_inventory_trusted and historical_observed_units>0 then coalesce(historical_observed_exposed_units,0)/historical_observed_units end historical_observed_exposed_share,
  case when size_evidence_sufficiency_state='DESCRIPTIVE_ONLY' and observed_inventory_trusted then total_current_stock end total_current_stock,
  case when size_evidence_sufficiency_state='DESCRIPTIVE_ONLY' and observed_inventory_trusted then current_stock_in_historically_observed_sizes end current_stock_in_historically_observed_sizes,
  case when size_evidence_sufficiency_state='DESCRIPTIVE_ONLY' and observed_inventory_trusted then current_stock_in_historically_unobserved_sizes end current_stock_in_historically_unobserved_sizes
from facts;
comment on view public.vault_observed_size_exposure is 'Phase 1B6B factual observed-size exposure only; not a size curve, forecast, replenishment, or buying decision.';
notify pgrst, 'reload schema';
