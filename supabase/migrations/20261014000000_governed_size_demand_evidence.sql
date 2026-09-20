-- Phase 1B7F: immutable Shopify order-line demand facts.  This is evidence only.
create table public.vault_shopify_demand_evidence_governance (
  singleton boolean primary key default true check (singleton),
  prospective_started_at timestamptz not null default transaction_timestamp(),
  created_at timestamptz not null default now()
);
insert into public.vault_shopify_demand_evidence_governance(singleton) values (true)
on conflict (singleton) do nothing;

create table public.vault_shopify_demand_line_observations (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source = 'shopify'),
  shopify_order_id text not null,
  shopify_line_item_id text not null,
  shopify_product_id text,
  shopify_variant_id text,
  ordered_at timestamptz not null,
  source_updated_at timestamptz not null,
  observed_at timestamptz not null,
  gross_ordered_units integer not null check (gross_ordered_units >= 0),
  is_test_order boolean not null,
  financial_status text,
  fulfilment_status text,
  line_title text not null,
  variant_title text,
  sku text,
  raw_size text,
  canonical_product_id uuid references public.vault_products(id) on delete restrict,
  canonical_style_id text,
  model_design text,
  normalized_size text,
  size_domain text,
  size_system text,
  canonical_mapping_state text not null check (canonical_mapping_state in ('resolved','unresolved','ambiguous')),
  evidence_state text not null check (evidence_state in ('prospective_governed_resolved','prospective_unresolved','legacy_current_mapping_qualified','legacy_unresolved','excluded_test_order')),
  identity_resolver_version text not null default 'shopify-option-roles-v1',
  identity_observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (source, shopify_line_item_id),
  check ((canonical_mapping_state = 'resolved') = (canonical_product_id is not null and canonical_style_id is not null and model_design is not null and normalized_size is not null))
);
create index vault_shopify_demand_line_observations_style_time_idx on public.vault_shopify_demand_line_observations(canonical_style_id, normalized_size, ordered_at) where canonical_mapping_state='resolved' and not is_test_order;

create table public.vault_shopify_demand_lifecycle_adjustments (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source = 'shopify'),
  source_event_key text not null,
  adjustment_type text not null check (adjustment_type in ('refund','whole_order_cancellation')),
  shopify_order_id text not null,
  shopify_line_item_id text not null,
  shopify_refund_id text,
  shopify_refund_line_item_id text,
  occurred_at timestamptz not null,
  adjusted_units integer not null check (adjusted_units >= 0),
  adjusted_amount numeric(14,2),
  source_observed_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source, source_event_key)
);
create index vault_shopify_demand_adjustments_line_idx on public.vault_shopify_demand_lifecycle_adjustments(source, shopify_line_item_id);

create function public.prevent_vault_shopify_demand_evidence_mutation() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Shopify demand evidence is immutable'; end; $$;
create trigger vault_shopify_demand_lines_immutable before update or delete on public.vault_shopify_demand_line_observations for each row execute function public.prevent_vault_shopify_demand_evidence_mutation();
create trigger vault_shopify_demand_adjustments_immutable before update or delete on public.vault_shopify_demand_lifecycle_adjustments for each row execute function public.prevent_vault_shopify_demand_evidence_mutation();

create view public.vault_governed_size_demand_evidence with (security_barrier=true) as
with adjustments as (
 select source,shopify_line_item_id,
   coalesce(sum(adjusted_units) filter(where adjustment_type='whole_order_cancellation'),0)::integer cancelled_units,
   coalesce(sum(adjusted_units) filter(where adjustment_type='refund'),0)::integer refunded_units
 from public.vault_shopify_demand_lifecycle_adjustments group by source,shopify_line_item_id
)
select d.*, coalesce(a.cancelled_units,0)::integer cancelled_units, coalesce(a.refunded_units,0)::integer refunded_units,
 greatest(d.gross_ordered_units-coalesce(a.cancelled_units,0)-coalesce(a.refunded_units,0),0)::integer net_retained_units,
 case when upper(coalesce(d.financial_status,'')) in ('PAID','PARTIALLY_PAID','PARTIALLY_REFUNDED','REFUNDED') then 'financially_qualified' else 'financially_pending_or_unresolved' end financial_qualification,
 case when upper(coalesce(d.financial_status,'')) in ('PAID','PARTIALLY_PAID','PARTIALLY_REFUNDED','REFUNDED') then greatest(d.gross_ordered_units-coalesce(a.cancelled_units,0)-coalesce(a.refunded_units,0),0) else 0 end::integer financially_qualified_net_retained_units
from public.vault_shopify_demand_line_observations d left join adjustments a using(source,shopify_line_item_id)
where not d.is_test_order and d.canonical_mapping_state='resolved';

revoke all on public.vault_shopify_demand_evidence_governance, public.vault_shopify_demand_line_observations, public.vault_shopify_demand_lifecycle_adjustments, public.vault_governed_size_demand_evidence from anon, authenticated;
comment on table public.vault_shopify_demand_line_observations is 'B7F immutable order-line observations. No availability, suppressed demand, lost sales, reorder, or pack inference.';
comment on view public.vault_governed_size_demand_evidence is 'Resolved, non-test B7F factual demand only. Net retained is lifecycle arithmetic; financially qualified retained units require PAID, PARTIALLY_PAID, PARTIALLY_REFUNDED, or REFUNDED.';
notify pgrst, 'reload schema';
