import {
  AdvisorEngine,
} from "@/lib/brain/AdvisorEngine";

import type {
  AdvisorDiagnostics,
} from "@/lib/brain/AdvisorEngine";

import type {
  Insight,
} from "@/lib/brain/InsightEngine";

import type {
  MorningBriefingImpact as OperationalBriefingImpact,
  MorningBriefingMetric as OperationalBriefingMetric,
  MorningBriefingRecommendation,
  MorningBriefingResult as OperationalBriefingResult,
  StockImpact,
  VaultBrainOperationalSnapshot,
  VaultBrainSignalTone,
} from "@/lib/brain/types";

type AdvisorAnalysis =
  ReturnType<
    typeof AdvisorEngine.analyse
  >["analysis"];

/* ============================================================
   LEGACY COMMERCIAL READINESS BRIEFING
   Preserved for existing consumers.
============================================================ */

export type MorningBriefingTone =
  | "success"
  | "warning"
  | "danger"
  | "info";

export type MorningBriefingItem = {
  id: string;
  label: string;
  value: string;
  tone: MorningBriefingTone;
};

export type CommercialReadinessBriefingResult = {
  greeting: string;
  headline: string;
  summary: string;
  recommendation: string;
  readinessPercentage: number;
  readinessLabel: string;
  items: MorningBriefingItem[];
};

/**
 * Backward-compatible alias.
 *
 * Existing code importing MorningBriefingResult from this file
 * will continue to receive the commercial-readiness result.
 */
export type MorningBriefingResult =
  CommercialReadinessBriefingResult;

type AnalyseInput = {
  diagnostics: AdvisorDiagnostics;
  analysis: AdvisorAnalysis;
  insights: Insight[];
  catalogueCompletionPercentage: number;
  userName?: string;
};

/* ============================================================
   SHARED HELPERS
============================================================ */

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(0, Math.round(value)),
  );
}

function calculatePercentage(
  value: number,
  total: number,
): number {
  if (total <= 0) {
    return 0;
  }

  return clampPercentage(
    (value / total) * 100,
  );
}

function getGreeting(
  userName: string,
  date = new Date(),
): string {
  const hour = date.getHours();

  if (hour < 12) {
    return `Good morning ${userName}.`;
  }

  if (hour < 18) {
    return `Good afternoon ${userName}.`;
  }

  return `Good evening ${userName}.`;
}

