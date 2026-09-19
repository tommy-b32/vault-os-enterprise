-- Phase 1B7D: prospective first-success daily member/location quantity facts.
-- No snapshot, B7C attestation, or legacy inventory history is backfilled.
create table public.vault_inventory_observation_daily_member_location_quantities (
  id uuid primary key default gen_random_uuid(), evidence_date date not null,
  attesting_inventory_sync_run_id uuid not null references public.vault_shopify_inventory_sync_runs(id) on delete restrict,
  variant_id uuid not null references public.vault_variants(id) on delete restrict,
  shopify_variant_id text, shopify_inventory_item_id text not null,
  parent_product_id uuid, model_design text, normalized_size text, canonical_style_id text,
  canonical_mapping_status text not null check (canonical_mapping_status in ('resolved','unresolved_or_incomplete')),
  shopify_location_id text not null, available integer not null,
  committed integer not null, incoming integer not null, on_hand integer not null,
  observed_at timestamptz not null, created_at timestamptz not null default now(),
  unique nulls not distinct (evidence_date,variant_id,shopify_inventory_item_id,parent_product_id,model_design,normalized_size,canonical_style_id,canonical_mapping_status,shopify_location_id)
);
create index vault_inventory_observation_daily_quantity_date_variant_idx on public.vault_inventory_observation_daily_member_location_quantities(evidence_date,variant_id);
create view public.vault_governed_inventory_observation_daily_member_location_availability with (security_barrier=true) as
select quantity.* from public.vault_inventory_observation_daily_member_location_quantities quantity
join public.vault_shopify_inventory_sync_runs run on run.id=quantity.attesting_inventory_sync_run_id and run.sync_status='current'
join public.vault_inventory_observation_governance_runs governance on governance.inventory_sync_run_id=run.id and governance.terminal_run_status='current' and governance.daily_baseline_completion_recorded and governance.expected_population_known and governance.reconciliation_state='reconciled' and governance.current_inventory_write_completed and governance.history_write_completed
join public.vault_governed_inventory_observation_daily_member_coverage member on member.attesting_inventory_sync_run_id=quantity.attesting_inventory_sync_run_id and member.evidence_date=quantity.evidence_date and member.variant_id=quantity.variant_id and member.shopify_inventory_item_id=quantity.shopify_inventory_item_id and member.canonical_mapping_status=quantity.canonical_mapping_status;
revoke all on public.vault_inventory_observation_daily_member_location_quantities from anon,authenticated;
revoke all on public.vault_governed_inventory_observation_daily_member_location_availability from anon,authenticated;
comment on table public.vault_inventory_observation_daily_member_location_quantities is 'Phase 1B7D prospective first-success daily exact signed Shopify member/location quantities from a terminally governed collection. Evidence only; no duration, demand, loss, reorder, or pack recommendation; no backfill.';
comment on view public.vault_governed_inventory_observation_daily_member_location_availability is 'Only B7D quantities whose run remains terminally governed and whose member has valid B7C governed coverage. Locations are observed locations only, not complete location coverage.';
notify pgrst,'reload schema';
