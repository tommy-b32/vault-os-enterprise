import { MorningBriefing } from "@/components/brain/MorningBriefing";
import { MorningBriefingEngine } from "@/lib/brain/MorningBriefingEngine";
import { BrainAlert } from "@/components/ui/BrainAlert";
import { BrainCard } from "@/components/ui/BrainCard";
import { BrainGrid } from "@/components/ui/BrainGrid";
import { BrainMetric } from "@/components/ui/BrainMetric";
import { BrainPill } from "@/components/ui/BrainPill";
import { BrainProgress } from "@/components/ui/BrainProgress";
import { BrainSection } from "@/components/ui/BrainSection";
import { AdvisorEngine } from "@/lib/brain/AdvisorEngine";
import { InsightEngine } from "@/lib/brain/InsightEngine";
import type { Insight } from "@/lib/brain/InsightEngine";
import { getCatalogueData } from "@/lib/catalogue";

export const dynamic = "force-dynamic";

type UiTone =
  | "default"
  | "success"
  | "warning"
  | "danger";

type AlertTone =
  | "info"
  | "success"
  | "warning"
  | "danger";

function formatGbp(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
}

function calculatePercentage(
  value: number,
  total: number,
): number {
  if (total <= 0) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

function getInsightTone(
  severity: Insight["severity"],
): AlertTone {
  const severityValue = String(
    severity,
  ).toLowerCase();

  if (severityValue === "success") {
    return "success";
  }

  if (
    severityValue === "warning" ||
    severityValue === "critical"
  ) {
    return "warning";
  }

  return "info";
}

function getPriorityTone(
  priority: string,
): UiTone {
  switch (priority.toLowerCase()) {
    case "critical":
    case "urgent":
    case "high":
      return "danger";

    case "medium":
    case "moderate":
      return "warning";

    case "low":
      return "success";

    default:
      return "default";
  }
}

function formatPriority(
  priority: string,
): string {
  if (!priority) {
    return "Standard";
  }

  return priority
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

export default async function AdvisorPage() {
  try {
    const { products, summary } =
      await getCatalogueData();

    const advisor = AdvisorEngine.analyse({
      products,
    });

    const analysis = advisor.analysis;
    const diagnostics = advisor.diagnostics;

    const insights = InsightEngine.analyse({
      diagnostics,
    });

    const morningBriefing =
      MorningBriefingEngine.analyse({
        diagnostics,
        analysis,
        insights: insights.insights,
        catalogueCompletionPercentage:
          summary.catalogue_completion_percentage,
        userName: "Tom",
      });

    const productsScanned =
      diagnostics.productsScanned;

    const commercialCompletion =
      calculatePercentage(
        diagnostics.commercialDataComplete,
        productsScanned,
      );

    const supplierCoverage =
      calculatePercentage(
        diagnostics.supplierAssigned,
        productsScanned,
      );

    const restockCoverage =
      calculatePercentage(
        diagnostics.restockEnabled,
        productsScanned,
      );

    const commercialTrust =
      calculatePercentage(
        diagnostics.commercialCostTrusted,
        productsScanned,
      );

    return (
      <main className="catalogue-page advisor-page">
        <header className="catalogue-header advisor-header">
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

        <BrainSection
          eyebrow="Vault AI"
          title="Commercial Advisor"
          description="AI-powered analysis of catalogue readiness, supplier configuration, stock exposure and commercial opportunity."
        >
          <MorningBriefing
            briefing={morningBriefing}
          />

          <BrainCard
            title="Commercial Overview"
            subtitle="Live Intelligence"
          >
            <BrainGrid columns={4}>
              <BrainMetric
                label="Products Scanned"
                value={productsScanned}
                helper="Catalogue products analysed"
              />

              <BrainMetric
                label="Low Stock"
                value={diagnostics.lowStock}
                helper="Products requiring attention"
                tone={
                  diagnostics.lowStock > 0
                    ? "warning"
                    : "success"
                }
              />

              <BrainMetric
                label="Commercial Ready"
                value={
                  diagnostics
                    .commercialCostTrusted
                }
                helper="Products with trusted cost data"
                tone={
                  diagnostics
                    .commercialCostTrusted > 0
                    ? "success"
                    : "warning"
                }
              />

              <BrainMetric
                label="Qualifying Products"
                value={
                  diagnostics
                    .productsQualifying
                }
                helper="Products passing advisor rules"
                tone={
                  diagnostics
                    .productsQualifying > 0
                    ? "success"
                    : "default"
                }
              />
            </BrainGrid>
          </BrainCard>

          <BrainGrid columns={2}>
            <BrainCard
              title="Commercial Briefing"
              subtitle="Vault Brain"
            >
              <div className="brain-stack">
                {insights.insights.length > 0 ? (
                  insights.insights.map(
                    (insight) => (
                      <BrainAlert
                        key={insight.id}
                        title={insight.title}
                        tone={getInsightTone(
                          insight.severity,
                        )}
                      >
                        <p>{insight.message}</p>
                      </BrainAlert>
                    ),
                  )
                ) : (
                  <BrainAlert
                    title="No active intelligence alerts"
                    tone="success"
                  >
                    <p>
                      Vault Brain has not identified
                      any current catalogue or
                      commercial issues.
                    </p>
                  </BrainAlert>
                )}
              </div>
            </BrainCard>

            <BrainCard
              title="Catalogue Health"
              subtitle="Configuration Coverage"
            >
              <div className="brain-stack-large">
                <BrainProgress
                  label="Catalogue completion"
                  value={
                    summary
                      .catalogue_completion_percentage
                  }
                  helper={`${summary.catalogue_completion_percentage}% of catalogue configuration is complete.`}
                />

                <BrainProgress
                  label="Commercial data complete"
                  value={commercialCompletion}
                  helper={`${diagnostics.commercialDataComplete} of ${productsScanned} products have complete commercial data.`}
                />

                <BrainProgress
                  label="Supplier coverage"
                  value={supplierCoverage}
                  helper={`${diagnostics.supplierAssigned} of ${productsScanned} products have a supplier assigned.`}
                />

                <BrainProgress
                  label="Commercial cost trust"
                  value={commercialTrust}
                  helper={`${diagnostics.commercialCostTrusted} of ${productsScanned} products have trusted cost data.`}
                />
              </div>
            </BrainCard>
          </BrainGrid>

          <BrainCard
            title="Commercial Diagnostics"
            subtitle="Live System Health"
          >
            <div className="brain-stack-large">
              <BrainGrid columns={4}>
                <BrainMetric
                  label="Data Complete"
                  value={
                    diagnostics
                      .commercialDataComplete
                  }
                  helper="Complete commercial profiles"
                  tone="success"
                />

                <BrainMetric
                  label="Data Missing"
                  value={
                    diagnostics
                      .commercialDataMissing
                  }
                  helper="Products needing information"
                  tone={
                    diagnostics
                      .commercialDataMissing > 0
                      ? "warning"
                      : "success"
                  }
                />

                <BrainMetric
                  label="Supplier Assigned"
                  value={
                    diagnostics.supplierAssigned
                  }
                  helper="Products linked to suppliers"
                />

                <BrainMetric
                  label="Restock Enabled"
                  value={
                    diagnostics.restockEnabled
                  }
                  helper={`${restockCoverage}% catalogue coverage`}
                />
              </BrainGrid>

              <BrainGrid columns={4}>
                <BrainMetric
                  label="Trusted for Reorder"
                  value={
                    diagnostics.trustedForReorder
                  }
                  helper="Safe for automated decisions"
                  tone={
                    diagnostics.trustedForReorder > 0
                      ? "success"
                      : "warning"
                  }
                />

                <BrainMetric
                  label="Margin Target"
                  value={
                    diagnostics
                      .marginThresholdPassed
                  }
                  helper="Products passing margin rules"
                  tone={
                    diagnostics
                      .marginThresholdPassed > 0
                      ? "success"
                      : "default"
                  }
                />

                <BrainMetric
                  label="Return Target"
                  value={
                    diagnostics
                      .returnThresholdPassed
                  }
                  helper="Products passing return rules"
                  tone={
                    diagnostics
                      .returnThresholdPassed > 0
                      ? "success"
                      : "default"
                  }
                />

                <BrainMetric
                  label="Low Stock"
                  value={diagnostics.lowStock}
                  helper="Products within low-stock range"
                  tone={
                    diagnostics.lowStock > 0
                      ? "warning"
                      : "success"
                  }
                />
              </BrainGrid>
            </div>
          </BrainCard>

          {analysis.highestPriority ? (
            <BrainCard
              title="Highest Priority"
              subtitle="Recommended Action"
            >
              <div className="brain-stack-large">
                <div>
                  <BrainPill
                    tone={getPriorityTone(
                      analysis.highestPriority
                        .priority,
                    )}
                  >
                    {formatPriority(
                      analysis.highestPriority
                        .priority,
                    )}{" "}
                    Priority
                  </BrainPill>
                </div>

                <div>
                  <h2>
                    {
                      analysis.highestPriority
                        .title
                    }
                  </h2>

                  <p className="brain-section-description">
                    {
                      analysis.highestPriority
                        .description
                    }
                  </p>
                </div>

                <BrainGrid columns={2}>
                  <BrainMetric
                    label="Estimated Profit"
                    value={formatGbp(
                      analysis.highestPriority
                        .estimatedProfit,
                    )}
                    helper="Estimated commercial return"
                    tone="success"
                  />

                  <BrainMetric
                    label="Confidence"
                    value={`${analysis.highestPriority.confidence}%`}
                    helper="Vault Brain confidence score"
                  />
                </BrainGrid>
              </div>
            </BrainCard>
          ) : (
            <BrainAlert
              title="No buying opportunities found"
              tone="warning"
            >
              <p>
                Vault Brain analysed every catalogue
                product but did not find one that
                currently passes the stock, margin,
                return and configuration rules.
              </p>
            </BrainAlert>
          )}

          <BrainCard
            title="Recommended Actions"
            subtitle="Ranked Opportunities"
          >
            <div className="brain-stack-large">
              <div>
                <BrainPill
                  tone={
                    analysis.ranked.length > 0
                      ? "success"
                      : "warning"
                  }
                >
                  {analysis.ranked.length} Active{" "}
                  {analysis.ranked.length === 1
                    ? "Opportunity"
                    : "Opportunities"}
                </BrainPill>
              </div>

              {analysis.ranked.length > 0 ? (
                <div className="brain-stack">
                  {analysis.ranked.map(
                    (opportunity, index) => (
                      <BrainAlert
                        key={opportunity.id}
                        title={`${index + 1}. ${opportunity.title}`}
                        tone={
                          getPriorityTone(
                            opportunity.priority,
                          ) === "danger"
                            ? "danger"
                            : getPriorityTone(
                                  opportunity.priority,
                                ) === "warning"
                              ? "warning"
                              : getPriorityTone(
                                    opportunity.priority,
                                  ) === "success"
                                ? "success"
                                : "info"
                        }
                      >
                        <div className="brain-stack">
                          <div>
                            <BrainPill
                              tone={getPriorityTone(
                                opportunity.priority,
                              )}
                            >
                              {formatPriority(
                                opportunity.priority,
                              )}{" "}
                              Priority
                            </BrainPill>
                          </div>

                          <p>
                            {opportunity.description}
                          </p>

                          <BrainGrid columns={3}>
                            <BrainMetric
                              label="Source"
                              value={
                                opportunity.source
                              }
                              helper="Opportunity engine"
                            />

                            <BrainMetric
                              label="Estimated Profit"
                              value={formatGbp(
                                opportunity
                                  .estimatedProfit,
                              )}
                              helper="Potential commercial return"
                              tone="success"
                            />

                            <BrainMetric
                              label="Confidence"
                              value={`${opportunity.confidence}%`}
                              helper="Advisor confidence score"
                            />
                          </BrainGrid>
                        </div>
                      </BrainAlert>
                    ),
                  )}
                </div>
              ) : (
                <BrainAlert
                  title="More catalogue data required"
                  tone="info"
                >
                  <p>
                    Add trusted commercial costs,
                    supplier rules and reorder settings
                    to allow Vault Brain to discover
                    more opportunities.
                  </p>

                  <p>
                    <a
                      className="catalogue-back"
                      href="/catalogue"
                    >
                      Open Product Intelligence →
                    </a>
                  </p>
                </BrainAlert>
              )}
            </div>
          </BrainCard>
        </BrainSection>
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