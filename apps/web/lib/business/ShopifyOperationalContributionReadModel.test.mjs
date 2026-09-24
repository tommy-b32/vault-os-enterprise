import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";

const root = new URL("../../../../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20261028000000_verified_shopify_order_operational_contribution.sql", root), "utf8");
const repositorySource = await readFile(new URL("ShopifyOperationalContributionReadModelRepository.ts", import.meta.url), "utf8");
const at = "2026-09-20T10:00:00Z";

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table vault_shopify_orders(id text, source text, shopify_order_id text, shopify_created_at timestamptz, shopify_updated_at timestamptz, currency text, cancelled_at timestamptz, metadata jsonb);
    create table vault_shopify_verified_order_financials(order_id text, shopify_order_id text, shopify_created_at timestamptz, order_source_updated_at timestamptz, currency text, canonical_net_revenue numeric);
    create table vault_shopify_order_lines(id text, order_id text, quantity integer, refunded_quantity integer, cogs_quantity integer, cogs_status text, cogs_history_id text, cogs_snapshotted_at timestamptz, unit_cogs_gbp numeric, total_cogs_gbp numeric);
    create table vault_shopify_shipping_costs(order_id text, shopify_order_id text, source_state text, currency text, accounting_status text, label_count integer, label_cost_gbp numeric);
    create table vault_shopify_payment_fee_coverage(order_id text, shopify_order_id text, coverage_state text);
    create table vault_shopify_payment_fee_records(order_id text, shopify_order_id text, gateway text, transaction_kind text, transaction_status text, fee_amount numeric, fee_currency text, tax_amount numeric, tax_currency text, source_classification text, reconciliation_state text, counts_toward_profit boolean);`);
  await db.exec(migration);
  const order = async (id, options = {}) => {
    const { currency = "GBP", cancelled = null, test = false } = options;
    await db.query("insert into vault_shopify_orders values($1,'shopify',$2,$3,$3,$4,$5,$6)", [id, `gid://shopify/Order/${id}`, at, currency, cancelled, JSON.stringify({ test })]);
  };
  const financial = (id, revenue = 100, currency = "GBP") => db.query("insert into vault_shopify_verified_order_financials values($1,$2,$3,$3,$4,$5)", [id, `gid://shopify/Order/${id}`, at, currency, revenue]);
  const line = (id, quantity = 1, cost = 30, trusted = true, refundedQuantity = 0) => db.query("insert into vault_shopify_order_lines values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [`line-${id}`, id, quantity, refundedQuantity, quantity - refundedQuantity, trusted ? "trusted" : "unavailable", trusted ? `history-${id}` : null, trusted ? at : null, trusted ? cost / (quantity - refundedQuantity) : null, trusted ? cost : null]);
  const shipping = (id, cost = 7, state = "covered", currency = "GBP") => db.query("insert into vault_shopify_shipping_costs values($1,$2,$3,$4,'unreconciled',1,$5)", [id, `gid://shopify/Order/${id}`, state, currency, cost]);
  const coverage = (id, state = "covered") => db.query("insert into vault_shopify_payment_fee_coverage values($1,$2,$3)", [id, `gid://shopify/Order/${id}`, state]);
  const fee = (id, value = 3, tax = 1, currency = "GBP", valid = true) => db.query("insert into vault_shopify_payment_fee_records values($1,$2,$3,'SALE','SUCCESS',$4,$5,$6,$5,$7,$8,$9)", [id, `gid://shopify/Order/${id}`, valid ? "shopify_payments" : "other", value, currency, tax, valid ? "shopify_payments" : "unsupported_gateway", valid ? "covered" : "unsupported_gateway", valid]);
  return { db, order, financial, line, shipping, coverage, fee };
}

