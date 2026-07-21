-- ============================================================
-- VAULT OS
-- Sprint 019: Commercial Intelligence
-- Purchasing Wallet and Cash Ledger Foundation
-- ============================================================


-- ============================================================
-- 1. CASH ACCOUNTS
-- ============================================================

create table if not exists public.vault_cash_accounts (
  id uuid primary key default gen_random_uuid(),

  account_name text not null,
  account_type text not null default 'business'
    check (
      account_type in (
        'business',
        'cash',
        'payment_processor',
        'other'
      )
    ),

  currency text not null default 'GBP',
  is_active boolean not null default true,

  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint vault_cash_accounts_name_unique
    unique (account_name)
);


-- ============================================================
-- 2. CASH TRANSACTION LEDGER
--
-- Positive amount = money into the business.
-- Negative amount = money leaving the business.
-- ============================================================

create table if not exists public.vault_cash_transactions (
  id uuid primary key default gen_random_uuid(),

  account_id uuid not null
    references public.vault_cash_accounts(id)
    on delete restrict,

  transaction_date date not null default current_date,

  transaction_type text not null
    check (
      transaction_type in (
        'opening_balance',
        'income',
        'expense',
        'transfer_in',
        'transfer_out',
        'supplier_payment',
        'refund',
        'adjustment'
      )
    ),

  category text not null,

  description text not null,

  amount_gbp numeric(12, 2) not null
    check (amount_gbp <> 0),

  supplier_id uuid null
    references public.vault_suppliers(id)
    on delete set null,

  reference text null,
  notes text null,

  source text not null default 'manual'
    check (
      source in (
        'manual',
        'historical_import',
        'shopify',
        'purchase_order',
        'system'
      )
    ),

  external_id text null,

  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists
  vault_cash_transactions_account_idx
on public.vault_cash_transactions(account_id);

create index if not exists
  vault_cash_transactions_date_idx
on public.vault_cash_transactions(transaction_date desc);

create index if not exists
  vault_cash_transactions_category_idx
on public.vault_cash_transactions(category);

create index if not exists
  vault_cash_transactions_supplier_idx
on public.vault_cash_transactions(supplier_id);

create unique index if not exists
  vault_cash_transactions_external_unique_idx
on public.vault_cash_transactions(source, external_id)
where external_id is not null;


-- ============================================================
-- 3. PURCHASING POLICY
--
-- A single active policy controls the reserve and optional
-- spending limit used by Vault Brain.
-- ============================================================

create table if not exists public.vault_purchasing_policy (
  policy_key text primary key default 'primary',

  protected_reserve_gbp numeric(12, 2) not null default 0
    check (protected_reserve_gbp >= 0),

  manual_spending_limit_gbp numeric(12, 2) null
    check (
      manual_spending_limit_gbp is null
      or manual_spending_limit_gbp >= 0
    ),

  reserve_override_allowed boolean not null default false,

  notes text null,

  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint vault_purchasing_policy_primary_only
    check (policy_key = 'primary')
);


-- ============================================================
-- 4. PURCHASE ORDERS
-- ============================================================

create table if not exists public.vault_purchase_orders (
  id uuid primary key default gen_random_uuid(),

  supplier_id uuid not null
    references public.vault_suppliers(id)
    on delete restrict,

  order_reference text null,

  status text not null default 'draft'
    check (
      status in (
        'draft',
        'recommended',
        'approved',
        'ordered',
        'part_paid',
        'paid',
        'shipped',
        'received',
        'cancelled'
      )
    ),

  currency text not null default 'GBP',

  estimated_total_gbp numeric(12, 2) null
    check (
      estimated_total_gbp is null
      or estimated_total_gbp >= 0
    ),

  actual_total_gbp numeric(12, 2) null
    check (
      actual_total_gbp is null
      or actual_total_gbp >= 0
    ),

  paid_amount_gbp numeric(12, 2) not null default 0
    check (paid_amount_gbp >= 0),

  total_packs integer null
    check (
      total_packs is null
      or total_packs >= 0
    ),

  recommended_by_vault_brain boolean not null default false,

  recommendation_confidence numeric(5, 2) null
    check (
      recommendation_confidence is null
      or recommendation_confidence between 0 and 100
    ),

  reasoning text null,
  notes text null,

  approved_at timestamp with time zone null,
  ordered_at timestamp with time zone null,
  received_at timestamp with time zone null,

  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists
  vault_purchase_orders_supplier_idx
on public.vault_purchase_orders(supplier_id);

create index if not exists
  vault_purchase_orders_status_idx
on public.vault_purchase_orders(status);


-- ============================================================
-- 5. UPDATED-AT TRIGGER
-- ============================================================

create or replace function public.set_vault_commercial_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists
  vault_cash_accounts_updated_at
on public.vault_cash_accounts;

create trigger vault_cash_accounts_updated_at
before update on public.vault_cash_accounts
for each row
execute function public.set_vault_commercial_updated_at();


drop trigger if exists
  vault_cash_transactions_updated_at
on public.vault_cash_transactions;

create trigger vault_cash_transactions_updated_at
before update on public.vault_cash_transactions
for each row
execute function public.set_vault_commercial_updated_at();


drop trigger if exists
  vault_purchasing_policy_updated_at
on public.vault_purchasing_policy;

create trigger vault_purchasing_policy_updated_at
before update on public.vault_purchasing_policy
for each row
execute function public.set_vault_commercial_updated_at();


drop trigger if exists
  vault_purchase_orders_updated_at
on public.vault_purchase_orders;

create trigger vault_purchase_orders_updated_at
before update on public.vault_purchase_orders
for each row
execute function public.set_vault_commercial_updated_at();


-- ============================================================
-- 6. CREATE PRIMARY BUSINESS ACCOUNT
-- ============================================================

insert into public.vault_cash_accounts (
  account_name,
  account_type,
  currency,
  is_active
)
values (
  'The Fabric Vault Business Cash',
  'business',
  'GBP',
  true
)
on conflict (account_name) do nothing;


-- ============================================================
-- 7. CREATE PRIMARY PURCHASING POLICY
--
-- Reserve starts at £0 until Tom chooses the amount.
-- ============================================================

insert into public.vault_purchasing_policy (
  policy_key,
  protected_reserve_gbp,
  manual_spending_limit_gbp,
  reserve_override_allowed,
  notes
)
values (
  'primary',
  0,
  null,
  false,
  'Primary purchasing policy for Vault Brain.'
)
on conflict (policy_key) do nothing;


-- ============================================================
-- 8. OPENING LEDGER BALANCE
--
-- This is the mathematically calculated balance supplied by Tom.
-- The unique external ID prevents duplicate insertion if this
-- migration is run again.
-- ============================================================

insert into public.vault_cash_transactions (
  account_id,
  transaction_date,
  transaction_type,
  category,
  description,
  amount_gbp,
  source,
  external_id,
  notes
)
select
  account.id,
  current_date,
  'opening_balance',
  'Opening balance',
  'Calculated opening balance before Vault OS ledger',
  2101.56,
  'historical_import',
  'vault-ledger-opening-balance-2101-56',
  'Opening balance calculated from the historical cash record supplied by Tom.'
from public.vault_cash_accounts account
where account.account_name = 'The Fabric Vault Business Cash'
on conflict (source, external_id)
where external_id is not null
do nothing;


-- ============================================================
-- 9. PURCHASING WALLET VIEW
-- ============================================================

create or replace view public.vault_purchasing_wallet as

with ledger as (
  select
    coalesce(sum(amount_gbp), 0)::numeric(12, 2)
      as ledger_balance_gbp
  from public.vault_cash_transactions
),

commitments as (
  select
    coalesce(
      sum(
        greatest(
          coalesce(
            actual_total_gbp,
            estimated_total_gbp,
            0
          ) - paid_amount_gbp,
          0
        )
      ) filter (
        where status in (
          'approved',
          'ordered',
          'part_paid',
          'shipped'
        )
      ),
      0
    )::numeric(12, 2) as committed_orders_gbp
  from public.vault_purchase_orders
),

policy as (
  select
    protected_reserve_gbp,
    manual_spending_limit_gbp,
    reserve_override_allowed
  from public.vault_purchasing_policy
  where policy_key = 'primary'
)

select
  ledger.ledger_balance_gbp,

  coalesce(
    policy.protected_reserve_gbp,
    0
  )::numeric(12, 2) as protected_reserve_gbp,

  commitments.committed_orders_gbp,

  greatest(
    ledger.ledger_balance_gbp
    - coalesce(policy.protected_reserve_gbp, 0)
    - commitments.committed_orders_gbp,
    0
  )::numeric(12, 2)
    as calculated_purchasing_power_gbp,

  case
    when policy.manual_spending_limit_gbp is null then
      greatest(
        ledger.ledger_balance_gbp
        - coalesce(policy.protected_reserve_gbp, 0)
        - commitments.committed_orders_gbp,
        0
      )

    else least(
      policy.manual_spending_limit_gbp,
      greatest(
        ledger.ledger_balance_gbp
        - coalesce(policy.protected_reserve_gbp, 0)
        - commitments.committed_orders_gbp,
        0
      )
    )
  end::numeric(12, 2)
    as available_purchasing_power_gbp,

  policy.manual_spending_limit_gbp,
  coalesce(
    policy.reserve_override_allowed,
    false
  ) as reserve_override_allowed,

  case
    when ledger.ledger_balance_gbp <= 0
      then 'no_cash'

    when (
      ledger.ledger_balance_gbp
      - coalesce(policy.protected_reserve_gbp, 0)
      - commitments.committed_orders_gbp
    ) <= 0
      then 'reserve_protected'

    when (
      ledger.ledger_balance_gbp
      - coalesce(policy.protected_reserve_gbp, 0)
      - commitments.committed_orders_gbp
    ) < 500
      then 'limited'

    else 'healthy'
  end as purchasing_power_state

from ledger
cross join commitments
left join policy on true;


notify pgrst, 'reload schema';