function formatCurrency(
  value: number | null,
): string {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "Unavailable";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercentageChange(
  value: number | null,
): string | null {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  const rounded = Math.round(value);

  if (rounded > 0) {
    return `${rounded}% higher`;
  }

  if (rounded < 0) {
    return `${Math.abs(rounded)}% lower`;
  }

  return "unchanged";
}

function pluralise(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return value === 1
    ? singular
    : plural;
}

/* ============================================================
   COMMERCIAL READINESS HELPERS
============================================================ */

function getReadinessLabel(
  readinessPercentage: number,
): string {
  if (readinessPercentage >= 80) {
    return "Strong";
  }

  if (readinessPercentage >= 60) {
    return "Improving";
  }

  if (readinessPercentage >= 35) {
    return "Limited";
  }

  return "Early stage";
}

function getCommercialHeadline(
  diagnostics: AdvisorDiagnostics,
): string {
  if (diagnostics.productsQualifying > 0) {
    return `${diagnostics.productsQualifying} commercial ${
      diagnostics.productsQualifying === 1
        ? "opportunity is"
        : "opportunities are"
    } ready for review.`;
  }

  if (
    diagnostics.commercialDataMissing > 0
  ) {
    return "Commercial readiness is currently being limited by incomplete catalogue data.";
  }

  if (diagnostics.lowStock > 0) {
    return "Inventory exposure requires attention today.";
  }

  return "Vault Brain has completed today’s commercial review.";
}

function getCommercialRecommendation(
  diagnostics: AdvisorDiagnostics,
): string {
  if (
    diagnostics.supplierAssigned <
    diagnostics.productsScanned
  ) {
    return "Complete supplier assignments before placing new purchase orders so Vault Brain can compare cost, reliability and reorder risk accurately.";
  }

  if (
    diagnostics.commercialDataMissing > 0
  ) {
    return "Complete the missing commercial fields so margin, return and purchasing recommendations can be trusted.";
  }

  if (
    diagnostics.lowStock > 0 &&
    diagnostics.productsQualifying === 0
  ) {
    return "Review low-stock products and confirm their cost and reorder settings before committing additional capital.";
  }

  if (
    diagnostics.productsQualifying > 0
  ) {
    return "Review the ranked commercial opportunities and prioritise the highest-confidence recommendation first.";
  }

  return "No urgent commercial action is required. Continue maintaining supplier, stock and cost data.";
}

/* ============================================================
   OPERATIONAL BRIEFING HELPERS
============================================================ */

function getOperationalHeadline(
  snapshot: VaultBrainOperationalSnapshot,
): string {
  const {
    trading,
    stockImpacts,
    missions,
  } = snapshot;

  const criticalStockImpacts =
    stockImpacts.filter(
      (impact) =>
        impact.urgency === "critical",
    );

  const reorderImpacts =
    stockImpacts.filter(
      (impact) => impact.reorderRequired,
    );

  if (criticalStockImpacts.length > 0) {
    return `${criticalStockImpacts.length} critical stock ${
      criticalStockImpacts.length === 1
        ? "risk requires"
        : "risks require"
    } attention today.`;
  }

  if (reorderImpacts.length > 0) {
    return `${reorderImpacts.length} ${
      reorderImpacts.length === 1
        ? "product has"
        : "products have"
    } entered the reorder window.`;
  }

  if (missions.critical > 0) {
    return `${missions.critical} critical ${
      missions.critical === 1
        ? "mission requires"
        : "missions require"
    } attention.`;
  }

  if (trading.orderCount > 0) {
    return `${trading.orderCount} overnight ${
      trading.orderCount === 1
        ? "order generated"
        : "orders generated"
    } ${formatCurrency(
      trading.grossRevenueGbp,
    )}.`;
  }

  return "Vault Brain has completed the latest operational review.";
}

function getMetricToneForChange(
  value: number | null,
): VaultBrainSignalTone {
  if (
    value === null ||
    !Number.isFinite(value) ||
    value === 0
  ) {
    return "neutral";
  }

  return value > 0
    ? "positive"
    : "warning";
}

function buildOperationalMetrics(
  snapshot: VaultBrainOperationalSnapshot,
): OperationalBriefingMetric[] {
  const {
    trading,
    cash,
    inventory,
  } = snapshot;

  const revenueChange =
    formatPercentageChange(
      trading.comparisonRevenuePercentage,
    );

  const profitChange =
    formatPercentageChange(
      trading.comparisonProfitPercentage,
    );

  return [
    {
      id: "orders",
      label: "Orders",
      value: String(trading.orderCount),
      supportingText:
        trading.comparisonOrderCountPercentage ===
        null
          ? "received overnight"
          : `${formatPercentageChange(
              trading.comparisonOrderCountPercentage,
            )} than the comparison period`,
      tone: getMetricToneForChange(
        trading.comparisonOrderCountPercentage,
      ),
    },
    {
      id: "revenue",
      label: "Revenue",
      value: formatCurrency(
        trading.grossRevenueGbp,
      ),
      supportingText: revenueChange
        ? `${revenueChange} than the comparison period`
        : "generated overnight",
      tone: getMetricToneForChange(
        trading.comparisonRevenuePercentage,
      ),
    },
    {
      id: "profit",
      label: "Profit",
      value: formatCurrency(
        trading.profitGbp,
      ),
      supportingText: profitChange
        ? `${profitChange} than the comparison period`
        : trading.profitGbp === null
          ? "profit data unavailable"
          : "estimated overnight profit",
      tone:
        trading.profitGbp === null
          ? "neutral"
          : getMetricToneForChange(
              trading.comparisonProfitPercentage,
            ),
    },
    {
      id: "items-sold",
      label: "Items sold",
      value: String(trading.itemsSold),
      supportingText: "across all orders",
      tone:
        trading.itemsSold > 0
          ? "positive"
          : "neutral",
    },
    {
      id: "average-order",
      label: "Average order",
      value: formatCurrency(
        trading.averageOrderValueGbp,
      ),
      supportingText:
        "average order value",
      tone: "info",
    },
    {
      id: "cash",
      label: "Cash",
      value: formatCurrency(
        cash.availableCashGbp,
      ),
      supportingText:
        cash.availableCashGbp === null
          ? "cash data unavailable"
          : "currently available",
      tone:
        cash.availableCashGbp === null
          ? "neutral"
          : cash.availableCashGbp > 0
            ? "positive"
            : "critical",
    },
    {
      id: "inventory-health",
      label: "Inventory health",
      value:
        inventory.score === null
          ? inventory.state
          : `${inventory.score}%`,
      supportingText: `${inventory.lowStockProducts} low stock · ${inventory.outOfStockProducts} out of stock`,
      tone:
        inventory.state === "excellent" ||
        inventory.state === "healthy"
          ? "positive"
          : inventory.state === "attention"
            ? "warning"
            : inventory.state === "critical"
              ? "critical"
              : "neutral",
    },
  ];
}

function getHighestRiskStockImpact(
  stockImpacts: StockImpact[],
): StockImpact | null {
  const urgencyRank: Record<
    StockImpact["urgency"],
    number
  > = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    none: 1,
    unknown: 0,
  };

  return (
    [...stockImpacts].sort((a, b) => {
      const urgencyDifference =
        urgencyRank[b.urgency] -
        urgencyRank[a.urgency];

      if (urgencyDifference !== 0) {
        return urgencyDifference;
      }

      return (
        b.estimatedRevenueAtRiskGbp ?? 0
      ) -
        (
          a.estimatedRevenueAtRiskGbp ??
          0
        );
    })[0] ?? null
  );
}

