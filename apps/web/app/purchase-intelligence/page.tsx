import type { PurchasingWalletData } from "@/components/commercial/PurchasingWallet";
import VaultAppShell from "@/components/layout/VaultAppShell";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import {
  PurchaseIntelligenceEngine,
  type PurchaseIntelligenceSupplier,
} from "@/lib/brain/PurchaseIntelligenceEngine";
import { PurchaseIntelligenceDiagnostics } from "@/lib/brain/PurchaseIntelligenceDiagnostics";
import type { DemandIntelligenceResult } from "@/lib/brain/DemandIntelligenceEngine";
import { ReplenishmentDecisionExplanationEngine } from "@/lib/brain/ReplenishmentDecisionExplanation";
import { getCatalogueData } from "@/lib/catalogue";
import { InventorySyncRepository } from "@/lib/inventory/InventorySyncRepository";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadFixedPackPurchaseRecommendations } from "@/lib/fixed-pack-purchase-recommendations";
import { loadCurrentFixedPackDraftMatches } from "@/lib/purchase-orders/FixedPackDraftRepository";
import { buildStockPurchasingPlan, type StockPurchasingPlanCandidate } from "@/lib/stock-purchasing-plan";
import { stage3CurrentDaysCover, stage3PackFit, stage3StockState } from "@/lib/stock-reorder-presentation";
import PurchaseRecommendationsPanel, { ReplenishmentDiagnostics } from "./PurchaseRecommendationsPanel";
import StockPurchasingPlanPanel from "./StockPurchasingPlanPanel";

export const dynamic = "force-dynamic";

function currency(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}

function reasonCodeLabel(reason: string): string {
  return reason.toLowerCase().split("_").map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(" ");
}

function fixedPackProductKey(styleId: string, parentProductId: string, supplierId: string) {
  return `${styleId}\u0000${parentProductId}\u0000${supplierId}`;
}

function DemandDecisionDetails({ demand }: { demand: DemandIntelligenceResult }) {
  const explanation = ReplenishmentDecisionExplanationEngine.explain(demand);
  return <div key={demand.styleId}>
    <strong>{demand.productName} — {demand.styleId.split("::").at(-1)}</strong>
    <small>Decision: {explanation.state.replaceAll("_", " ")} · Demand: {demand.demand_status} · Urgency: {demand.urgency ?? "Not applicable"}</small>
    <small>Sales: {explanation.sales_evidence}</small>
    <small>Stock: {explanation.stock_evidence}</small>
    {explanation.recommended_quantity ? <small>Recommended: {explanation.recommended_quantity}</small> : null}
    <small>{explanation.reason}</small>
  </div>;
}

