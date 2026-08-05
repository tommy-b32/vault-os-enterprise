import Link from "next/link";

import VaultAppShell from "@/components/layout/VaultAppShell";
import type { PurchasingWalletData } from "@/components/commercial/PurchasingWallet";
import type { SupplierPurchasingData } from "@/components/commercial/SupplierPurchasing";
import { AdvisorEngine } from "@/lib/brain/AdvisorEngine";
import type {
  AdvisorDiagnostics,
} from "@/lib/brain/AdvisorEngine";
import type {
  Opportunity,
} from "@/lib/brain/OpportunityEngine";
import { TrustedBuyingCandidateClassifier } from "@/lib/brain/TrustedBuyingCandidateClassifier";
import { getCatalogueData } from "@/lib/catalogue";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  CatalogueProduct,
} from "@/types/catalogue";

export const dynamic = "force-dynamic";

type DecisionBlocker = {
  id: string;
  title: string;
  description: string;
  count: number;
  href: string;
  action: string;
};

type ReadinessCheck = {
  id: string;
  title: string;
  description: string;
  state: "operational" | "partial" | "attention" | "unavailable";
  importance: "mandatory" | "supporting";
  href: string;
  action: string;
};

function coverageState(
  ready: number,
  total: number,
): ReadinessCheck["state"] {
  if (total === 0) return "unavailable";
  if (ready === total) return "operational";
  if (ready > 0) return "partial";
  return "attention";
}

