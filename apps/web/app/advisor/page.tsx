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

export const dynamic = "force-dynamic";

type DecisionBlocker = {
  id: string;
  title: string;
  description: string;
  count: number;
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

async function loadAdvisorPage() {
  try {
    const { products } = await getCatalogueData();

    return {
      advisor: AdvisorEngine.analyse({ products }),
      error: null,
    };
  } catch (error) {
    return {
      advisor: null,
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
          <section className="advisor-empty-state">
            <p className="vault-eyebrow">Decision readiness</p>
            <h2>No commercial action is ready yet</h2>
            <p>
              Vault OS needs stronger catalogue, supplier or cost
              data before it can recommend a trusted commercial
              action.
            </p>
            <div>
              <Link href="/catalogue">Review Catalogue</Link>
              <Link href="/supplier-catalogue">
                Open Supplier Catalogue
              </Link>
              <Link href="/commercial">
                Open Commercial Intelligence
              </Link>
            </div>
          </section>
        )}
      </main>
    </VaultAppShell>
  );
}
