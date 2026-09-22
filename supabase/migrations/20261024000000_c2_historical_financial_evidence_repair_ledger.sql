-- C2 historical financial evidence repair ledger.  It never changes C2 evidence or governance.
create table public.vault_c2_historical_financial_repair_runs (
  id uuid primary key default gen_random_uuid(),
  created_from timestamptz not null,
  created_before timestamptz not null,
  execution_mode text not null check (execution_mode in ('dry_run','write')),
  state text not null check (state in ('completed','failed')),
  started_at timestamptz not null,
  completed_at timestamptz,
  orders_scanned integer not null default 0 check (orders_scanned >= 0 and orders_scanned <= 50),
  applications_found integer not null default 0 check (applications_found >= 0),
  allocations_found integer not null default 0 check (allocations_found >= 0),
  refunds_found integer not null default 0 check (refunds_found >= 0),
  refund_lines_found integer not null default 0 check (refund_lines_found >= 0),
  refund_transactions_found integer not null default 0 check (refund_transactions_found >= 0),
  would_insert_count integer not null default 0 check (would_insert_count >= 0),
  no_op_count integer not null default 0 check (no_op_count >= 0),
  conflict_count integer not null default 0 check (conflict_count >= 0),
  error_code text,
  check (created_from < created_before),
  check (created_before - created_from <= interval '7 days'),
  check ((state = 'completed' and completed_at is not null and error_code is null) or (state = 'failed' and completed_at is not null and error_code is not null))
);
create index vault_c2_historical_financial_repair_runs_bounds_idx on public.vault_c2_historical_financial_repair_runs(created_from, created_before, started_at desc);
alter table public.vault_c2_historical_financial_repair_runs enable row level security;
revoke all on public.vault_c2_historical_financial_repair_runs from public, anon, authenticated;
grant select, insert on public.vault_c2_historical_financial_repair_runs to service_role;
comment on table public.vault_c2_historical_financial_repair_runs is 'C2-only bounded historical reconstruction audit ledger. Dry runs record audit receipts only; evidence remains governed by record_shopify_financial_evidence.';
notify pgrst, 'reload schema';
