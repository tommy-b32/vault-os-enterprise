import Link from "next/link";

import VaultAppShell from "@/components/layout/VaultAppShell";
import { AdvisorEngine } from "@/lib/brain/AdvisorEngine";
import type {
  AdvisorDiagnostics,
} from "@/lib/brain/AdvisorEngine";
import type {
  Opportunity,
} from "@/lib/brain/OpportunityEngine";
import { getCatalogueData } from "@/lib/catalogue";
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
  state: "ready" | "attention" | "unavailable";
  importance: "mandatory" | "supporting";
  href: string;
  action: string;
};

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
      state:
        diagnostics.configurationTrusted > 0
          ? "ready"
          : "attention",
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
      state:
        diagnostics.supplierAssigned > 0
          ? "ready"
          : "attention",
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
      state:
        diagnostics.restockEnabled > 0
          ? "ready"
          : "attention",
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
      state:
        diagnostics.reorderApprovalMissing < total
          ? "ready"
          : "attention",
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
      state:
        diagnostics.trustedForReorder > 0
          ? "ready"
          : "attention",
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
      state:
        diagnostics.commercialCostTrusted > 0
          ? "ready"
          : "attention",
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
      state:
        diagnostics.commercialDataComplete > 0
          ? "ready"
          : "attention",
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
      state:
        diagnostics.marginThresholdPassed > 0
          ? "ready"
          : "attention",
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
      state:
        diagnostics.returnThresholdPassed > 0
          ? "ready"
          : "attention",
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
      state:
        diagnostics.lowStock > 0
          ? "ready"
          : "attention",
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
      state:
        analysedProducts > 0
          ? "ready"
          : "attention",
      importance: "supporting",
      href: "/catalogue",
      action: "Complete Product Intelligence",
    },
  ];
}

async function loadAdvisorPage() {
  try {
    const { products } = await getCatalogueData();

    return {
      advisor: AdvisorEngine.analyse({ products }),
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
  const readyRequirements = readinessChecks.filter(
    (check) => check.state === "ready",
  ).length;
  const attentionRequirements = readinessChecks.filter(
    (check) => check.state === "attention",
  ).length;
  const nextSteps = readinessChecks
    .filter((check) => check.state === "attention")
    .slice(0, 3);

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
                  Vault OS currently trusts {readyRequirements} of the{" "}
                  {readinessChecks.length} commercial readiness signals
                  assessed while it builds confidence for a trusted
                  action.
                </p>
                <p>
                  Complete the remaining catalogue, supplier and
                  commercial requirements so Vault OS can recommend
                  trusted actions.
                </p>
              </div>

              <div className="advisor-readiness-summary">
                <strong>
                  {readyRequirements} of {readinessChecks.length}
                </strong>
                <span>requirements ready</span>
                <small>
                  {attentionRequirements} requiring attention
                </small>
              </div>
            </header>

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
                      {check.state === "ready" ? "✓" : "!"}
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
                        check.state === "ready"
                          ? "Ready"
                          : check.state === "unavailable"
                            ? "Unavailable"
                            : "Attention required"
                      }</span>
                      {check.state !== "ready" ? (
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