test("operational contribution admits only complete compatible evidence and does not subtract refunds twice", async () => {
  const x = await setup();
  try {
    await x.order("eligible"); await x.financial("eligible", 100); await x.line("eligible", 2, 30); await x.shipping("eligible", 7); await x.coverage("eligible"); await x.fee("eligible", 3, 1);
    // Current canonical revenue is already reduced from 100 to 75 by a partial refund;
    // sold quantity and immutable COGS are also reduced to one unit.
    await x.order("partial-refund"); await x.financial("partial-refund", 75); await x.line("partial-refund", 2, 15, true, 1); await x.shipping("partial-refund", 7); await x.coverage("partial-refund"); await x.fee("partial-refund", 3, 1);
    await x.order("missing-cogs"); await x.financial("missing-cogs"); await x.line("missing-cogs", 1, 0, false); await x.shipping("missing-cogs"); await x.coverage("missing-cogs"); await x.fee("missing-cogs");
    await x.order("cancelled", { cancelled: at }); await x.financial("cancelled"); await x.line("cancelled"); await x.shipping("cancelled"); await x.coverage("cancelled"); await x.fee("cancelled");
    await x.order("test-order", { test: true }); await x.financial("test-order"); await x.line("test-order"); await x.shipping("test-order"); await x.coverage("test-order"); await x.fee("test-order");
    await x.order("unsupported"); await x.financial("unsupported"); await x.line("unsupported"); await x.shipping("unsupported"); await x.coverage("unsupported", "unsupported_gateway");
    await x.order("shipping-currency"); await x.financial("shipping-currency"); await x.line("shipping-currency"); await x.shipping("shipping-currency", 7, "covered", "USD"); await x.coverage("shipping-currency"); await x.fee("shipping-currency");
    await x.order("duplicate-financial"); await x.financial("duplicate-financial"); await x.financial("duplicate-financial"); await x.line("duplicate-financial"); await x.shipping("duplicate-financial"); await x.coverage("duplicate-financial"); await x.fee("duplicate-financial");
    await x.order("duplicate-shipping"); await x.financial("duplicate-shipping"); await x.line("duplicate-shipping"); await x.shipping("duplicate-shipping"); await x.shipping("duplicate-shipping"); await x.coverage("duplicate-shipping"); await x.fee("duplicate-shipping");
    await x.order("duplicate-coverage"); await x.financial("duplicate-coverage"); await x.line("duplicate-coverage"); await x.shipping("duplicate-coverage"); await x.coverage("duplicate-coverage"); await x.coverage("duplicate-coverage"); await x.fee("duplicate-coverage");
    const { rows } = await x.db.query("select shopify_order_id,canonical_net_revenue,trusted_net_sold_line_cogs_gbp,observed_purchased_label_cost_gbp,covered_payment_fees_gbp,estimated_operational_contribution_gbp from vault_shopify_verified_order_operational_contributions order by shopify_order_id");
    assert.deepEqual(rows, [
      { shopify_order_id: "gid://shopify/Order/eligible", canonical_net_revenue: "100", trusted_net_sold_line_cogs_gbp: "30", observed_purchased_label_cost_gbp: "7", covered_payment_fees_gbp: "4", estimated_operational_contribution_gbp: "59" },
      { shopify_order_id: "gid://shopify/Order/partial-refund", canonical_net_revenue: "75", trusted_net_sold_line_cogs_gbp: "15", observed_purchased_label_cost_gbp: "7", covered_payment_fees_gbp: "4", estimated_operational_contribution_gbp: "49" },
    ]);
    const { rows: diagnostics } = await x.db.query("select shopify_order_id,exclusion_reason_codes from vault_shopify_order_operational_contribution_diagnostics where cardinality(exclusion_reason_codes) > 0 order by shopify_order_id");
    assert.deepEqual(diagnostics, [
      { shopify_order_id: "gid://shopify/Order/cancelled", exclusion_reason_codes: ["cancelled_order"] },
      { shopify_order_id: "gid://shopify/Order/duplicate-coverage", exclusion_reason_codes: ["duplicate_payment_fee_coverage"] },
      { shopify_order_id: "gid://shopify/Order/duplicate-financial", exclusion_reason_codes: ["duplicate_verified_financial"] },
      { shopify_order_id: "gid://shopify/Order/duplicate-shipping", exclusion_reason_codes: ["duplicate_shipping_label_cost"] },
      { shopify_order_id: "gid://shopify/Order/missing-cogs", exclusion_reason_codes: ["missing_or_untrusted_sold_line_cogs"] },
      { shopify_order_id: "gid://shopify/Order/shipping-currency", exclusion_reason_codes: ["shipping_currency_or_amount_mismatch"] },
      { shopify_order_id: "gid://shopify/Order/test-order", exclusion_reason_codes: ["test_or_unconfirmed_order"] },
      { shopify_order_id: "gid://shopify/Order/unsupported", exclusion_reason_codes: ["unsupported_payment_gateway"] },
    ]);
    const { rows: grants } = await x.db.query("select has_table_privilege('anon', 'vault_shopify_verified_order_operational_contributions', 'select') anon_can_read, has_table_privilege('authenticated', 'vault_shopify_verified_order_operational_contributions', 'select') authenticated_can_read, has_table_privilege('service_role', 'vault_shopify_verified_order_operational_contributions', 'select') service_can_read");
    assert.deepEqual(grants, [{ anon_can_read: false, authenticated_can_read: false, service_can_read: true }]);
  } finally { await x.db.close(); }
});

