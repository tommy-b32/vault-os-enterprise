-- Canonical purchasing-wallet provenance.
-- This exposes when the financial inputs last changed without assigning a
-- freshness classification policy.

create or replace view public.vault_purchasing_wallet as
with ledger as (
  select
    coalesce(sum(amount_gbp), 0)::numeric(12, 2) as ledger_balance_gbp,
    max(updated_at) as last_updated_at
  from public.vault_cash_transactions
),
commitments as (
  select
    coalesce(
      sum(
        greatest(
          coalesce(actual_total_gbp, estimated_total_gbp, 0)
            - paid_amount_gbp,
          0
        )
      ) filter (
        where status in ('approved', 'ordered', 'part_paid', 'shipped')
      ),
      0
    )::numeric(12, 2) as committed_orders_gbp,
    max(updated_at) filter (
      where status in ('approved', 'ordered', 'part_paid', 'shipped')
    ) as last_updated_at
  from public.vault_purchase_orders
),
policy as (
  select
    protected_reserve_gbp,
    manual_spending_limit_gbp,
    reserve_override_allowed,
    updated_at
  from public.vault_purchasing_policy
  where policy_key = 'primary'
)
select
  ledger.ledger_balance_gbp,
  coalesce(policy.protected_reserve_gbp, 0)::numeric(12, 2)
    as protected_reserve_gbp,
  commitments.committed_orders_gbp,
  greatest(
    ledger.ledger_balance_gbp
      - coalesce(policy.protected_reserve_gbp, 0)
      - commitments.committed_orders_gbp,
    0
  )::numeric(12, 2) as calculated_purchasing_power_gbp,
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
  end::numeric(12, 2) as available_purchasing_power_gbp,
  policy.manual_spending_limit_gbp,
  coalesce(policy.reserve_override_allowed, false)
    as reserve_override_allowed,
  case
    when ledger.ledger_balance_gbp <= 0 then 'no_cash'
    when (
      ledger.ledger_balance_gbp
        - coalesce(policy.protected_reserve_gbp, 0)
        - commitments.committed_orders_gbp
    ) <= 0 then 'reserve_protected'
    when (
      ledger.ledger_balance_gbp
        - coalesce(policy.protected_reserve_gbp, 0)
        - commitments.committed_orders_gbp
    ) < 500 then 'limited'
    else 'healthy'
  end as purchasing_power_state,
  greatest(
    ledger.last_updated_at,
    commitments.last_updated_at,
    policy.updated_at
  ) as wallet_last_updated
from ledger
cross join commitments
left join policy on true;

notify pgrst, 'reload schema';
