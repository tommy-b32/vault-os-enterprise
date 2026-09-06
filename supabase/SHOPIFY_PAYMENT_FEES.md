# Shopify payment fees

`shopify-analytics-sync` reads the canonical Shopify Admin GraphQL `Order.transactions[].fees` field for a bounded recent order cohort. It stores fee records by `(shopify_order_transaction_id, fee_id)` and replaces a per-order completeness snapshot only when the source snapshot is newer.

Profit Today uses only successful `SALE` or `CAPTURE` transactions from the exact `shopify_payments` gateway, with exact GBP fee and tax amounts. Failed transactions do not count. External gateways, missing fee records, more than one successful charge, refunds or voids, and non-GBP amounts leave that order uncovered. Any uncovered order leaves Payment fees unavailable; the system never derives fees from a payout difference or assumes a fee amount.
