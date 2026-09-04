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

The Shopify custom app must grant the Admin API scopes used by the enabled synchronisers, including `read_products`, `read_inventory`, `write_inventory`, `read_locations`, and `read_orders`. `write_inventory` is used only by explicit operator-triggered received-stock posting. Shopify may require protected customer data approval for order fields such as customer name and email.

Command Centre Shopify Analytics additionally requires `read_reports` and Level 2 protected-customer-data access. This app is configured through the Shopify Dev Dashboard rather than a repository `shopify.app.toml`: add `read_reports` to a new app version, complete the protected-customer-data request, release the version, and have the merchant approve the new scope. The analytics synchroniser stores only daily aggregates and refreshes every 15 minutes; it never stores customer or individual-session data.

Shopify Payments synchronization additionally requires the narrow scopes `read_shopify_payments_accounts` for account balances and `read_shopify_payments_payouts` for payout summaries. A Dev Dashboard app version containing both scopes must be released and approved for the installed store before synchronization can succeed.

The webhook endpoint must be registered for the required topics (`orders/create`, `orders/updated`, `orders/cancelled`, and `refunds/create`). The order webhook has Supabase JWT verification disabled because Shopify signs requests with HMAC; the function verifies that signature before processing the payload. The reconciliation endpoint retains Supabase JWT verification and also requires `VAULT_ORDER_SYNC_SECRET`.

## Scheduled order reconciliation fallback

Shopify webhooks remain the preferred instant order-ingestion path. The database
schedule named `vault-shopify-order-reconciliation` invokes
`shopify-order-sync` every ten minutes as a reconciliation fallback.

Before applying `20260804000000_shopify_order_reconciliation_schedule.sql`, add
these database-only secrets through the Supabase SQL editor. Replace the two
placeholders locally; never commit their values:

```sql
select vault.create_secret(
  '<SUPABASE_SERVICE_ROLE_JWT>',
  'vault_shopify_order_sync_service_role_jwt',
  'JWT used by pg_net to invoke the protected Shopify order sync function'
);

select vault.create_secret(
  '<VAULT_ORDER_SYNC_SECRET>',
  'vault_order_sync_secret',
  'Caller secret used by scheduled Shopify order reconciliation'
);
```

The second value must equal the Edge Function secret named
`VAULT_ORDER_SYNC_SECRET`. The service-role value must be the project service-role
JWT, not a browser publishable key or the newer `sb_secret_...` server key. The
cron command stores only Vault secret names; decrypted values are resolved only
when the job runs.

If either named Vault secret already exists, rotate it instead of creating a
duplicate:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'vault_shopify_order_sync_service_role_jwt'),
  '<SUPABASE_SERVICE_ROLE_JWT>'
);

select vault.update_secret(
  (select id from vault.secrets where name = 'vault_order_sync_secret'),
  '<VAULT_ORDER_SYNC_SECRET>'
);
```

Vault OS records each successful reconciliation in the private
`vault_shopify_order_sync_runs` table, including runs where Shopify returns no
orders. The Command Centre uses the latest completed run for Shopify freshness.
No access to this table is granted to `anon` or `authenticated`.
