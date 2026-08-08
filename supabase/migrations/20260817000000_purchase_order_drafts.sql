alter table public.vault_purchase_orders
  add column if not exists created_by_operator_id uuid null
    references public.vault_operators(id)
    on delete restrict,

  add column if not exists idempotency_key text null,

  add column if not exists source_snapshot jsonb not null default '{}'::jsonb;

create unique index if not exists
  vault_purchase_orders_operator_idempotency_unique
on public.vault_purchase_orders(created_by_operator_id, idempotency_key)
where idempotency_key is not null;


create table if not exists public.vault_purchase_order_lines (
  id uuid primary key default gen_random_uuid(),

  purchase_order_id uuid not null
    references public.vault_purchase_orders(id)
    on delete cascade,

  supplier_id uuid not null
    references public.vault_suppliers(id)
    on delete restrict,

  style_id text not null,

  product_name text not null,

  recommended_packs integer not null
    check (recommended_packs > 0),

  recommended_units integer null
    check (
      recommended_units is null
      or recommended_units >= 0
    ),

  units_per_pack integer null
    check (
      units_per_pack is null
      or units_per_pack > 0
    ),

  product_moq_packs integer null
    check (
      product_moq_packs is null
      or product_moq_packs >= 0
    ),

  pack_cost_gbp numeric(12, 2) null
    check (
      pack_cost_gbp is null
      or pack_cost_gbp >= 0
    ),

  line_cost_gbp numeric(12, 2) null
    check (
      line_cost_gbp is null
      or line_cost_gbp >= 0
    ),

  expected_profit_gbp numeric(12, 2) null,

  recommendation_confidence numeric(5, 2) null
    check (
      recommendation_confidence is null
      or recommendation_confidence between 0 and 100
    ),

  recommendation_priority text null,

  source_recommendation_type text not null default 'advisor',

  source_snapshot jsonb not null default '{}'::jsonb,

  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  unique (purchase_order_id, style_id)
);

create index if not exists
  vault_purchase_order_lines_purchase_order_idx
on public.vault_purchase_order_lines(purchase_order_id);

create index if not exists
  vault_purchase_order_lines_supplier_idx
on public.vault_purchase_order_lines(supplier_id);


drop trigger if exists
  vault_purchase_order_lines_updated_at
on public.vault_purchase_order_lines;

create trigger vault_purchase_order_lines_updated_at
before update on public.vault_purchase_order_lines
for each row
execute function public.set_vault_commercial_updated_at();


alter table public.vault_purchase_orders enable row level security;
alter table public.vault_purchase_order_lines enable row level security;

drop policy if exists
  "Active operators can read purchase orders"
on public.vault_purchase_orders;

create policy
  "Active operators can read purchase orders"
on public.vault_purchase_orders
for select
to authenticated
using (
  exists (
    select 1
    from public.vault_operators operator
    where operator.id = (select auth.uid())
      and operator.is_active
  )
);

drop policy if exists
  "Active operators can read purchase order lines"
on public.vault_purchase_order_lines;

create policy
  "Active operators can read purchase order lines"
on public.vault_purchase_order_lines
for select
to authenticated
using (
  exists (
    select 1
    from public.vault_operators operator
    where operator.id = (select auth.uid())
      and operator.is_active
  )
);

revoke insert, update, delete
on public.vault_purchase_orders
from anon, authenticated;

revoke insert, update, delete
on public.vault_purchase_order_lines
from anon, authenticated;

grant select
on public.vault_purchase_orders,
   public.vault_purchase_order_lines
to authenticated;