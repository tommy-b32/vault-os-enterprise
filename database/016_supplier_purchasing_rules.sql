-- ============================================================
-- VAULT OS
-- Sprint 020: Purchasing Recommendation Engine
-- Supplier Purchasing Rules
-- ============================================================

create table if not exists public.vault_supplier_purchasing_rules (
  id uuid primary key default gen_random_uuid(),

  supplier_id uuid not null
    references public.vault_suppliers(id)
    on delete cascade,

  fulfilment_model text not null default 'stocked'
    check (
      fulfilment_model in (
        'stocked',
        'dropship',
        'service'
      )
    ),

  minimum_order_packs integer null
    check (
      minimum_order_packs is null
      or minimum_order_packs >= 0
    ),

  mixed_products_allowed boolean not null default false,

  typical_order_min_packs integer null
    check (
      typical_order_min_packs is null
      or typical_order_min_packs >= 0
    ),

  typical_order_max_packs integer null
    check (
      typical_order_max_packs is null
      or typical_order_max_packs >= 0
    ),

  recommendation_enabled boolean not null default true,

  rules_confirmed boolean not null default false,

  notes text null,

  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint vault_supplier_purchasing_rules_supplier_unique
    unique (supplier_id),

  constraint vault_supplier_order_range_valid
    check (
      typical_order_min_packs is null
      or typical_order_max_packs is null
      or typical_order_max_packs >= typical_order_min_packs
    )
);

create index if not exists
  vault_supplier_purchasing_rules_model_idx
on public.vault_supplier_purchasing_rules(
  fulfilment_model
);

create or replace function
  public.set_vault_supplier_purchasing_rules_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists
  vault_supplier_purchasing_rules_updated_at
on public.vault_supplier_purchasing_rules;

create trigger
  vault_supplier_purchasing_rules_updated_at
before update
on public.vault_supplier_purchasing_rules
for each row
execute function
  public.set_vault_supplier_purchasing_rules_updated_at();


-- Exclusive:
-- Minimum 20 packs across a mixed order.
-- Typical orders are 20–40 packs.
insert into public.vault_supplier_purchasing_rules (
  supplier_id,
  fulfilment_model,
  minimum_order_packs,
  mixed_products_allowed,
  typical_order_min_packs,
  typical_order_max_packs,
  recommendation_enabled,
  rules_confirmed,
  notes
)
select
  id,
  'stocked',
  20,
  true,
  20,
  40,
  true,
  true,
  'Exclusive accepts mixed-product orders with a minimum total of 20 packs.'
from public.vault_suppliers
where lower(supplier_name) = 'exclusive'
on conflict (supplier_id) do update
set
  fulfilment_model = excluded.fulfilment_model,
  minimum_order_packs = excluded.minimum_order_packs,
  mixed_products_allowed = excluded.mixed_products_allowed,
  typical_order_min_packs = excluded.typical_order_min_packs,
  typical_order_max_packs = excluded.typical_order_max_packs,
  recommendation_enabled = excluded.recommendation_enabled,
  rules_confirmed = excluded.rules_confirmed,
  notes = excluded.notes;


-- Icon:
-- Stocked supplier, but MOQ still needs confirming.
insert into public.vault_supplier_purchasing_rules (
  supplier_id,
  fulfilment_model,
  minimum_order_packs,
  mixed_products_allowed,
  recommendation_enabled,
  rules_confirmed,
  notes
)
select
  id,
  'stocked',
  null,
  false,
  false,
  false,
  'Icon supplies tees and hoodies. Minimum-order rules have not yet been confirmed.'
from public.vault_suppliers
where lower(supplier_name) = 'icon'
on conflict (supplier_id) do update
set
  fulfilment_model = excluded.fulfilment_model,
  recommendation_enabled = excluded.recommendation_enabled,
  rules_confirmed = excluded.rules_confirmed,
  notes = excluded.notes;


-- Tony:
-- Dropship footwear only; never recommend owned-stock orders.
insert into public.vault_supplier_purchasing_rules (
  supplier_id,
  fulfilment_model,
  minimum_order_packs,
  mixed_products_allowed,
  recommendation_enabled,
  rules_confirmed,
  notes
)
select
  id,
  'dropship',
  0,
  false,
  false,
  true,
  'Tony supplies dropship footwear. Exclude from owned-stock purchase recommendations.'
from public.vault_suppliers
where lower(supplier_name) in (
  'tony',
  'tony footwear'
)
on conflict (supplier_id) do update
set
  fulfilment_model = excluded.fulfilment_model,
  minimum_order_packs = excluded.minimum_order_packs,
  mixed_products_allowed = excluded.mixed_products_allowed,
  recommendation_enabled = excluded.recommendation_enabled,
  rules_confirmed = excluded.rules_confirmed,
  notes = excluded.notes;


create or replace view
  public.vault_supplier_purchasing_readiness
as
select
  s.id as supplier_id,
  s.supplier_name,
  s.currency_code,
  s.default_lead_time_days,
  s.is_active,

  r.fulfilment_model,
  r.minimum_order_packs,
  r.mixed_products_allowed,
  r.typical_order_min_packs,
  r.typical_order_max_packs,
  r.recommendation_enabled,
  r.rules_confirmed,
  r.notes as purchasing_rule_notes,

  case
    when r.supplier_id is null
      then 'setup_required'

    when r.fulfilment_model = 'dropship'
      then 'dropship'

    when r.rules_confirmed = false
      then 'rule_incomplete'

    when r.recommendation_enabled = true
      then 'ready'

    else 'disabled'
  end as purchasing_readiness_state

from public.vault_suppliers s

left join public.vault_supplier_purchasing_rules r
  on r.supplier_id = s.id

where s.is_active = true;


notify pgrst, 'reload schema';