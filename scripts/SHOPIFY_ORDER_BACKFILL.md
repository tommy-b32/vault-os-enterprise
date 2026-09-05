# Controlled production Shopify order backfill

Prepared only: no backfill, function invocation, deployment, credential change or production write was performed while preparing this runbook.

## Scope and release gate

Use the existing `shopify-order-sync` function and canonical `upsertShopifyOrder` implementation. No new function, migration, table, schedule or alternate accounting path is required. The historical-mode hardening in this change **must be reviewed and released to the existing function under separate authorization before executing this runbook**. The repository working copy alone does not update the production function. Do not push or release the calendar-revenue commit as part of this procedure.

Pinned interval: **[2026-01-01T00:00:00.000Z, 2026-09-05T11:00:00.000Z)**. Never change this reference on resume. This is a creation-time cutoff, not an accounting snapshot: current refunds, cancellations and order edits are read when each window runs. Orders created at or after the cutoff remain the normal reconciliation's responsibility.

The previously verified earliest accessible Shopify order was 2026-05-03T12:06:22Z; canonical history began on 9 June. Do not assume January–April are missing sales: verify those periods are empty in Shopify. Do not skip empty windows without recording their verified completion.

## Bounds, idempotency and privacy

- Seven-day, inclusive-start/exclusive-end windows, last window shortened to the pinned cutoff. This plan has 36 windows. One window per runner execution by default; explicit `--max-windows` supports 1–10 sequential windows, never parallel ones.
- Every historical window verifies `read_orders` and `read_all_orders` on the Edge Function's active token before fetching orders. A stale cached token with missing scope fails closed, even if a separate installation verifier acquired a newer token. This preparation does not force token refresh or rotate credentials.
- Historical GraphQL pages request one order at a time because each order includes nested lines/refunds. Cursor pagination stops at 50 pages/orders, detects repeated cursors, and has a 60-second read budget. A window exceeding a limit fails before any upserts. Reduce the window instead of raising limits.
- At most four read attempts per GraphQL page, 10-second request timeout, exponential backoff, Shopify cost restoration and `Retry-After` handling; a required wait over 15 seconds or past the window deadline stops the read. Permanent permission/query errors stop immediately. No automatic retry of the mutating Edge Function invocation.
- Historical reads request at most 50 lines per order and 25 lines per refund to bound nested query cost; normal reads retain their existing 250/100 limits. Historical pagination flags are checked. Exceeding either fails closed; do not claim completion or bypass these checks. Such a case needs a separately reviewed nested-pagination enhancement.
- `net_revenue` remains Shopify `currentTotalPriceSet`; `refunds` remains `totalRefundedSet`. Never subtract order refunds again. Cancellation timestamps and `metadata.test` are retained; both cancelled and test orders are imported and then excluded by the repository's existing eligibility rules.
- Orders conflict on `(source, shopify_order_id)`; lines conflict on `(source, shopify_line_item_id)`. Replaying a failed window updates existing rows and repairs failed line writes. It does not duplicate canonical rows, although repeated successful runs append additional sync-run/refresh-event records. The order/line writes are not a single transaction.
- Historical queries omit customer names, emails and customer IDs, and the historical upsert omits those columns so existing values are not cleared. No complete Shopify responses are persisted. Existing canonical product/line fields, checkout token and order metadata remain as defined by the canonical writer.
- Checkpoints contain only the fixed endpoint, date bounds, aggregate counts, completion timestamps and a pending-window marker. Keep the checkpoint outside the repository and in an operator-controlled directory. Never put tokens, order IDs, customer data or raw response bodies in it.

