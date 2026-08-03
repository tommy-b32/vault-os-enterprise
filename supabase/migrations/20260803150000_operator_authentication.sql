-- Vault OS operator authorization and immutable finance attribution.

create table if not exists public.vault_operators (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text null,
  role text not null check (role in ('owner', 'operator', 'viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vault_operators_email_unique_idx
  on public.vault_operators (lower(email));
create index if not exists vault_operators_active_role_idx
  on public.vault_operators (is_active, role);

alter table public.vault_operators enable row level security;

drop policy if exists "Operators can read their own profile" on public.vault_operators;
create policy "Operators can read their own profile"
  on public.vault_operators
  for select
  to authenticated
  using (id = (select auth.uid()));

revoke insert, update, delete on public.vault_operators from anon, authenticated;
grant select on public.vault_operators to authenticated;

alter table public.vault_cash_transactions
  add column if not exists created_by_operator_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vault_cash_transactions_created_by_operator_fk'
  ) then
    alter table public.vault_cash_transactions
      add constraint vault_cash_transactions_created_by_operator_fk
      foreign key (created_by_operator_id)
      references public.vault_operators(id)
      on delete set null;
  end if;
end $$;

create index if not exists vault_cash_transactions_created_by_operator_idx
  on public.vault_cash_transactions (created_by_operator_id)
  where created_by_operator_id is not null;

-- Finance remains service-role-only. Do not grant browser table access.
revoke all on public.vault_cash_accounts from anon, authenticated;
revoke all on public.vault_cash_transactions from anon, authenticated;
revoke all on public.vault_purchasing_policy from anon, authenticated;
revoke all on public.vault_purchasing_wallet from anon, authenticated;

create or replace function public.set_vault_operator_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vault_operators_updated_at on public.vault_operators;
create trigger vault_operators_updated_at
before update on public.vault_operators
for each row execute function public.set_vault_operator_updated_at();
