-- ============================================================
-- VAULT OS
-- Sprint 017: Product Master Settings
-- ============================================================

create table if not exists public.vault_product_settings (
  id uuid primary key default gen_random_uuid(),

  product_id uuid not null
    references public.vault_products(id)
    on delete cascade,

  supplier_id uuid null
    references public.vault_suppliers(id)
    on delete set null,

  inventory_strategy text not null default 'stocked'
    check (
      inventory_strategy in (
        'stocked',
        'do_not_restock',
        'discontinued',
        'dropship',
        'service'
      )
    ),

  restock_enabled boolean not null default true,

  pack_profile text null
    check (
      pack_profile is null
      or pack_profile in (
        'tee_5_piece',
        'polo_6_piece',
        'hoodie',
        'custom'
      )
    ),

  supplier_moq_packs integer null
    check (
      supplier_moq_packs is null
      or supplier_moq_packs >= 0
    ),

  target_stock_days integer null
    check (
      target_stock_days is null
      or target_stock_days >= 0
    ),

  decision_reason text null,
  notes text null,

  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint vault_product_settings_product_unique
    unique (product_id)
);

create index if not exists
  vault_product_settings_supplier_idx
on public.vault_product_settings(supplier_id);

create index if not exists
  vault_product_settings_strategy_idx
on public.vault_product_settings(inventory_strategy);

create or replace function public.set_vault_product_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists
  vault_product_settings_updated_at
on public.vault_product_settings;

create trigger vault_product_settings_updated_at
before update on public.vault_product_settings
for each row
execute function public.set_vault_product_settings_updated_at();

insert into public.vault_product_settings (
  product_id,
  inventory_strategy,
  restock_enabled
)
select
  p.id,
  case
    when lower(coalesce(p.product_type, '')) = 'service'
      then 'service'
    when p.title ilike 'LVE Mono%'
      then 'dropship'
    else 'stocked'
  end,
  case
    when lower(coalesce(p.product_type, '')) = 'service'
      then false
    when p.title ilike 'LVE Mono%'
      then false
    else true
  end
from public.vault_products p
on conflict (product_id) do nothing;

create or replace view public.vault_product_master as
select
  p.id as product_id,
  p.title as product_name,
  p.handle,
  p.vendor,
  p.product_type,
  p.status,

  s.id as supplier_id,
  s.supplier_name as supplier_company,

  ps.inventory_strategy,
  ps.restock_enabled,
  ps.pack_profile,
  ps.supplier_moq_packs,
  ps.target_stock_days,
  ps.decision_reason,
  ps.notes,
  ps.updated_at as settings_updated_at

from public.vault_products p

left join public.vault_product_settings ps
  on ps.product_id = p.id

left join public.vault_suppliers s
  on s.id = ps.supplier_id;