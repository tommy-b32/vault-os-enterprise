# Shopify function deployment contract

Set these values as server-side Supabase Edge Function secrets:

- `SHOPIFY_STORE_DOMAIN`: The Fabric Vault Shopify domain, without a protocol.
- `SHOPIFY_CLIENT_ID`: the Dev Dashboard app Client ID.
- `SHOPIFY_CLIENT_SECRET`: the Dev Dashboard app Client Secret, used by the shared server-side provider to request short-lived Admin API access tokens.
- `SHOPIFY_WEBHOOK_SECRET`: the secret used only to verify the `X-Shopify-Hmac-Sha256` signature. For this Dev Dashboard app it may contain the same underlying value as `SHOPIFY_CLIENT_SECRET`, but it remains a separate configuration contract and is never sent to GraphQL.
- `VAULT_ORDER_SYNC_SECRET`: the separate caller secret for scheduled/manual order reconciliation.
- `VAULT_FINANCE_SYNC_SECRET`: a separate server-to-server secret required by the Shopify Payments synchronization endpoint. Configure the same value in the Command Centre server environment; never expose it to browser code.

The normal Supabase server-side values `SUPABASE_URL` and either `SUPABASE_SERVICE_ROLE_KEY` or `SERVICE_ROLE_KEY` are also required.

The shared provider exchanges `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` at `POST https://{SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token` with `grant_type=client_credentials`. It validates and caches the returned `access_token`, respects `expires_in`, and refreshes shortly before expiry. Every Admin GraphQL request sends only that returned token in `X-Shopify-Access-Token`.

`SHOPIFY_ADMIN_ACCESS_TOKEN` is not used by these functions. Removing an obsolete hosted secret is an explicit operator action; deployment does not delete or alter it automatically.

Webhook HMAC verification remains separate from API authentication. Configure `SHOPIFY_WEBHOOK_SECRET` from the Dev Dashboard app secret and do not expose it to the GraphQL client.

The Shopify custom app must grant the Admin API scopes used by the enabled synchronisers, including `read_products`, `read_inventory`, `read_locations`, and `read_orders`. Shopify may require protected customer data approval for order fields such as customer name and email.

Shopify Payments synchronization additionally requires the narrow scopes `read_shopify_payments_accounts` for account balances and `read_shopify_payments_payouts` for payout summaries. A Dev Dashboard app version containing both scopes must be released and approved for the installed store before synchronization can succeed.

The webhook endpoint must be registered for the required topics (`orders/create`, `orders/updated`, `orders/cancelled`, and `refunds/create`). The order webhook has Supabase JWT verification disabled because Shopify signs requests with HMAC; the function verifies that signature before processing the payload. The reconciliation endpoint retains Supabase JWT verification and also requires `VAULT_ORDER_SYNC_SECRET`.