test("migration is additive, service-role-only, and retains the approved classification contract", () => {
  assert.match(migration, /create view public\.vault_shopify_verified_order_operational_contributions/);
  assert.match(migration, /create view public\.vault_shopify_order_operational_contribution_diagnostics/);
  assert.match(migration, /revoke all on public\.vault_shopify_verified_order_operational_contributions from public, anon, authenticated/);
  assert.match(migration, /grant select on public\.vault_shopify_verified_order_operational_contributions to service_role/);
  assert.match(migration, /security_invoker = true/);
  assert.match(migration, /create index if not exists vault_shopify_payment_fee_records_order_id_idx/);
  assert.match(migration, /current_customer_order_total/);
  assert.match(migration, /included_unseparated/);
  assert.match(migration, /observed_unreconciled/);
  assert.match(migration, /canonical_net_revenue - trusted_net_sold_line_cogs_gbp - observed_purchased_label_cost_gbp - covered_payment_fees_gbp/);
  assert.doesNotMatch(migration, /insert into|update public\.|delete from|alter table/i);
});

test("server-only repository reads the contribution and diagnostics views and rejects inconsistent totals", async () => {
  const calls = [];
  const contributionRow = { order_id: "o1", shopify_order_id: "gid://shopify/Order/1", shopify_created_at: at, order_source_updated_at: at, canonical_net_revenue: "100", trusted_net_sold_line_cogs_gbp: "30", observed_purchased_label_cost_gbp: "7", covered_payment_fees_gbp: "4", estimated_operational_contribution_gbp: "59", revenue_basis: "current_customer_order_total", tax_treatment: "included_unseparated", duties_and_additional_fees_treatment: "unobserved", shipping_label_status: "observed_unreconciled", classification: "estimated_operational_contribution" };
  const diagnosticRow = { order_id: "o2", shopify_order_id: "gid://shopify/Order/2", shopify_created_at: at, exclusion_reason_codes: ["missing_shipping_label_cost"] };
  const client = { from(table) { calls.push({ table }); return { select() { return this; }, gte() { return this; }, lt() { return this; }, order() { return this; }, range() { return Promise.resolve({ data: table.includes("diagnostics") ? [diagnosticRow] : [contributionRow], error: null }); } }; } };
  const compiled = ts.transpileModule(repositorySource.replace(/^import .*;\r?\n/gm, ""), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = {}; new Function("exports", "supabaseAdmin", compiled)(mod, client);
  const range = { from: "2026-09-20T00:00:00Z", to: "2026-09-21T00:00:00Z" };
  const eligible = await mod.ShopifyOperationalContributionReadModelRepository.getEligibleByCreatedAtRange(range);
  assert.equal(eligible[0].estimatedOperationalContribution, 59);
  assert.equal(eligible[0].classification, "estimated_operational_contribution");
  const diagnostics = await mod.ShopifyOperationalContributionReadModelRepository.getDiagnosticsByCreatedAtRange(range);
  assert.deepEqual(diagnostics[0].exclusionReasonCodes, ["missing_shipping_label_cost"]);
  assert.deepEqual(calls.map(call => call.table), ["vault_shopify_verified_order_operational_contributions", "vault_shopify_order_operational_contribution_diagnostics"]);
  contributionRow.estimated_operational_contribution_gbp = "58";
  await assert.rejects(mod.ShopifyOperationalContributionReadModelRepository.getEligibleByCreatedAtRange(range), /calculation mismatch/);
});
