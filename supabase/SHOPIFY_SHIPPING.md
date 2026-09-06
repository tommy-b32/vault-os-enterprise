# Shopify purchased-label costs

This integration reads actual `shipping_label_costs` and `shipping_labels` from
ShopifyQL, grouped by `order_id`. It never uses customer shipping charges or rates.
It reuses Admin API 2026-07, the existing client-credentials provider and read_reports
access. No label-purchase mutation is called.

Apply the shipping migration before deploying the updated analytics function and
the new shipping endpoint. These deployment actions are not performed by local
validation. No new secret or schedule is required: the existing analytics sync
refreshes up to 200 orders from the preceding seven days, in four batches of 50.
Shipping failure is isolated from analytics. A capped run returns complete=false
and the continuation interval/cursor. Continue it with the shipping endpoint.

For a bounded backfill or refresh, POST to `shopify-shipping-sync` with the existing
Supabase JWT and `X-Vault-Sync-Secret` (VAULT_ORDER_SYNC_SECRET). JSON body:

```json
{"createdFrom":"2026-06-01T00:00:00Z","createdBefore":"2026-07-01T00:00:00Z"}
```

Each request handles at most 50 canonical, non-test, non-cancelled Shopify orders.
If `next` is non-null, repeat the SAME interval with `after` set to `next`, until
null. Intervals must be no longer than 31 days. Repeat intervals safely to refresh
late labels. Default `{}` covers the preceding seven days; preserve the returned
interval when continuing. No standalone tool should log credentials.

The source query covers each selected order from before creation through today,
regardless of its label purchase date. Totals replace earlier snapshots atomically;
older concurrent responses cannot overwrite newer snapshots. Missing query rows
replace prior totals with NULL, not zero. Invalid/failed queries write nothing and
previous snapshots age into stale status. A confirmed zero-priced label is valid.

The daily RPC selects the same non-test/non-cancelled London order-day cohort as
revenue. Shipping is unavailable unless every order has a cost and the count matches
the trading snapshot; an empty day is also unavailable. Staleness uses the oldest
snapshot and trading freshness. No label date is used as a profit date.

All snapshots remain `accounting_status=unreconciled`: label void/refund credits,
carrier adjustments, tax treatment and reporting latency have not been reconciled.
These are operational purchased-label totals, not certified final net postage.
Do not assume two labels means a replacement or subtract an imagined credit.
Payment fees remain unavailable, so full Profit Today remains unavailable.

Before treating these figures as final costs, reconcile known refunded/voided and
adjusted labels against Shopify billing and establish source completeness/latency.