function buildOperationalNarrative(
  snapshot: VaultBrainOperationalSnapshot,
): string[] {
  const {
    trading,
    inventory,
    missions,
    stockImpacts,
  } = snapshot;

  const narrative: string[] = [];

  narrative.push(
    `${trading.orderCount} overnight ${
      trading.orderCount === 1
        ? "order generated"
        : "orders generated"
    } ${formatCurrency(
      trading.grossRevenueGbp,
    )}.`,
  );

  if (trading.itemsSold > 0) {
    narrative.push(
      `Those orders reduced inventory by ${trading.itemsSold} ${pluralise(
        trading.itemsSold,
        "item",
      )}.`,
    );
  }

  const highestRisk =
    getHighestRiskStockImpact(
      stockImpacts.filter(
        (impact) =>
          impact.reorderRequired ||
          impact.urgency === "critical" ||
          impact.urgency === "high",
      ),
    );

  if (highestRisk) {
    const remainingDays =
      highestRisk.estimatedStockDaysRemaining;

    narrative.push(
      remainingDays === null
        ? `${highestRisk.productName} now requires a stock review.`
        : `${highestRisk.productName} now has approximately ${remainingDays} ${pluralise(
            remainingDays,
            "day",
          )} of stock remaining.`,
    );
  } else {
    narrative.push(
      "No new critical stock exposure was created by the latest trading period.",
    );
  }

  narrative.push(
    `Inventory health is currently ${inventory.state}.`,
  );

  if (
    missions.highestPriorityMissionTitle
  ) {
    narrative.push(
      `Today’s highest-priority mission is "${missions.highestPriorityMissionTitle}".`,
    );
  } else if (missions.actionable > 0) {
    narrative.push(
      `${missions.actionable} actionable ${pluralise(
        missions.actionable,
        "mission",
      )} are ready for review.`,
    );
  } else {
    narrative.push(
      "No active missions currently require attention.",
    );
  }

  return narrative;
}

