import { AdvisorDiagnostics } from "@/components/advisor/AdvisorDiagnostics";
import { AdvisorNarrative } from "@/components/advisor/AdvisorNarrative";
import { InsightEngine } from "@/lib/brain/InsightEngine";

import {
  AdvisorEngine,
} from "@/lib/brain/AdvisorEngine";

import {
  getCatalogueData,
} from "@/lib/catalogue";

export const dynamic = "force-dynamic";

function formatGbp(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
}

export default async function AdvisorPage() {
  try {
    const {
      products,
      summary,
    } = await getCatalogueData();

    const advisor =
      AdvisorEngine.analyse({
        products,
      });

    const analysis =
      advisor.analysis;
      const insights = InsightEngine.analyse({
  diagnostics: advisor.diagnostics,
});

    return (
      <main className="advisor-page">
        <header className="advisor-header">
          <div>
            <p className="vault-eyebrow">
              Vault Brain
            </p>

            <h1>Intelligence Centre</h1>

            <p>
              Live commercial opportunities generated
              from catalogue, stock and cost data.
            </p>
          </div>

          <a
            className="catalogue-back"
            href="/"
          >
            ← Command Centre
          </a>
        </header>

        <AdvisorNarrative
  insights={insights.insights}
/>

<AdvisorDiagnostics
  diagnostics={advisor.diagnostics}
/>

        {analysis.highestPriority ? (
          <section className="advisor-primary">
            <div>
              <p className="vault-eyebrow">
                Highest Priority
              </p>

              <h2>
                {analysis.highestPriority.title}
              </h2>

              <p>
                {
                  analysis.highestPriority
                    .description
                }
              </p>
            </div>

            <div className="advisor-primary-metrics">
              <span>
                Estimated profit

                <strong>
                  {formatGbp(
                    analysis.highestPriority
                      .estimatedProfit,
                  )}
                </strong>
              </span>

              <span>
                Confidence

                <strong>
                  {
                    analysis.highestPriority
                      .confidence
                  }
                  %
                </strong>
              </span>
            </div>
          </section>
        ) : (
          <section className="advisor-empty">
            <h2>
              No buying opportunities found
            </h2>

            <p>
              Vault Brain analysed every catalogue
              product but did not find one that currently
              meets the stock, margin and
              return-on-capital rules.
            </p>
          </section>
        )}

        <section className="advisor-opportunities">
          <div className="advisor-section-heading">
            <div>
              <p className="vault-eyebrow">
                Ranked Opportunities
              </p>

              <h2>Recommended actions</h2>
            </div>

            <span>
              Catalogue health{" "}
              {
                summary
                  .catalogue_completion_percentage
              }
              %
            </span>
          </div>

          {analysis.ranked.length > 0 ? (
            <div className="advisor-opportunity-list">
              {analysis.ranked.map(
                (opportunity, index) => (
                  <article
                    className={`advisor-opportunity priority-${opportunity.priority}`}
                    key={opportunity.id}
                  >
                    <div className="advisor-opportunity-rank">
                      {index + 1}
                    </div>

                    <div className="advisor-opportunity-content">
                      <div className="advisor-opportunity-heading">
                        <div>
                          <span>
                            {opportunity.source}
                          </span>

                          <h3>
                            {opportunity.title}
                          </h3>
                        </div>

                        <strong>
                          {opportunity.confidence}%
                        </strong>
                      </div>

                      <p>
                        {opportunity.description}
                      </p>

                      <footer>
                        <span>
                          Estimated profit
                        </span>

                        <strong>
                          {formatGbp(
                            opportunity
                              .estimatedProfit,
                          )}
                        </strong>
                      </footer>
                    </div>
                  </article>
                ),
              )}
            </div>
          ) : (
            <div className="advisor-empty-list">
              <p>
                Add trusted commercial costs, supplier
                rules and reorder settings to allow
                Vault Brain to discover more
                opportunities.
              </p>

              <a href="/catalogue">
                Open Product Intelligence →
              </a>
            </div>
          )}
        </section>
      </main>
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "An unknown advisor error occurred.";

    return (
      <main className="catalogue-error">
        <h1>Vault Advisor unavailable</h1>

        <p>{message}</p>
      </main>
    );
  }
}