Shopify documents calculated query costs and restoration in its [API limits](https://shopify.dev/docs/api/usage/limits); exact upstream counts are available through [ordersCount](https://shopify.dev/docs/api/admin-graphql/latest/queries/orderscount).

## 1. Dry verification (no order writes)

1. Confirm the separately authorized historical-mode release is present in production. Confirm no other backfill runner is active, and inspect the normal reconciliation's recent successful runs. Do not disable, alter or invoke the ten-minute schedule.
2. Use the existing installation verifier with its output captured, rather than printing its installation identifiers. Require `read_all_orders` and `read_orders`; verify that the production installation is the intended one. Do not rotate or save credentials.
3. With the existing approved Admin API token, execute this read-only GraphQL query against the configured store's `/admin/api/2026-07/graphql.json`, using `X-Shopify-Access-Token` from protected process memory. Run it for the full interval and each planned window. Keep only the dates and exact counts; require `precision: EXACT`. Do not print the token or raw errors.

```graphql
query BackfillCoverage($query: String!) {
  ordersCount(query: $query, limit: null) { count precision }
  earliest: orders(first: 1, sortKey: CREATED_AT, query: $query) {
    nodes { createdAt }
  }
  latest: orders(first: 1, sortKey: CREATED_AT, reverse: true, query: $query) {
    nodes { createdAt }
  }
}
```

Full-range variables:

```json
{"query":"created_at:>=2026-01-01T00:00:00.000Z created_at:<2026-09-05T11:00:00.000Z"}
```

If any window contains more than 50 orders, use a new plan/checkpoint with `--window-hours 24` (or 1) for the **entire** interval. Preflight that plan again. Check line/refund pagination limits before execution if the store has large orders. Do not filter out cancellations, refunded orders or test orders in upstream completeness counts.

4. Record an aggregate canonical baseline with a read-only SQL connection:

```sql
begin transaction read only;
select count(*) as all_orders,
       min(shopify_created_at) as earliest,
       max(shopify_created_at) as latest,
       count(*) filter (where cancelled_at is null and metadata->>'test' = 'false') as eligible,
       count(*) filter (where cancelled_at is not null) as cancelled,
       count(*) filter (where refunds > 0) as refunded,
       count(*) filter (where metadata->>'test' = 'true') as test_orders,
       count(*) filter (where metadata->>'test' is null or net_revenue is null or refunds is null) as missing_accounting_fields
from public.vault_shopify_orders
where shopify_created_at >= '2026-01-01T00:00:00Z'
  and shopify_created_at < '2026-09-05T11:00:00Z';
select count(*) as lines, count(*) filter (where l.refunded_quantity > 0) as refunded_lines
from public.vault_shopify_order_lines l
join public.vault_shopify_orders o on o.id = l.order_id
where o.shopify_created_at >= '2026-01-01T00:00:00Z'
  and o.shopify_created_at < '2026-09-05T11:00:00Z';
commit;
```

5. From the repository root, run the offline planner. It does not load credentials, make HTTP requests or write a checkpoint:

```powershell
node scripts/shopify-order-backfill.mjs --through 2026-09-05T11:00:00Z
```

## 2. Authenticated invocation (future authorized execution only)

The gateway has `verify_jwt = true`. Supply `SUPABASE_EDGE_JWT` as the existing approved gateway-compatible JWT (not an `sb_secret_...` API key), and `VAULT_ORDER_SYNC_SECRET` as the existing function secret, via the operator's protected process environment. Do not place literal credentials in commands, files, shell history or logs. The runner does not exchange, refresh or rotate these credentials.

Run exactly one bounded window and review its receipt:

```powershell
node scripts/shopify-order-backfill.mjs --through 2026-09-05T11:00:00Z --checkpoint "$env:TEMP\vault-shopify-backfill-20260905T110000Z.json" --max-windows 1 --execute
```

Repeat the **same command** to advance one window at a time. Use the same operator/machine/checkpoint. Inspect normal reconciliation health between runs; allow a scheduled reconciliation to finish before moving to the next batch if it is delayed. Do not launch a second operator's runner; the local lock cannot coordinate separate machines or different checkpoint paths.

The exact first authenticated request produced is:

```http
POST https://mzrimaqjyrvtbpaeyooe.supabase.co/functions/v1/shopify-order-sync
Authorization: Bearer <SUPABASE_EDGE_JWT from protected environment>
x-vault-sync-secret: <VAULT_ORDER_SYNC_SECRET from protected environment>
Content-Type: application/json

{"created_from":"2026-01-01T00:00:00.000Z","created_before":"2026-01-08T00:00:00.000Z"}
```

Prefer the runner over manual requests: it records pending state before sending and advances only after a successful historical-mode response echoes both exact bounds and valid aggregate counts. A 120-second client timeout does not cancel server work. It leaves the window pending.

## 3. Monitoring and stop conditions

After every window, review only `completed_windows`, `total_windows`, bounds, order/line counts and completion time. Confirm its count agrees with upstream's exact count for those bounds. Stop on any mismatch, rejected receipt, throttle exhaustion, query cost error, nested-line limit, missing scope, database error, timeout or delayed normal reconciliation. Do not treat HTTP 200 alone as completion.

Inspect aggregate sync health using a read-only SQL connection:

```sql
begin transaction read only;
select sync_mode, count(*) as completed_runs,
       max(completed_at) as latest_completion,
       sum(orders_synced) as order_upserts,
       sum(order_lines_synced) as line_upserts
from public.vault_shopify_order_sync_runs
where completed_at >= '2026-09-05T11:00:00Z'
group by sync_mode;
commit;
```

Sync-run counts are **upserts, not distinct orders**. The existing sync-run table does not record exact historical bounds; retain the local checkpoint as the range audit. Do not infer completeness from the latest freshness timestamp: historical imports also update that timestamp.

## 4. Completeness and accounting acceptance

1. Require all 36 windows (or every window of the smaller plan) to have receipts, with no pending window and the final upper bound exactly matching the pinned cutoff.
2. Repeat the upstream full-range/per-window exact counts and aggregate SQL baseline. Canonical **all-order** counts must equal Shopify's for every window, including cancelled/test orders; the earliest date should agree with Shopify (previously 3 May). Verify empty January–April periods against Shopify instead of claiming missing orders. Do not compare eligible database counts to unfiltered Shopify counts.
3. Validate current order/line content with a read-only, in-memory comparison using Shopify IDs only as internal matching keys. Cursor-page the same canonical fields, retrieve matching canonical rows, and emit only aggregate mismatch counts: missing/extra orders, missing/extra lines, changed `shopify_updated_at`, `cancelled_at`, test flags, currencies, `currentTotalPriceSet` versus `net_revenue`, `totalRefundedSet` versus `refunds`, refunded quantities and canonical line-net amounts. Require zero mismatches; never persist or print per-order data or complete responses. Count equality alone is necessary but insufficient.
4. The canonical writer is last-write-wins and order/line writes are nontransactional. A concurrent webhook/reconciliation can race a historical snapshot. After the final window, allow the **normal scheduled reconciliation** to finish successfully (do not trigger or reschedule it), then repeat comparisons. If an order changes during comparison, repeat its containing window after the prior invocation has ended and compare again. Current refund values may legitimately differ from the pinned creation cutoff's historical values.
5. Check canonical net totals grouped by currency with exactly `cancelled_at is null and metadata->>'test' = 'false'`; compare to the same eligible Shopify snapshots in memory. Do not combine currencies or subtract refunds again. Do not publish raw transactions. An incomplete nested-line import, outdated cancellation/refund value or missing order blocks acceptance.

Only after these checks may the retained 2026 history be called complete **through the pinned creation cutoff**. Later-created orders are outside this backfill. This procedure does not push/deploy the calendar-revenue UI commit.

## 5. Recovery

- On a failure, the checkpoint stays at the last acknowledged window and retains the pending window. Inspect sanitized server status and confirm the prior invocation has terminated. Wait at least ten minutes from its recorded start; then explicitly repeat the same command with `--retry-uncertain`. This re-fetches current Shopify state and safely replays the whole window. Never assume a client timeout means no writes occurred.
- A process crash may leave `<checkpoint>.lock`. Remove **only that exact lock file** after confirming the local runner and its server invocation have ended. Do not delete the checkpoint. The lock is not a distributed production lock.
- If a receipt was lost after successful writes, replay is safe for canonical orders/lines. Additional sync-run and refresh-event entries are expected. Do not skip a pending window based solely on an unscoped sync-run row.
- For page/time/cost limits, stop and start a **new checkpoint** with a smaller `--window-hours` for the entire pinned interval; replaying already imported windows is idempotent. Do not edit receipt bounds or manually advance progress. If a single order exceeds nested limits, stop for a separately reviewed fix; smaller date windows cannot fix that case.
- For 401/403 or permission errors, stop and have the operator verify existing authorization. Do not rotate credentials as a recovery shortcut.
- For line-write failure or content mismatch, re-run the window after the previous invocation ends. Never roll back by deleting canonical orders or lines. If extra/stale canonical lines remain, stop for a targeted reconciliation review; the existing upsert does not delete removed lines.

Recovery command (same reference and checkpoint):

```powershell
node scripts/shopify-order-backfill.mjs --through 2026-09-05T11:00:00Z --checkpoint "$env:TEMP\vault-shopify-backfill-20260905T110000Z.json" --max-windows 1 --execute --retry-uncertain
```