function buildStockImpactDescription(
  impact: StockImpact,
): string {
  const parts: string[] = [];

  if (
    impact.estimatedStockDaysRemaining !==
    null
  ) {
    parts.push(
      `Estimated stock cover is ${impact.estimatedStockDaysRemaining} ${pluralise(
        impact.estimatedStockDaysRemaining,
        "day",
      )}.`,
    );
  }

  if (impact.stockRemaining !== null) {
    parts.push(
      `${impact.stockRemaining} ${pluralise(
        impact.stockRemaining,
        "unit",
      )} remain.`,
    );
  }

  if (
    impact.supplierLeadTimeDays !== null &&
    impact.supplierLeadTimeDays !==
      undefined
  ) {
    parts.push(
      `Supplier lead time is approximately ${impact.supplierLeadTimeDays} ${pluralise(
        impact.supplierLeadTimeDays,
        "day",
      )}.`,
    );
  }

  if (
    impact.estimatedRevenueAtRiskGbp !==
      null &&
    impact.estimatedRevenueAtRiskGbp !==
      undefined
  ) {
    parts.push(
      `${formatCurrency(
        impact.estimatedRevenueAtRiskGbp,
      )} of estimated revenue may be exposed.`,
    );
  }

  return (
    parts.join(" ") ||
    "Vault Brain detected a material inventory change."
  );
}

function buildOperationalImpacts(
  snapshot: VaultBrainOperationalSnapshot,
): OperationalBriefingImpact[] {
  const impacts: OperationalBriefingImpact[] =
    [];

  const rankedStockImpacts =
    [...snapshot.stockImpacts]
      .filter(
        (impact) =>
          impact.reorderRequired ||
          impact.urgency === "critical" ||
          impact.urgency === "high",
      )
      .sort((a, b) => {
        const urgencyRank = {
          critical: 4,
          high: 3,
          medium: 2,
          low: 1,
          none: 0,
          unknown: 0,
        };

        return (
          urgencyRank[b.urgency] -
          urgencyRank[a.urgency]
        );
      });

  rankedStockImpacts
    .slice(0, 3)
    .forEach((impact) => {
      impacts.push({
        id: `stock-${impact.productId}`,
        title: impact.reorderRequired
          ? `${impact.productName} requires a reorder review`
          : `${impact.productName} requires inventory attention`,
        description:
          buildStockImpactDescription(
            impact,
          ),
        tone:
          impact.urgency === "critical"
            ? "critical"
            : "warning",
        source: "inventory",
        confidence:
          clampPercentage(
            impact.confidence,
          ),
        missionId: null,
      });
    });

  if (
    snapshot.missions.highestPriorityMissionTitle
  ) {
    impacts.push({
      id: "highest-priority-mission",
      title:
        snapshot.missions
          .highestPriorityMissionTitle,
      description:
        "Vault Brain has ranked this as the highest-value action based on impact, urgency and confidence.",
      tone:
        snapshot.missions.critical > 0
          ? "warning"
          : "info",
      source: "missions",
      confidence:
        snapshot.missions.averageConfidence,
      missionId:
        snapshot.missions
          .highestPriorityMissionId,
    });
  }

  impacts.push({
    id: "inventory-health",
    title: `Inventory health is ${snapshot.inventory.state}`,
    description: `${snapshot.inventory.healthyProducts} products are healthy, ${snapshot.inventory.lowStockProducts} are low stock and ${snapshot.inventory.outOfStockProducts} are out of stock.`,
    tone:
      snapshot.inventory.state ===
        "excellent" ||
      snapshot.inventory.state ===
        "healthy"
        ? "positive"
        : snapshot.inventory.state ===
            "attention"
          ? "warning"
          : snapshot.inventory.state ===
              "critical"
            ? "critical"
            : "neutral",
    source: "inventory",
    confidence:
      snapshot.inventory.score ?? 0,
  });

  const degradedSources =
    snapshot.sourceStatuses.filter(
      (source) =>
        source.status === "degraded" ||
        source.status === "offline",
    );

  impacts.push({
    id: "source-health",
    title:
      degradedSources.length === 0
        ? "All connected business sources are healthy"
        : `${degradedSources.length} connected ${
            degradedSources.length === 1
              ? "source requires"
              : "sources require"
          } attention`,
    description:
      degradedSources.length === 0
        ? "No integration or synchronisation issues were detected."
        : degradedSources
            .map(
              (source) =>
                `${source.label}: ${
                  source.message ??
                  source.status
                }`,
            )
            .join(" "),
    tone:
      degradedSources.length === 0
        ? "positive"
        : "warning",
    source: "system",
    confidence:
      degradedSources.length === 0
        ? 100
        : 80,
  });

  return impacts.slice(0, 5);
}

