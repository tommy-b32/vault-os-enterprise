# Commercial C2 — governed Shopify financial evidence

C2 is additive, source-backed financial evidence. It records Shopify discount applications, line discount allocations, refunds, refund lines, and refund transactions. It deliberately does not calculate profit, change existing order/revenue values, or infer an offer identity such as 2-for-£70.

## Capture contract

`orders.ts` requests all C2 fields from Shopify Admin GraphQL and calls the C2 parser before existing order, line, or B7F writes. Every required connection has `pageInfo`; any incomplete discount application, allocation, refund-line, or refund-transaction connection fails the capture rather than silently storing a partial account.

Raw observations are append-only and versioned by Shopify source identity plus the source update timestamp. A repeat of the exact version is idempotent. A repeat identity with a different payload fingerprint fails closed as `FINANCIAL_SOURCE_VERSION_CONFLICT`. Latest views select the newest immutable version deterministically; reconciliation uses only those latest views.

The writer receives one payload per order and persists its C2 rows in one database function call. It never writes B7F tables, lifecycle adjustments, revenue fields, inventory tables, or decision tables.

## Prospective governance

The singleton governance row starts with `prospective_started_at = NULL`. Only a successful `prospective` C2 write may set it. `historical` captures must pass the same explicit mode in the payload and the RPC parameter, and cannot initialize or move that boundary. C2 historical repair is not implemented or authorized by this migration.

The mode is retained on every raw observation. This separates future governed prospective capture from any separately authorized historical work without altering B7F's independently governed boundary or classifications.

## Source fields captured

Discount application type, index, allocation method, target details, source code/title/description where Shopify provides them, and money/percentage value are stored. Each allocation retains the Shopify line-item ID and application index. A parser rejects an allocation that cannot be linked to an application in the same source order version.

Refund evidence retains refund ID, created/updated/processed timestamps, total refunded shop money, refund-line ID, line item, quantity, price, subtotal, tax, restock evidence, transaction ID, parent transaction, kind, status, gateway, amount/currency, timestamps, and test flag.

Shipping refund lines, duties/order adjustments, typed transaction fees, Shopify Function identity, and bundle identity are intentionally not persisted in C2 v1. They are conditional extensions, not a prerequisite for the core C2 evidence contract.

## Reconciliation and access

`vault_shopify_financial_refund_reconciliation` reports whether the latest line subtotal plus tax equals, exceeds, or is less than Shopify's refund total. A deficit is explicitly classified as `additional_components_or_transactions`; it is not silently assigned to shipping, duties, fees, or profit.

Raw tables use RLS and are not granted to `anon` or `authenticated`. The service role is the writer. No credentials, raw access tokens, or Shopify response blobs are persisted.

## Operational limits

This migration is local-only until separately reviewed and deployed. It does not backfill, repair historical C2 evidence, call Shopify, schedule cron work, or change B7D, B7F, B7G, existing revenue semantics, or UI behaviour.