export default async function PurchaseIntelligencePage() {
  const operator = await requireAuthenticatedOperator();
  const fixedPackResults = await loadFixedPackPurchaseRecommendations().catch(() => null);
  const draftMatches = fixedPackResults === null ? new Map() : await loadCurrentFixedPackDraftMatches(operator.id, fixedPackResults).catch(() => new Map());
  const [catalogue, freshness, walletResult, suppliersResult, rulesResult, budgetResult] = await Promise.all([
    getCatalogueData(),
    InventorySyncRepository.getFreshness(),
    supabaseAdmin.from("vault_purchasing_wallet").select("ledger_balance_gbp, protected_reserve_gbp, committed_orders_gbp, calculated_purchasing_power_gbp, available_purchasing_power_gbp, manual_spending_limit_gbp, reserve_override_allowed, wallet_last_updated, wallet_freshness_threshold_minutes, purchasing_power_state").single(),
    supabaseAdmin.from("vault_suppliers").select("id, supplier_name, is_active, minimum_order_value, currency_code"),
    supabaseAdmin.from("vault_supplier_purchasing_rules").select("supplier_id, minimum_order_packs"),
    supabaseAdmin.from("vault_stock_purchasing_budget").select("budget_gbp").eq("id", true).maybeSingle(),
  ]);
  const sourceError = walletResult.error ?? suppliersResult.error ?? rulesResult.error ?? budgetResult.error;
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
  const productsByFixedPackIdentity = new Map<string, typeof catalogue.products>();
  for (const product of catalogue.products) {
    const key = fixedPackProductKey(product.style_id, product.parent_product_id, product.supplier_id ?? "");
    productsByFixedPackIdentity.set(key, [...(productsByFixedPackIdentity.get(key) ?? []), product]);
  }
  const supplierNameById = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
  const presentedFixedPackResults = fixedPackResults === null ? null : fixedPackResults.map((result) => {
    if (result.kind !== "recommendation") return result;
    const products = productsByFixedPackIdentity.get(fixedPackProductKey(result.recommendation.styleId, result.recommendation.parentProductId, result.recommendation.supplierId)) ?? [];
    return {
      ...result,
      recommendation: {
        ...result.recommendation,
        productName: products.length === 1 ? products[0].product_name : null,
        supplierName: supplierNameById.get(result.recommendation.supplierId) ?? null,
        draftMatch: draftMatches.get(result.recommendation.recommendationId) ?? null,
      },
    };
  });
  const planCandidates: StockPurchasingPlanCandidate[] = presentedFixedPackResults?.flatMap((result) => {
    if (result.kind !== "recommendation") return [];
    const recommendation = result.recommendation;
    const product = (productsByFixedPackIdentity.get(fixedPackProductKey(recommendation.styleId, recommendation.parentProductId, recommendation.supplierId)) ?? []);
    const canonical = product.length === 1 ? product[0] : null;
    const landedCost = canonical?.commercial_cost?.landed_cost_per_pack_gbp;
    const currentCovers = recommendation.sizes.map(stage3CurrentDaysCover).filter((value): value is number => value !== null);
    const packFit = stage3PackFit(recommendation);
    return [{ recommendationId: recommendation.recommendationId, supplierId: recommendation.supplierId, supplierName: recommendation.supplierName, styleId: recommendation.styleId, parentProductId: recommendation.parentProductId, productName: recommendation.productName, modelDesign: recommendation.modelDesign, trusted: recommendation.trusted, recommendedPackCount: recommendation.recommendedPackCount, recommendedTotalUnits: recommendation.recommendedTotalUnits, landedCostPerPackGbp: typeof landedCost === "number" && Number.isFinite(landedCost) ? landedCost : null, stockState: stage3StockState(recommendation), packFit: packFit === "DO NOT REORDER" ? null : packFit, currentCoverDays: currentCovers.length ? Math.min(...currentCovers) : null, demandPressure: recommendation.totalIdealNeedUnits ?? 0, leadTimeDays: recommendation.governedLeadTimeDays, totalShortageRemainingUnits: recommendation.totalShortageRemainingUnits ?? 0, totalProjectedExcessUnits: recommendation.totalProjectedExcessUnits ?? 0, reasonCodes: recommendation.reasonCodes }];
  }) ?? [];
  const planning = buildStockPurchasingPlan(planCandidates, budgetResult.data?.budget_gbp ?? null, (walletResult.data as PurchasingWalletData).available_purchasing_power_gbp);
  const evaluation = PurchaseIntelligenceEngine.evaluate({
    products: catalogue.products,
    suppliers,
    wallet: walletResult.data as PurchasingWalletData,
    inventoryTrusted: freshness.syncStatus === "current",
  });
  const diagnostics = PurchaseIntelligenceDiagnostics.build({
    suppliers,
    evaluation,
  });

  return (
    <VaultAppShell searchPlaceholder="Search purchase intelligence..." systemStatusLabel="Purchase intelligence is read-only">
      <main className="purchase-intelligence-page">
        <header className="purchase-intelligence-header">
          <div><p className="vault-eyebrow">PURCHASING · RECOMMENDATIONS</p><h1>Recommendations</h1><p>What to buy, from whom, and why — grouped by supplier and constrained by governed cash, minimums, and trust evidence.</p></div>
          <span>Actionable replenishment first</span>
        </header>
        {presentedFixedPackResults === null ? <section className="purchase-intelligence-notice"><strong>Fixed-pack recommendations unavailable</strong><span>Purchase Intelligence remains available while the fixed-pack recommendation service is unavailable.</span></section> : <PurchaseRecommendationsPanel results={presentedFixedPackResults} />}
        <StockPurchasingPlanPanel plan={planning} />
        <section className="purchase-intelligence-notice"><strong>Read-only intelligence</strong><span>No purchase orders are created and no purchases are approved from this page.</span></section>
        <details className="purchase-intelligence-diagnostics">
          <summary>Supplier basket diagnostics and blockers</summary>
          <div className="purchase-intelligence-diagnostics-heading"><div><p className="vault-eyebrow">SUPPLIER SUMMARY</p><h2>Basket intelligence</h2></div><span>Advisory only</span></div>
          <div className="purchase-intelligence-diagnostic-grid">
            {evaluation.baskets.map((basket) => (
              <article className={`purchase-intelligence-diagnostic is-${basket.purchasing_state === "READY_TO_ORDER" ? "trusted" : "blocked"}`} key={basket.supplier.id}>
                <header><div><span>Supplier</span><h3>{basket.supplier.name}</h3></div><div><strong>{basket.purchasing_state === "READY_TO_ORDER" ? "PACK MINIMUM MET" : basket.purchasing_state}</strong>{basket.purchasing_state === "READY_TO_ORDER" ? <small>Advisory basket status — this means the supplier&apos;s governed pack minimum is satisfied; it does not mean the overall purchasing recommendation has been approved.</small> : null}</div></header>
                <dl>
                  <div><dt>Demand products</dt><dd>{basket.products_recommended}</dd></div>
                  <div><dt>Required packs</dt><dd>{basket.required_packs}</dd></div>
                  <div><dt>Strong advisory packs</dt><dd>{basket.advisory_supported_packs}</dd></div>
                  <div><dt>Intelligent basket</dt><dd>{basket.intelligent_basket_packs} packs</dd></div>
                  <div><dt>Supplier minimum</dt><dd>{basket.supplier_minimum_packs ?? "Unavailable"} packs</dd></div>
                  <div><dt>Remaining shortfall</dt><dd>{basket.remaining_shortfall_packs ?? "Unavailable"} packs</dd></div>
                  <div><dt>Estimated spend</dt><dd>{basket.estimated_order_value === null ? "Unavailable" : currency(basket.estimated_order_value)}</dd></div>
                  <div><dt>Projected intelligent-basket spend</dt><dd>{basket.projected_intelligent_basket_spend === null ? "Unavailable" : currency(basket.projected_intelligent_basket_spend)}</dd></div>
                  <div><dt>Value short</dt><dd>{basket.value_short === null ? "Unavailable" : currency(basket.value_short)}</dd></div>
                </dl>
                {basket.purchasing_state === "MINIMUM_NOT_JUSTIFIED" && basket.supplier_minimum_packs !== null && basket.remaining_shortfall_packs !== null ? <p>Current demand supports {basket.intelligent_basket_packs} packs. Supplier minimum is {basket.supplier_minimum_packs} packs. A further {basket.remaining_shortfall_packs} packs are required, but no additional products currently meet the demand-quality threshold.</p> : null}
                {basket.top_products.length > 0 ? <div className="purchase-intelligence-rejections"><span>Top products already recommended</span><ul>{basket.top_products.map((product) => <li key={product.style_id}>{product.product_name}: {product.required_packs} packs</li>)}</ul></div> : null}
                {basket.additional_qualifying_products.length > 0 ? <div className="purchase-intelligence-rejections"><span>Demand-supported bring-forward options</span><ul>{basket.additional_qualifying_products.map((product) => <li key={product.style_id}>{product.product_name}: bring forward {product.required_packs} {product.required_packs === 1 ? "pack" : "packs"}</li>)}</ul>{basket.minimum_reached_with_additions ? <p>If you add these products the supplier minimum will be reached.</p> : <p>Demand supports bringing these products forward, but they are not currently required for replenishment.</p>}</div> : null}
              </article>
            ))}
          </div>
        </details>
        <details className="purchase-intelligence-diagnostics">
          <summary>Supplier trust diagnostics</summary>
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
                  <div className="purchase-intelligence-rejections"><span>Demand evidence unavailable</span>{diagnostic.demandMissingRequirements.length > 0 ? <ul>{diagnostic.demandMissingRequirements.map((reason) => <li key={reason}>{reasonCodeLabel(reason)}</li>)}</ul> : <p>None</p>}</div>
                  {diagnostic.demandItems.length > 0 ? <div className="purchase-intelligence-demand-items"><span>Products needing replenishment</span>{diagnostic.demandItems.map((demand) => <DemandDecisionDetails demand={demand} key={demand.styleId} />)}</div> : null}
                  {diagnostic.slowDemandWatchItems.length > 0 ? <div className="purchase-intelligence-demand-items"><span>Slow demand — watch</span>{diagnostic.slowDemandWatchItems.map((demand) => <DemandDecisionDetails demand={demand} key={demand.styleId} />)}</div> : null}
                </section>
                <section className="purchase-intelligence-stage">
                  <p className="vault-eyebrow">PURCHASING QUALIFICATION</p>
                  <dl>
                    <div><dt>Purchasing eligible</dt><dd>{diagnostic.purchasingEligible}</dd></div>
                    <div><dt>Purchasing blocked</dt><dd>{diagnostic.purchasingBlocked}</dd></div>
                    <div><dt>Purchasing state</dt><dd>{diagnostic.purchasingState.replaceAll("_", " ")}</dd></div>
                  </dl>
                  <div className="purchase-intelligence-rejections"><span>Purchasing-policy blockers</span>{diagnostic.purchasingBlockers.length > 0 ? <ul>{diagnostic.purchasingBlockers.map((reason) => <li key={reason}>{reasonCodeLabel(reason)}</li>)}</ul> : <p>None</p>}</div>
                </section>
                <footer><strong>Final recommendation status: {diagnostic.finalRecommendationStatus}</strong></footer>
              </article>
            ))}
          </div>
        </details>
        {presentedFixedPackResults === null ? null : <ReplenishmentDiagnostics results={presentedFixedPackResults} />}
      </main>
    </VaultAppShell>
  );
}