function buildOperationalRecommendations(
  snapshot: VaultBrainOperationalSnapshot,
): MorningBriefingRecommendation[] {
  const recommendations: MorningBriefingRecommendation[] =
    [];

  const highestRisk =
    getHighestRiskStockImpact(
      snapshot.stockImpacts.filter(
        (impact) => impact.reorderRequired,
      ),
    );

  if (highestRisk) {
    recommendations.push({
      id: `restock-${highestRisk.productId}`,
      title: `Review the ${highestRisk.productName} restock decision`,
      explanation:
        buildStockImpactDescription(
          highestRisk,
        ),
      authority: "prepared",
      confidence:
        clampPercentage(
          highestRisk.confidence,
        ),
      missionId: null,
      actionLabel: "Review restock",
      actionHref: "/inventory",
    });
  }

  if (
    snapshot.missions
      .highestPriorityMissionId &&
    snapshot.missions
      .highestPriorityMissionTitle
  ) {
    recommendations.push({
      id: "review-priority-mission",
      title:
        snapshot.missions
          .highestPriorityMissionTitle,
      explanation:
        "Vault Brain has ranked this as today’s highest-value action.",
      authority: "advisory",
      confidence:
        snapshot.missions.averageConfidence,
      missionId:
        snapshot.missions
          .highestPriorityMissionId,
      actionLabel: "Open mission",
      actionHref: "/missions",
    });
  }

  const offlineSources =
    snapshot.sourceStatuses.filter(
      (source) =>
        source.status === "offline",
    );

  if (offlineSources.length > 0) {
    recommendations.push({
      id: "restore-data-sources",
      title:
        "Restore disconnected business sources",
      explanation: `${offlineSources
        .map((source) => source.label)
        .join(
          ", ",
        )} cannot currently contribute to Vault Brain analysis.`,
      authority: "advisory",
      confidence: 100,
      actionLabel: "Review integrations",
      actionHref: "/settings",
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: "no-urgent-action",
      title:
        "No urgent operational action is required",
      explanation:
        "Vault Brain has not detected any immediate stock, mission or integration risk.",
      authority: "automatic",
      confidence: 95,
    });
  }

  return recommendations;
}

function calculateOperationalConfidence(
  snapshot: VaultBrainOperationalSnapshot,
): number {
  if (
    snapshot.sourceStatuses.length === 0
  ) {
    return clampPercentage(
      snapshot.missions.averageConfidence,
    );
  }

  const sourceScore =
    snapshot.sourceStatuses.reduce(
      (total, source) => {
        if (source.status === "healthy") {
          return total + 100;
        }

        if (source.status === "degraded") {
          return total + 60;
        }

        if (source.status === "offline") {
          return total;
        }

        return total + 35;
      },
      0,
    ) /
    snapshot.sourceStatuses.length;

  return clampPercentage(
    sourceScore * 0.55 +
      snapshot.missions
        .averageConfidence *
        0.45,
  );
}

/* ============================================================
   ENGINE
============================================================ */

