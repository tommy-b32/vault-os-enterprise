# C2 historical financial evidence repair

This is a bounded reconstruction of Shopify's current historical-order financial representation, not a reconstruction of every historical source revision.

The `shopify-financial-evidence-repair` function requires JWT verification and the existing `VAULT_ORDER_SYNC_SECRET`. It accepts explicit `created_from`, exclusive `created_before`, and `dry_run`. Windows are at most seven days and at most 50 orders.

Start with dry-run only. A successful dry-run records an audit row but does not call the governed C2 writer. Write mode is separately approved and uses the same historical-mode canonical payload through `record_shopify_financial_evidence`; it does not invoke order, line, B7, shipping, payment, or Command Centre code.

Do not run the endpoint until its migration and deployment have been separately approved.
