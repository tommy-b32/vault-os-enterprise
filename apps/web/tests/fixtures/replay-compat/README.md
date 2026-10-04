# Analytics cron job-ID replay compatibility

For the complete clean-replay procedure, safety boundaries, staged compatibility inventory, and final checks, see [the baseline replay runbook](BASELINE-REPLAY-RUNBOOK.md).

`20260904120000_analytics_cron_jobid_compat.sql` is a disposable, isolated-replay shim. It is not historical schema, is not part of `vault-legacy-schema-baseline.sql`, and must never be added to production migration history.

Production happened to allocate cron job ID 9 to `vault-shopify-analytics-refresh`; a clean isolated replay allocates a different sequence-generated ID (15 in the validated replay). Historical migrations `20260908130000` and `20260908160000` hard-code ID 9. Repository evidence does not establish the missing historical sequence consumption that would naturally reproduce that allocation.

Apply the shim only after `20260904120000_shopify_analytics_daily.sql` and before `20260908130000_shopify_analytics_refresh_timeout.sql`, with `cron.launch_active_jobs = off` and inert local secrets. The production migration SQL remains unchanged.

## Historical product-cost currency compatibility

`20260721120000_historical_product_cost_currency_compat.sql` is a replay-only recovery of the schema evolution documented in `database/019_product_cost_currency.sql` (Sprint 021.2). It belongs after the replay legacy baseline and before forward migrations. It is not an authoritative Supabase migration and must never be copied into `supabase/migrations`.

It adds the historical constrained `vault_product_costs.exchange_rate_to_gbp` field, rebuilds both commercial views with supplier-currency and GBP cost stages, and restores the two legacy-view fields required unchanged by `20260927000000_canonical_realised_shopify_asp.sql`: `exchange_rate_to_gbp` and `landed_cost_per_pack_gbp`.

## Inert Vault-secrets replay compatibility

`20260807500000_replay_inert_vault_secrets.sql` is a replay-only shim. It creates only local inert placeholder Vault values named `vault_shopify_order_sync_service_role_jwt` and `vault_order_sync_secret`, which historical schedule migrations require during isolated replay validation. Its two values are the literal `replay-inert-*` placeholders; it contains no real production secret.

Run it only in the isolated wrapper with `cron.launch_active_jobs = off`, after the Vault capability is available and before schedule-dependent historical migrations. It must never be deployed, copied, or promoted as an authoritative production migration.

## Governed decision-memory scheduler-secret compatibility

`20261003120000_governed_decision_memory_scheduler_secret_compat.sql` is a replay-only bootstrap shim. It belongs after `20261003000000_governed_decision_memory.sql` and before `20261004000000_governed_decision_memory_capture_schedule.sql`. It must run with `cron.launch_active_jobs = off`.

The production scheduler secret is provisioned outside migration history. This shim creates an inert named Vault value only when the isolated replay lacks one, allowing the historical scheduling migration to remain unchanged and fail-closed in production. It must never be copied into `supabase/migrations` or used outside an isolated replay.

## VaultCare canonical catalogue compatibility

`20261030500000_replay_vaultcare_canonical_catalogue_fixture.sql` reconstructs the external Shopify catalogue identity that production received through `shopify-sync`, but which a blank isolated replay does not contain. It is replay-only and must run after `20261030000000_remove_legacy_pack_profile_check.sql` and before `20261031000000_governed_financial_treatments.sql`.

It inserts only the exact canonical VaultCare product and variant needed by the governed financial-treatment and later historical-service-treatment migrations. It seeds no product settings, inventory, orders, customers, suppliers, costs, or treatment records. It must never be added to authoritative `supabase/migrations` or applied to production.

## Exclusive historical catalogue compatibility

`20261034500000_replay_exclusive_historical_catalogue_fixture.sql` reconstructs the verified historical operational Shopify catalogue and supplier state required by the Exclusive Tee and Polo COGS foundations. The identities were recovered read-only from production. It must run after `20261034000000_product_profitability_timestamped_coverage.sql` and before `20261035000000_governed_historical_exclusive_tee_cogs_foundation.sql`.

This fixture inserts only the one verified Exclusive supplier and 20 verified Shopify product identities (18 Tees and two Polos). It seeds no variants, product settings, POs, receipts, inventory, costs, customers, orders, or treatment rows. It is replay-only: never deploy it as an authoritative production migration.

## Exclusive tee operational-profile compatibility

`20261047400000_replay_cost_type_reference_fixture.sql` restores the one verified operational/reference-data dependency required by the Exclusive tee operational-profile fixture: `vault_cost_types(id, display_name, active) = ('tee', 'Tee', true)`. The row was recovered read-only from production and had no authoritative migration seed. It runs after `20261047000000_stock_purchasing_budget.sql` and before `20261047500000_replay_exclusive_tee_operational_profile_fixture.sql` only in an isolated replay. It seeds no speculative cost types and must never be deployed as an authoritative migration.

`20261047500000_replay_exclusive_tee_operational_profile_fixture.sql` reconstructs verified historical operational Exclusive tee supplier-profile and product-settings state required by `20261048000000_govern_exclusive_tee_profile_inheritance.sql`. Values were recovered read-only from production. It runs after `20261047000000_stock_purchasing_budget.sql` and before `20261048000000_govern_exclusive_tee_profile_inheritance.sql` in an isolated replay only.

It seeds only the verified active profile and exact 15 target settings. It seeds no assignments, inheritance rows, profile versions, variants, POs, receipts, inventory, orders, customers, or unrelated settings. It is replay-only: never deploy it as an authoritative production migration.
