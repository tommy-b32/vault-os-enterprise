# Sales Workbook: external postage unblock (order #1341)

## Goal
A user enters the actual external postage amount once against an existing Shopify order; when the other financial evidence is verified, the existing deferred-retry worker publishes the order to the Sales Workbook automatically. Do not add a second workbook-entry workflow.

## Confirmed example
- Order number: 1341
- Canonical order UUID: 108fcd77-35ba-42a4-adb3-828dd23f1136
- Shopify order ID: gid://shopify/Order/13797852905850
- Parcel2Go Royal Mail 48 Tracked postage: GBP 3.75 paid (gross). User is not reclaiming VAT.
- Existing product COGS and payment fees are verified. Shopify shipping source state is `missing`.
- No invoice-upload UI or VAT treatment changes in scope.

## Current blocker (read-only production inspection, 2026-11-03)
- `vault_shopify_shipping_costs` stores Shopify-derived shipping snapshots only.
- `vault_shopify_order_operational_contribution_diagnostics_base` checks for `source_state = 'covered'`, GBP, `accounting_status = 'unreconciled'`, positive label count and non-null nonnegative label cost.
- `vault_shopify_verified_order_operational_contributions` only includes orders with no exclusion reasons; it subtracts `observed_purchased_label_cost_gbp`.
- Shopify refresh calls `record_shopify_shipping_costs` and can replace snapshots. Do not write manually entered costs to the Shopify snapshot table.

## Implementation contract
1. Add a separate, tightly access-controlled external postage record keyed by canonical order UUID, with GBP amount in pennies, shipment identity (if available), source `manual_external`, timestamps and actor. A single current record per order for MVP; do not overwrite an immutable audit history.
2. Add an authenticated, authorized order-level input for external postage (not a spreadsheet cell). Reject negative/non-GBP/invalid amounts and duplicate conflicting submissions; accept exact idempotent retries.
3. Derive **one effective shipping cost** for operational contribution: verified Shopify postage **or** approved external postage. Never sum them. If both appear, hold the order pending a conflict resolution rather than silently prefer one.
4. Update diagnostics and verified operational contribution together so an approved external postage amount clears only shipping-related exclusions. Keep COGS, fees, identity and revenue guards unchanged.
5. Preserve the existing deferred retry / immutable version publication flow. No direct worksheet mutation.
6. Preserve source evidence during subsequent Shopify refreshes and expose source and amount in order diagnostics.
7. Add tests: #1341 external £3.75 => one shipping cost and eligible once other checks pass; same submission retry => no duplicate; later Shopify label => conflict and no double subtraction; no cost => pending; invalid amount => reject; two concurrent submissions => one effective record.
8. Run isolated tests and TypeScript check; validate on staging before any production migration or deployment.

## Non-goals
Invoice upload, VAT reporting, new workbook versions on every edit, guessed £2.95 postage for missing labels, disabling financial-evidence gates, direct production data edits.

## Rollout
Prepare code + generated Supabase CLI migration on this branch; stage and test; review production migration plan and request explicit approval before applying. After deployment, enter #1341 postage once and observe existing retry publishing it.
