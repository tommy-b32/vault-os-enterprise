-- Stage 4A: a planning budget is deliberately separate from the cash-backed purchasing wallet.
create table public.vault_stock_purchasing_budget (
  id boolean primary key default true check (id),
  currency_code text not null default 'GBP' check (currency_code = 'GBP'),
  budget_gbp numeric(12,2) not null check (budget_gbp >= 0),
  updated_at timestamptz not null default now(),
  updated_by_operator_id uuid not null references public.vault_operators(id)
);

alter table public.vault_stock_purchasing_budget enable row level security;
revoke all on public.vault_stock_purchasing_budget from anon, authenticated;
grant select, insert, update on public.vault_stock_purchasing_budget to service_role;

create or replace function public.touch_vault_stock_purchasing_budget()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger vault_stock_purchasing_budget_touch
before update on public.vault_stock_purchasing_budget
for each row execute function public.touch_vault_stock_purchasing_budget();

comment on table public.vault_stock_purchasing_budget is
  'Single manually controlled GBP planning budget. It is independent of cash and the purchasing wallet.';
