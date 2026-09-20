# B7F controlled historical backfill: transaction-safe operator procedure

This runbook is for the post-`20261016000000_b7f_historical_backfill_runner_transaction_safety.sql` deployment only. It does not initialise a job, retry a window, or run automatically.

## Required execution mode

Use the Supabase SQL Editor connected as the database-admin `postgres` role. Execute exactly one top-level statement per invocation. Do not put the `CALL` inside `BEGIN`/`COMMIT`, a `DO` block, another function, a transaction-capable client wrapper, or a multi-operation script.

```sql
call public.advance_b7f_historical_backfill_job_safely();
```

The procedure deliberately attempts `COMMIT` before it reads or changes runner state. PostgreSQL rejects the call when it is inside an explicit transaction, so it cannot return `adopted` or `submitted` in a transaction that the caller may subsequently roll back.

The returned row is the receipt. Before any further operator action, inspect only the durable status view:

```sql
select
  status,
  next_window_start,
  active_window_id,
  active_created_from,
  active_created_before,
  active_state,
  pg_net_request_id,
  attempt_count,
  failure_reason
from public.vault_b7f_historical_backfill_status
where job_key = 'b7f-2026-historical-demand';
```

Expected boundaries remain 2026-01-01T00:00:00Z through exclusive 2026-09-20T09:34:53.489Z in 168-hour windows, with a shortened final window. A `submitted` receipt is durable before `pg_net` can dispatch. A `pending`, `submitted`, or `uncertain` active window prevents a blind replay.

Do not query `net.http_request_queue`: it may contain authorization headers. `net._http_response` may be inspected by request ID for non-secret response metadata/body only. A missing response after the grace period produces `uncertain`; do not retry it automatically. Retry remains an explicit separately reviewed action.

No credentials are supplied to this command or returned by it. Vault decryption occurs only within the database during the submission phase.

## Adoption-only receipt advancement

Where exact completed historical receipts already exist, the database-admin `postgres` operator may execute this single top-level statement:

```sql
call public.adopt_b7f_historical_backfill_receipts_safely();
```

It never calls Shopify, `pg_net`, Vault, or the normal advance procedure. It adopts only consecutive exact `historical_orders_by_created_at` receipts and stops successfully before the first missing receipt. As with normal advance, never wrap it in `BEGIN`/`COMMIT`.
