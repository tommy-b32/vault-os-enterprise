-- ============================================================
-- VAULT OS
-- Sprint 019.2
-- Product Cost Intelligence
-- ============================================================

create table if not exists public.vault_product_costs (

  id uuid primary key default gen_random_uuid(),

  product_id uuid not null
    references public.vault_products(id)
    on delete cascade,

  supplier_id uuid null
    references public.vault_suppliers(id)
    on delete set null,

  currency text not null default 'GBP',

  pack_cost numeric(12,2),

  units_per_pack integer,

  shipping_cost_per_pack numeric(12,2) default 0,

  import_cost_per_pack numeric(12,2) default 0,

  landed_cost_per_pack numeric(12,2),

  landed_cost_per_unit numeric(12,2),

  average_selling_price numeric(12,2),

  estimated_gross_margin numeric(12,2),

  estimated_margin_percent numeric(5,2),

  capital_efficiency_score numeric(5,2),

  return_on_capital numeric(8,2),

  last_supplier_price_update date,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint vault_product_costs_product_unique
    unique(product_id)

);

create index if not exists
vault_product_costs_supplier_idx
on public.vault_product_costs(supplier_id);

create or replace function public.set_vault_product_cost_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists
vault_product_costs_updated
on public.vault_product_costs;

create trigger
vault_product_costs_updated

before update
on public.vault_product_costs

for each row

execute function
public.set_vault_product_cost_updated_at();

insert into public.vault_product_costs (

product_id,
supplier_id

)

select

ps.product_id,
ps.supplier_id

from public.vault_product_settings ps

on conflict(product_id)
do nothing;

notify pgrst,'reload schema';