function formatGbp(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function formatCoverage(
  ready: number,
  total: number,
  capability: string,
): string {
  const remaining = Math.max(0, total - ready);

  if (total > 0 && ready === total) {
    return `All ${total} products ${capability}.`;
  }

  if (ready === 0) {
    return `No products currently ${capability}.`;
  }

  return `${ready} products ready · ${remaining} need attention.`;
}

function getDestinationLabel(href: string): string {
  return href === "/inventory"
    ? "Open Inventory"
    : href === "/commercial"
      ? "Open Commercial Intelligence"
      : "Open Catalogue";
}

function buildDecisionBlockers(
  diagnostics: AdvisorDiagnostics,
): DecisionBlocker[] {
  const blockers: DecisionBlocker[] = [];
  const missingSuppliers = Math.max(
    0,
    diagnostics.productsScanned -
      diagnostics.supplierAssigned,
  );
  const untrustedReorderRules = Math.max(
    0,
    diagnostics.productsScanned -
      diagnostics.trustedForReorder,
  );

  if (diagnostics.staleInventory > 0) {
    blockers.push({
      id: "inventory-stale",
      title: "Inventory intelligence is stale",
      description:
        "Trusted quantities remain blocked until canonical inventory is synchronized within the freshness policy.",
      count: diagnostics.staleInventory,
      href: "/inventory",
      action: "Refresh inventory intelligence",
    });
  }

  if (diagnostics.supplierMinimumUnknown > 0) {
    blockers.push({
      id: "supplier-minimum",
      title: "Supplier minimum-order rules are unresolved",
      description:
        "Unknown supplier minimums remain blocking and are not treated as satisfied.",
      count: diagnostics.supplierMinimumUnknown,
      href: "/commercial",
      action: "Set supplier minimum-order rules",
    });
  }

  if (diagnostics.targetStockDaysMissing > 0) {
    blockers.push({
      id: "target-stock-days",
      title: "Target stock days are incomplete",
      description:
        "The quantity engine requires canonical target stock days before calculating a trusted reorder.",
      count: diagnostics.targetStockDaysMissing,
      href: "/catalogue",
      action: "Complete target stock days",
    });
  }

  if (diagnostics.reorderApprovalMissing > 0) {
    blockers.push({
      id: "reorder-approval",
      title: "Explicit reorder approval is missing",
      description:
        "Eligible products require an operator approval before Advisor can trust a reorder decision.",
      count: diagnostics.reorderApprovalMissing,
      href: "/catalogue",
      action: "Review reorder approvals",
    });
  }

  if (diagnostics.commercialDataMissing > 0) {
    blockers.push({
      id: "commercial-data",
      title: "Trusted commercial data is incomplete",
      description:
        "Cost, margin or return data is preventing trusted commercial decisions.",
      count: diagnostics.commercialDataMissing,
      href: "/catalogue",
      action: "Review commercial data",
    });
  }

  if (missingSuppliers > 0) {
    blockers.push({
      id: "supplier-assignment",
      title: "Supplier assignments are incomplete",
      description:
        "Products without a canonical supplier cannot support a complete recommendation.",
      count: missingSuppliers,
      href: "/catalogue",
      action: "Review supplier assignments",
    });
  }

  if (untrustedReorderRules > 0) {
    blockers.push({
      id: "reorder-rules",
      title: "Reorder configuration is not trusted",
      description:
        "Incomplete restock rules reduce the number of actionable opportunities.",
      count: untrustedReorderRules,
      href: "/catalogue",
      action: "Review product rules",
    });
  }

  return blockers.slice(0, 3);
}

function buildReadinessChecks(
  products: CatalogueProduct[],
  diagnostics: AdvisorDiagnostics,
): ReadinessCheck[] {
  const total = diagnostics.productsScanned;
  const analysedProducts = products.filter(
    (product) => product.product_vision !== null,
  ).length;

  return [
    {
      id: "configuration-trust",
      title: "Catalogue trust",
      description: formatCoverage(
        diagnostics.configurationTrusted,
        total,
        "have enough trusted catalogue data for commercial analysis",
      ),
      state: coverageState(diagnostics.configurationTrusted, total),
      importance: "mandatory",
      href: "/catalogue",
      action: "Complete catalogue data",
    },
    {
      id: "supplier-assignment",
      title: "Supplier coverage",
      description: formatCoverage(
        diagnostics.supplierAssigned,
        total,
        "have a supplier assigned",
      ),
      state: coverageState(diagnostics.supplierAssigned, total),
      importance: "mandatory",
      href: "/catalogue",
      action: "Complete supplier coverage",
    },
    {
      id: "restock-configuration",
      title: "Restock readiness",
      description: formatCoverage(
        diagnostics.restockEnabled,
        total,
        "have restocking enabled",
      ),
      state: coverageState(diagnostics.restockEnabled, total),
      importance: "mandatory",
      href: "/catalogue",
      action: "Complete restock rules",
    },
    {
      id: "reorder-approval",
      title: "Reorder approval",
      description: formatCoverage(
        total - diagnostics.reorderApprovalMissing,
        total,
        "have explicit operator approval for reorder",
      ),
      state: coverageState(total - diagnostics.reorderApprovalMissing, total),
      importance: "mandatory",
      href: "/catalogue",
      action: "Review reorder approvals",
    },
    {
      id: "reorder-trust",
      title: "Buying rules",
      description: formatCoverage(
        diagnostics.trustedForReorder,
        total,
        "are trusted for reorder decisions",
      ),
      state: coverageState(diagnostics.trustedForReorder, total),
      importance: "mandatory",
      href: "/catalogue",
      action: "Complete buying rules",
    },
    {
      id: "trusted-costs",
      title: "Commercial costs",
      description: formatCoverage(
        diagnostics.commercialCostTrusted,
        total,
        "have trusted cost information",
      ),
      state: coverageState(diagnostics.commercialCostTrusted, total),
      importance: "mandatory",
      href: "/catalogue",
      action: "Complete commercial costs",
    },
    {
      id: "commercial-data",
      title: "Profit and return data",
      description: formatCoverage(
        diagnostics.commercialDataComplete,
        total,
        "have complete margin and return data",
      ),
      state: coverageState(diagnostics.commercialDataComplete, total),
      importance: "mandatory",
      href: "/catalogue",
      action: "Complete commercial data",
    },
    {
      id: "margin-rule",
      title: "Margin readiness",
      description: formatCoverage(
        diagnostics.marginThresholdPassed,
        total,
        "pass the existing margin rule",
      ),
      state: coverageState(diagnostics.marginThresholdPassed, total),
      importance: "mandatory",
      href: "/catalogue",
      action: "Complete margin rules",
    },
    {
      id: "return-rule",
      title: "Return readiness",
      description: formatCoverage(
        diagnostics.returnThresholdPassed,
        total,
        "pass the existing return rule",
      ),
      state: coverageState(diagnostics.returnThresholdPassed, total),
      importance: "mandatory",
      href: "/catalogue",
      action: "Complete return rules",
    },
    {
      id: "inventory-eligibility",
      title: "Inventory opportunity",
      description:
        diagnostics.lowStock > 0
          ? `${diagnostics.lowStock} products currently meet the existing low-stock condition.`
          : "No products currently meet the existing low-stock condition.",
      state: coverageState(diagnostics.lowStock, total),
      importance: "mandatory",
      href: "/inventory",
      action: "Review inventory",
    },
    {
      id: "product-intelligence",
      title: "Product Intelligence",
      description: formatCoverage(
        analysedProducts,
        total,
        "have completed Product Intelligence analysis",
      ),
      state: coverageState(analysedProducts, total),
      importance: "supporting",
      href: "/catalogue",
      action: "Complete Product Intelligence",
    },
  ];
}

async function loadAdvisorPage() {
  try {
    const [{ products }, walletResponse, supplierResponse, supplierRuleResponse] = await Promise.all([
      getCatalogueData(),
      supabaseAdmin.from("vault_purchasing_wallet").select(`
        ledger_balance_gbp,
        protected_reserve_gbp,
        committed_orders_gbp,
        calculated_purchasing_power_gbp,
        available_purchasing_power_gbp,
        manual_spending_limit_gbp,
        reserve_override_allowed,
        wallet_last_updated,
        purchasing_power_state
      `).single(),
      supabaseAdmin.from("vault_suppliers").select(`
        id,
        supplier_name,
        is_active,
        default_lead_time_days,
        minimum_order_value,
        currency_code,
        notes
      `),
      supabaseAdmin.from("vault_supplier_purchasing_rules").select(`
        supplier_id,
        minimum_order_packs
      `),
    ]);
    const wallet = walletResponse.error
      ? null
      : walletResponse.data as PurchasingWalletData;
    const packMinimumBySupplierId = new Map(
      (supplierRuleResponse.data ?? []).map((rule) => [
        rule.supplier_id,
        rule.minimum_order_packs,
      ]),
    );
    const suppliers = supplierResponse.error || supplierRuleResponse.error
      ? []
      : (supplierResponse.data ?? []).map((supplier) => ({
          ...supplier,
          minimum_order_packs: packMinimumBySupplierId.get(supplier.id) ?? null,
        })) as SupplierPurchasingData[];
    const candidates = products.map((product) => {
      const supplier = suppliers.find((entry) => entry.id === product.supplier_id);
      return TrustedBuyingCandidateClassifier.classify({
        product,
        supplier: supplier
          ? {
              id: supplier.id,
              name: supplier.supplier_name,
              active: supplier.is_active,
              currency: supplier.currency_code,
              minimumOrderValue: supplier.minimum_order_value,
              minimumOrderPacks: supplier.minimum_order_packs,
            }
          : null,
        wallet: wallet
          ? { available: true, lastUpdated: wallet.wallet_last_updated }
          : null,
      });
    });

    return {
      advisor: AdvisorEngine.analyse({ products, candidates }),
      products,
      error: null,
    };
  } catch (error) {
    return {
      advisor: null,
      products: null,
      error:
        error instanceof Error
          ? error.message
          : "An unknown advisor error occurred.",
    };
  }
}

function OpportunitySummary({
  opportunity,
}: {
  opportunity: Opportunity;
}) {
  return (
    <>
      <p>{opportunity.description}</p>
      <dl className="advisor-opportunity-facts">
        <div>
          <dt>Expected gain</dt>
          <dd>{formatGbp(opportunity.estimatedProfit)}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{opportunity.confidence}%</dd>
        </div>
        <div>
          <dt>Priority</dt>
          <dd>{formatLabel(opportunity.priority)}</dd>
        </div>
      </dl>
    </>
  );
}

export default async function AdvisorPage() {
  const result = await loadAdvisorPage();

  if (!result.advisor) {
    return (
      <VaultAppShell
        searchPlaceholder="Search advisor..."
        systemStatusLabel="Commercial advisor unavailable"
      >
        <main className="catalogue-error">
          <h1>Commercial Advisor unavailable</h1>
          <p>{result.error}</p>
        </main>
      </VaultAppShell>
    );
  }

  const { analysis, diagnostics } = result.advisor;
  const primaryDecision = analysis.highestPriority;
  const rankedOpportunities = analysis.ranked.slice(1, 6);
  const blockers = buildDecisionBlockers(diagnostics);
  const advisorConfidence =
    analysis.ranked.length > 0
      ? `${analysis.averageConfidence}%`
      : "Not ready";
  const readinessChecks = buildReadinessChecks(
    result.products ?? [],
    diagnostics,
  );
  const operationalSignals = readinessChecks.filter(
    (check) => check.state !== "unavailable",
  ).length;
  const partialSignals = readinessChecks.filter(
    (check) => check.state === "partial",
  ).length;
  const nextSteps = blockers;
  const trustedCandidates = diagnostics.productsQualifying;
  const primaryProduct = primaryDecision
    ? result.products?.find(
        (product) => product.style_id === primaryDecision.id,
      ) ?? null
    : null;
  const primaryCommercialInput = primaryDecision
    ? result.advisor.commercialInputs.find(
        (input) => input.productId === primaryDecision.id,
      ) ?? null
    : null;

  return (
    <VaultAppShell
      searchPlaceholder="Search advisor..."
      notificationCount={analysis.ranked.length}
      systemStatusLabel="Commercial advisor online"
    >
      <main className="advisor-decision-page">
        <header className="advisor-decision-header">
          <div>
            <p className="vault-eyebrow">COMMERCIAL ADVISOR</p>
            <h1>Commercial Advisor</h1>
            <p>
              Prioritised actions to improve revenue, margin, stock
              availability and purchasing confidence.
            </p>
          </div>

          <article className="advisor-confidence-card">
            <span>Advisor Confidence</span>
            <strong>{advisorConfidence}</strong>
          </article>
        </header>

        {primaryDecision ? (
          <>
            {blockers.length > 0 ? (
              <div className="advisor-limited-notice">
                Recommendations remain available, but incomplete
                catalogue data is limiting decision confidence.
              </div>
            ) : null}

            <section className="advisor-primary-section">
              <div className="advisor-section-heading">
                <div>
                  <p className="vault-eyebrow">
                    Today&apos;s Commercial Decision
                  </p>
                  <h2>{primaryDecision.title}</h2>
                </div>
                <span className={`advisor-priority is-${primaryDecision.priority}`}>
                  {formatLabel(primaryDecision.priority)} priority
                </span>
              </div>

              <div className="advisor-primary-card">
                <OpportunitySummary opportunity={primaryDecision} />
                {primaryProduct && primaryCommercialInput ? (
                  <dl className="advisor-opportunity-facts advisor-trusted-evidence">
                    <div><dt>Supplier</dt><dd>{primaryProduct.supplier_company ?? "Unavailable"}</dd></div>
                    <div><dt>Current stock</dt><dd>{primaryProduct.stock_on_hand}</dd></div>
                    <div><dt>Committed</dt><dd>{primaryProduct.committed_stock ?? "Unavailable"}</dd></div>
                    <div><dt>Incoming</dt><dd>{primaryProduct.incoming_stock ?? "Unavailable"}</dd></div>
                    <div><dt>Seven-day velocity</dt><dd>{primaryProduct.replenishment_intelligence.averageDailySales === null ? "Unavailable" : `${primaryProduct.replenishment_intelligence.averageDailySales.toFixed(2)} units/day`}</dd></div>
                    <div><dt>Lead time</dt><dd>{primaryProduct.replenishment_intelligence.supplierLeadTimeDays === null ? "Unavailable" : `${primaryProduct.replenishment_intelligence.supplierLeadTimeDays} days`}</dd></div>
                    <div><dt>Target stock</dt><dd>{primaryProduct.target_stock_days === null ? "Unavailable" : `${primaryProduct.target_stock_days} days`}</dd></div>
                    <div><dt>Suggested quantity</dt><dd>{primaryCommercialInput.recommendedOrderQuantity} packs</dd></div>
                    <div><dt>Landed pack cost</dt><dd>{formatGbp(primaryCommercialInput.purchaseCost)}</dd></div>
                    <div><dt>Estimated order cost</dt><dd>{formatGbp(primaryCommercialInput.purchaseCost * primaryCommercialInput.recommendedOrderQuantity)}</dd></div>
                    <div><dt>Margin</dt><dd>{primaryCommercialInput.marginPercent === null ? "Unavailable" : `${primaryCommercialInput.marginPercent.toFixed(1)}%`}</dd></div>
                    <div><dt>Return on capital</dt><dd>{primaryCommercialInput.returnOnCapital === null ? "Unavailable" : `${primaryCommercialInput.returnOnCapital.toFixed(1)}%`}</dd></div>
                  </dl>
                ) : null}
                {blockers[0] ? (
                  <div className="advisor-primary-blocker">
                    <span>Primary blocker</span>
                    <strong>{blockers[0].title}</strong>
                    <p>{blockers[0].description}</p>
                    <Link href={blockers[0].href}>
                      {blockers[0].action} →
                    </Link>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="advisor-decision-section">
              <div className="advisor-section-heading">
                <div>
                  <p className="vault-eyebrow">Ranked Opportunities</p>
                  <h2>Next best commercial actions</h2>
                </div>
                <span>{rankedOpportunities.length} shown</span>
              </div>

              {rankedOpportunities.length > 0 ? (
                <ol className="advisor-ranked-list">
                  {rankedOpportunities.map((opportunity, index) => (
                    <li key={opportunity.id}>
                      <span className="advisor-rank">{index + 2}</span>
                      <div>
                        <div className="advisor-ranked-heading">
                          <strong>{opportunity.title}</strong>
                          <span>{formatLabel(opportunity.priority)}</span>
                        </div>
                        <OpportunitySummary opportunity={opportunity} />
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="advisor-compact-empty">
                  No additional ranked opportunities are currently
                  available.
                </div>
              )}
            </section>

            <section className="advisor-decision-section">
              <div className="advisor-section-heading">
                <div>
                  <p className="vault-eyebrow">Decision Blockers</p>
                  <h2>What is reducing recommendation quality</h2>
                </div>
              </div>

              {blockers.length > 0 ? (
                <div className="advisor-blocker-grid">
                  {blockers.map((blocker) => (
                    <article key={blocker.id}>
                      <span>{blocker.count} affected</span>
                      <h3>{blocker.title}</h3>
                      <p>{blocker.description}</p>
                      <Link href={blocker.href}>{blocker.action} →</Link>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="advisor-compact-empty">
                  No material decision blockers were found.
                </div>
              )}
            </section>

            <section className="advisor-decision-section">
              <div className="advisor-section-heading">
                <div>
                  <p className="vault-eyebrow">Advisor Rationale</p>
                  <h2>Why Vault OS recommends this</h2>
                </div>
              </div>

              <article className="advisor-rationale-card">
                <p>{primaryDecision.description}</p>
                <dl>
                  <div>
                    <dt>Impacted area</dt>
                    <dd>{formatLabel(primaryDecision.source)}</dd>
                  </div>
                  <div>
                    <dt>Confidence</dt>
                    <dd>{primaryDecision.confidence}%</dd>
                  </div>
                  <div>
                    <dt>Expected outcome</dt>
                    <dd>{formatGbp(primaryDecision.estimatedProfit)}</dd>
                  </div>
                </dl>
              </article>
            </section>
          </>
        ) : (
          <section className="advisor-readiness-panel">
            <header className="advisor-readiness-header">
              <div>
                <p className="vault-eyebrow">COMMERCIAL READINESS</p>
                <h2>Advisor is building decision confidence</h2>
                <p className="advisor-readiness-executive-copy">
                  {operationalSignals} readiness signals are operational,
                  but no product currently satisfies every mandatory
                  requirement and produces a trusted positive quantity.
                </p>
                <p>
                  Complete the remaining catalogue, supplier and
                  commercial requirements so Vault OS can recommend
                  trusted actions.
                </p>
              </div>

              <div className="advisor-readiness-summary">
                <strong>{operationalSignals}</strong>
                <span>readiness systems operational</span>
                <small>{partialSignals} with partial product coverage</small>
              </div>
            </header>

            <section className="advisor-candidate-summary">
              <div>
                <p className="vault-eyebrow">Trusted Buying Candidates</p>
                <h3>No trusted buying candidate yet</h3>
              </div>
              <dl>
                <div><dt>Products evaluated</dt><dd>{diagnostics.productsScanned}</dd></div>
                <div><dt>Eligible</dt><dd>{diagnostics.eligible}</dd></div>
                <div><dt>Ineligible</dt><dd>{diagnostics.ineligible}</dd></div>
                <div><dt>Blocked by policy</dt><dd>{diagnostics.blockedByPolicy}</dd></div>
                <div><dt>Unavailable</dt><dd>{diagnostics.unavailable}</dd></div>
                <div><dt>Trusted replenishment inputs</dt><dd>{diagnostics.trustedReplenishmentInputs}</dd></div>
                <div><dt>Trusted positive quantity</dt><dd>{diagnostics.trustedQuantityProduced}</dd></div>
                <div><dt>Fully eligible</dt><dd>{trustedCandidates}</dd></div>
              </dl>
              {blockers[0] ? <p>{blockers[0].description}</p> : null}
            </section>

            <div className="advisor-readiness-layout">
              <div className="advisor-readiness-checklist">
                <div className="advisor-readiness-subheading">
                  <h3>Decision Confidence Assessment</h3>
                  <span>Decision-enabling signals</span>
                </div>

                {readinessChecks.map((check) => (
                  <article
                    className={`advisor-readiness-check is-${check.state}`}
                    key={check.id}
                  >
                    <span
                      aria-hidden="true"
                      className="advisor-readiness-icon"
                    >
                      {check.state === "operational" ? "✓" : "!"}
                    </span>
                    <div>
                      <div className="advisor-readiness-check-heading">
                        <h4>{check.title}</h4>
                        <span>{check.importance}</span>
                      </div>
                      <p>{check.description}</p>
                    </div>
                    <div className="advisor-readiness-check-action">
                      <span>{
                        check.state === "operational"
                          ? "Operational"
                          : check.state === "partial"
                            ? "Partial coverage"
                            : check.state === "unavailable"
                              ? "Unavailable"
                              : "Attention required"
                      }</span>
                      {check.state !== "operational" ? (
                        <Link href={check.href}>{check.action} →</Link>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>

              <aside className="advisor-next-steps">
                <p className="vault-eyebrow">Next Best Steps</p>
                <h3>Strengthen decision readiness</h3>

                {nextSteps.length > 0 ? (
                  <ol>
                    {nextSteps.map((step) => (
                      <li key={step.id}>
                        <strong>{step.action}</strong>
                        <p>{step.description}</p>
                        <Link href={step.href}>
                          {getDestinationLabel(step.href)} →
                        </Link>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="advisor-next-steps-empty">
                    All supported readiness requirements are available.
                  </p>
                )}
              </aside>
            </div>
          </section>
        )}
      </main>
    </VaultAppShell>
  );
}