export const MorningBriefingEngine = {
  /**
   * Existing commercial-readiness analysis.
   *
   * This remains unchanged in purpose so current consumers
   * do not break.
   */
  analyse({
    diagnostics,
    analysis,
    insights,
    catalogueCompletionPercentage,
    userName = "Tom",
  }: AnalyseInput): CommercialReadinessBriefingResult {
    const commercialTrustPercentage =
      calculatePercentage(
        diagnostics.commercialCostTrusted,
        diagnostics.productsScanned,
      );

    const supplierCoveragePercentage =
      calculatePercentage(
        diagnostics.supplierAssigned,
        diagnostics.productsScanned,
      );

    const readinessPercentage =
      clampPercentage(
        catalogueCompletionPercentage *
          0.4 +
          commercialTrustPercentage *
            0.35 +
          supplierCoveragePercentage *
            0.25,
      );

    const highestPriority =
      analysis.highestPriority;

    const summaryParts = [
      `I analysed ${diagnostics.productsScanned} catalogue products.`,
      `${diagnostics.lowStock} ${
        diagnostics.lowStock === 1
          ? "product is"
          : "products are"
      } currently within the low-stock range.`,
      `${diagnostics.commercialCostTrusted} ${
        diagnostics.commercialCostTrusted ===
        1
          ? "product has"
          : "products have"
      } trusted commercial cost data.`,
    ];

    if (highestPriority) {
      summaryParts.push(
        `The highest-priority opportunity is "${highestPriority.title}" with ${highestPriority.confidence}% confidence.`,
      );
    } else {
      summaryParts.push(
        "No product currently passes every stock, margin, return and configuration rule.",
      );
    }

    const warningInsights =
      insights.filter((insight) => {
        const severity = String(
          insight.severity,
        ).toLowerCase();

        return (
          severity === "warning" ||
          severity === "critical"
        );
      }).length;

    return {
      greeting: getGreeting(userName),
      headline:
        getCommercialHeadline(
          diagnostics,
        ),
      summary: summaryParts.join(" "),
      recommendation:
        getCommercialRecommendation(
          diagnostics,
        ),
      readinessPercentage,
      readinessLabel:
        getReadinessLabel(
          readinessPercentage,
        ),
      items: [
        {
          id: "products-reviewed",
          label: "Products reviewed",
          value: String(
            diagnostics.productsScanned,
          ),
          tone: "info",
        },
        {
          id: "low-stock",
          label: "Require attention",
          value: String(
            diagnostics.lowStock,
          ),
          tone:
            diagnostics.lowStock > 0
              ? "warning"
              : "success",
        },
        {
          id: "supplier-coverage",
          label: "Supplier coverage",
          value: `${supplierCoveragePercentage}%`,
          tone:
            supplierCoveragePercentage >=
            80
              ? "success"
              : "warning",
        },
        {
          id: "commercial-trust",
          label: "Commercial trust",
          value: `${commercialTrustPercentage}%`,
          tone:
            commercialTrustPercentage >=
            80
              ? "success"
              : "warning",
        },
        {
          id: "active-opportunities",
          label: "Active opportunities",
          value: String(
            analysis.ranked.length,
          ),
          tone:
            analysis.ranked.length > 0
              ? "success"
              : "info",
        },
        {
          id: "active-warnings",
          label: "Active warnings",
          value: String(
            warningInsights,
          ),
          tone:
            warningInsights > 0
              ? "warning"
              : "success",
        },
      ],
    };
  },

  /**
   * New operational Morning Briefing.
   *
   * This converts one unified business snapshot into the
   * story-first briefing consumed by the Vault Brain homepage.
   */
  analyseOperational(
    snapshot: VaultBrainOperationalSnapshot,
  ): OperationalBriefingResult {
    const narrative =
      buildOperationalNarrative(
        snapshot,
      );

    const recommendations =
      buildOperationalRecommendations(
        snapshot,
      );

    return {
      generatedAt: snapshot.generatedAt,

      greeting: getGreeting(
        snapshot.userName,
        new Date(snapshot.generatedAt),
      ),

      headline:
        getOperationalHeadline(
          snapshot,
        ),

      summary: narrative.join(" "),

      narrative,

      metrics:
        buildOperationalMetrics(
          snapshot,
        ),

      impacts:
        buildOperationalImpacts(
          snapshot,
        ),

      recommendations,

      inventoryHealth:
        snapshot.inventory,

      missionSummary:
        snapshot.missions,

      sourceStatuses:
        snapshot.sourceStatuses,

      confidence:
        calculateOperationalConfidence(
          snapshot,
        ),
    };
  },
} as const;
