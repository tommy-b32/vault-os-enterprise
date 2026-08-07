import type { PurchasingWalletData } from "@/components/commercial/PurchasingWallet";
import VaultAppShell from "@/components/layout/VaultAppShell";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import {
  PurchaseIntelligenceEngine,
  type PurchaseIntelligenceSupplier,
} from "@/lib/brain/PurchaseIntelligenceEngine";
import { PurchaseIntelligenceDiagnostics } from "@/lib/brain/PurchaseIntelligenceDiagnostics";
import { getCatalogueData } from "@/lib/catalogue";
import { InventorySyncRepository } from "@/lib/inventory/InventorySyncRepository";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function currency(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}

export default async function PurchaseIntelligencePage() {
  await requireAuthenticatedOperator();
  const [catalogue, freshness, walletResult, suppliersResult, rulesResult] = await Promise.all([
    getCatalogueData(),
    InventorySyncRepository.getFreshness(),
    supabaseAdmin.from("vault_purchasing_wallet").select("ledger_balance_gbp, protected_reserve_gbp, committed_orders_gbp, calculated_purchasing_power_gbp, available_purchasing_power_gbp, manual_spending_limit_gbp, reserve_override_allowed, wallet_last_updated, purchasing_power_state").single(),
    supabaseAdmin.from("vault_suppliers").select("id, supplier_name, is_active, minimum_order_value, currency_code"),
    supabaseAdmin.from("vault_supplier_purchasing_rules").select("supplier_id, minimum_order_packs"),
  ]);
  const sourceError = walletResult.error ?? suppliersResult.error ?? rulesResult.error;
  if (sourceError) throw new Error(`Unable to load purchase intelligence: ${sourceError.message}`);
  const rules = new Map((rulesResult.data ?? []).map((rule) => [rule.supplier_id, rule.minimum_order_packs]));
  const suppliers: PurchaseIntelligenceSupplier[] = (suppliersResult.data ?? []).map((supplier) => ({
    id: supplier.id,
    name: supplier.supplier_name,
    active: supplier.is_active,
    currency: supplier.currency_code,
    minimumOrderValue: supplier.minimum_order_value,
    minimumOrderPacks: rules.get(supplier.id) ?? null,
  }));
  const evaluation = PurchaseIntelligenceEngine.evaluate({
    products: catalogue.products,
    suppliers,
    wallet: walletResult.data as PurchasingWalletData,
    inventoryTrusted: freshness.syncStatus === "current",
  });
  const recommendations = evaluation.recommendations;
  const diagnostics = PurchaseIntelligenceDiagnostics.build({
    suppliers,
    evaluation,
  });

  return (
    <VaultAppShell searchPlaceholder="Search purchase intelligence..." systemStatusLabel="Purchase intelligence is read-only">
      <main className="purchase-intelligence-page">
        <header className="purchase-intelligence-header">
          <div><p className="vault-eyebrow">TRUSTED PURCHASE INTELLIGENCE</p><h1>Purchase Intelligence</h1><p>Deterministic, supplier-grouped recommendations from canonical live business data.</p></div>
          <span>{recommendations.length > 0 ? "Trusted recommendations" : "No trusted recommendations"}</span>
        </header>
        <section className="purchase-intelligence-notice"><strong>Read-only intelligence</strong><span>No purchase orders are created and no purchases are approved from this page.</span></section>
        <section className="purchase-intelligence-diagnostics">
          <div className="purchase-intelligence-diagnostics-heading"><div><p className="vault-eyebrow">SUPPLIER DIAGNOSTICS</p><h2>Trust evaluation</h2><p>Every evaluated supplier is shown, including suppliers blocked from recommendation.</p></div><span>{diagnostics.length} suppliers evaluated</span></div>
          <div className="purchase-intelligence-diagnostic-grid">
            {diagnostics.map((diagnostic) => (
              <article className={`purchase-intelligence-diagnostic is-${diagnostic.finalRecommendationStatus.startsWith("Trusted") ? "trusted" : "blocked"}`} key={diagnostic.supplier.id}>
                <header><div><span>Supplier</span><h3>{diagnostic.supplier.name}</h3></div><strong>{diagnostic.finalRecommendationStatus}</strong></header>
                <section className="purchase-intelligence-stage">
                  <p className="vault-eyebrow">DEMAND</p>
                  <dl>
                    <div><dt>Products evaluated</dt><dd>{diagnostic.evaluated}</dd></div>
                    <div><dt>Products needing replenishment</dt><dd>{diagnostic.needsReplenishment}</dd></div>
                    <div><dt>Genuine no-reorder</dt><dd>{diagnostic.genuineNoReorder}</dd></div>
                    <div><dt>Evidence unavailable</dt><dd>{diagnostic.evidenceUnavailable}</dd></div>
                    <div><dt>Excluded by strategy</dt><dd>{diagnostic.excludedByStrategy}</dd></div>
                  </dl>
                  <div className="purchase-intelligence-rejections"><span>Demand evidence unavailable</span>{diagnostic.demandMissingRequirements.length > 0 ? <ul>{diagnostic.demandMissingRequirements.map((reason) => <li key={reason}>{reason.replaceAll("_", " ")}</li>)}</ul> : <p>None</p>}</div>
                  {diagnostic.demandItems.length > 0 ? <div className="purchase-intelligence-demand-items"><span>Products needing replenishment</span>{diagnostic.demandItems.map((demand) => <div key={demand.styleId}><strong>{demand.productName} — {demand.styleId.split("::").at(-1)}</strong><small>Demand: {demand.demand_status} · Urgency: {demand.urgency ?? "Not evaluated"}</small><small>{demand.demand_reason}</small><small>{demand.urgency_reason}</small><small>On hand: {demand.currentStock} · Calculated: {demand.calculatedPacks} packs · Suggested: {demand.suggestedPacks} packs / {demand.suggestedUnits} units</small></div>)}</div> : null}
                </section>
                <section className="purchase-intelligence-stage">
                  <p className="vault-eyebrow">PURCHASING QUALIFICATION</p>
                  <dl>
                    <div><dt>Purchasing eligible</dt><dd>{diagnostic.purchasingEligible}</dd></div>
                    <div><dt>Purchasing blocked</dt><dd>{diagnostic.purchasingBlocked}</dd></div>
                    <div><dt>Purchasing state</dt><dd>{diagnostic.purchasingState.replaceAll("_", " ")}</dd></div>
                  </dl>
                  <div className="purchase-intelligence-rejections"><span>Purchasing-policy blockers</span>{diagnostic.purchasingBlockers.length > 0 ? <ul>{diagnostic.purchasingBlockers.map((reason) => <li key={reason}>{reason.replaceAll("_", " ")}</li>)}</ul> : <p>None</p>}</div>
                </section>
                <footer><strong>Final recommendation status: {diagnostic.finalRecommendationStatus}</strong></footer>
              </article>
            ))}
          </div>
        </section>
        {recommendations.map((recommendation) => (
          <section className="purchase-intelligence-supplier" key={recommendation.supplier.id}>
            <div className="purchase-intelligence-supplier-heading"><div><p className="vault-eyebrow">SUPPLIER RECOMMENDATION</p><h2>{recommendation.supplier.name}</h2></div><span>Trusted</span></div>
            <div className="purchase-intelligence-metrics">
              <article><span>Packs</span><strong>{recommendation.packs}</strong></article>
              <article><span>Units</span><strong>{recommendation.units}</strong></article>
              <article><span>Spend</span><strong>{currency(recommendation.spendGbp)}</strong></article>
              <article><span>Projected revenue</span><strong>{currency(recommendation.projectedRevenueGbp)}</strong></article>
              <article><span>Projected profit</span><strong>{currency(recommendation.projectedProfitGbp)}</strong></article>
              <article><span>Purchasing power after</span><strong>{currency(recommendation.purchasingPowerAfterOrderGbp)}</strong></article>
            </div>
            <div className="purchase-intelligence-table-wrap"><table><thead><tr><th>Product</th><th>Stock</th><th>Daily sales</th><th>Days left</th><th>Target</th><th>Required</th><th>Pack rounding</th><th>Cost</th><th>Revenue</th><th>Profit</th></tr></thead><tbody>
              {recommendation.recommendedProducts.map((product) => <tr key={product.styleId}><td><strong>{product.productName}</strong><small>{product.styleId}</small></td><td>{product.currentStock}</td><td>{product.averageDailySales}</td><td>{product.daysOfStockRemaining ?? "—"}</td><td>{product.targetDays}</td><td>{product.quantityRequired} units</td><td>{product.packRounding.calculatedPacks} → {product.packRounding.recommendedPacks} packs</td><td>{currency(product.expectedSupplierCostGbp)}</td><td>{currency(product.expectedSellingRevenueGbp)}</td><td>{currency(product.expectedGrossProfitGbp)}</td></tr>)}
            </tbody></table></div>
            <footer><span>Supplier minimum: {recommendation.supplierMinimumStatus}</span><span>Confidence: {recommendation.confidence.replaceAll("_", " ")}</span></footer>
          </section>
        ))}
        {recommendations.length === 0 ? <section className="purchase-intelligence-empty"><h2>No supplier recommendation is trusted</h2><p>Vault OS will display a recommendation only when catalogue, inventory, supplier, commercial, wallet and approval evidence are all complete and trusted.</p></section> : null}
      </main>
    </VaultAppShell>
  );
}
