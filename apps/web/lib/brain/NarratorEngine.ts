import type {
  MorningBriefingImpact,
  MorningBriefingRecommendation,
  StockImpact,
  VaultBrainDataSource,
  VaultBrainOperationalSnapshot,
  VaultBrainSignalTone,
} from "@/lib/brain/types";

/* ============================================================
   NARRATOR CONTRACTS
============================================================ */

export type NarratorFinding = {
  id: string;
  source: VaultBrainDataSource;

  label: string;
  finding: string;

  tone: VaultBrainSignalTone;
  confidence: number;

  priority: number;
};

export type NarratorStory = {
  generatedAt: string;

  greeting: string;
  headline: string;
  summary: string;

  findings: NarratorFinding[];

  narrative: string[];

  impacts: MorningBriefingImpact[];
  recommendations: MorningBriefingRecommendation[];

  confidence: number;
};

type NarratorContext = {
  snapshot: VaultBrainOperationalSnapshot;
  impacts?: MorningBriefingImpact[];
  recommendations?: MorningBriefingRecommendation[];
};

/* ============================================================
   HELPERS
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

function pluralise(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return value === 1
    ? singular
    : plural;
}

function getGreeting(
  userName: string,
  date: Date,
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

function getUrgencyPriority(
  urgency: StockImpact["urgency"],
): number {
  const priorities: Record<
    StockImpact["urgency"],
    number
  > = {
    critical: 100,
    high: 85,
    medium: 65,
    low: 40,
    none: 10,
    unknown: 5,
  };

  return priorities[urgency];
}

function getStockTone(
  urgency: StockImpact["urgency"],
): VaultBrainSignalTone {
  if (urgency === "critical") {
    return "critical";
  }

  if (
    urgency === "high" ||
    urgency === "medium"
  ) {
    return "warning";
  }

  if (
    urgency === "low" ||
    urgency === "none"
  ) {
    return "positive";
  }

  return "neutral";
}

function getHighestRiskStockImpact(
  stockImpacts: StockImpact[],
): StockImpact | null {
  return (
    [...stockImpacts]
      .sort((a, b) => {
        const urgencyDifference =
          getUrgencyPriority(b.urgency) -
          getUrgencyPriority(a.urgency);

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

/* ============================================================
   FINDING BUILDERS
============================================================ */

function buildTradingFinding(
  snapshot: VaultBrainOperationalSnapshot,
): NarratorFinding {
  const { trading } = snapshot;

  const revenueChange =
    trading.comparisonRevenuePercentage;

  let comparisonText = "";

  if (
    revenueChange !== null &&
    Number.isFinite(revenueChange)
  ) {
    const roundedChange =
      Math.round(revenueChange);

    comparisonText =
      roundedChange === 0
        ? " Revenue is unchanged from the comparison period."
        : ` Revenue is ${Math.abs(
            roundedChange,
          )}% ${
            roundedChange > 0
              ? "higher"
              : "lower"
          } than the comparison period.`;
  }

  return {
    id: "trading-summary",
    source: "shopify",
    label: "Trading",
    finding: `${trading.orderCount} ${
      trading.orderCount === 1
        ? "order generated"
        : "orders generated"
    } ${formatCurrency(
      trading.grossRevenueGbp,
    )} from ${trading.itemsSold} ${pluralise(
      trading.itemsSold,
      "item",
    )}.${comparisonText}`,
    tone:
      revenueChange === null ||
      revenueChange === 0
        ? "info"
        : revenueChange > 0
          ? "positive"
          : "warning",
    confidence: 100,
    priority: 90,
  };
}

function buildProfitFinding(
  snapshot: VaultBrainOperationalSnapshot,
): NarratorFinding {
  const { trading } = snapshot;

  if (trading.profitGbp === null) {
    return {
      id: "profit-unavailable",
      source: "commercial",
      label: "Profit",
      finding:
        "Profit could not be calculated because complete cost data is not yet available.",
      tone: "warning",
      confidence: 100,
      priority: 76,
    };
  }

  const profitChange =
    trading.comparisonProfitPercentage;

  const comparisonText =
    profitChange === null
      ? ""
      : profitChange === 0
        ? " Profit is unchanged from the comparison period."
        : ` Profit is ${Math.abs(
            Math.round(profitChange),
          )}% ${
            profitChange > 0
              ? "higher"
              : "lower"
          } than the comparison period.`;

  return {
    id: "profit-summary",
    source: "commercial",
    label: "Profit",
    finding: `${formatCurrency(
      trading.profitGbp,
    )} estimated profit was generated.${comparisonText}`,
    tone:
      profitChange === null ||
      profitChange === 0
        ? "info"
        : profitChange > 0
          ? "positive"
          : "warning",
    confidence: 92,
    priority:
      profitChange !== null &&
      profitChange < 0
        ? 88
        : 72,
  };
}

function buildInventoryFinding(
  snapshot: VaultBrainOperationalSnapshot,
): NarratorFinding {
  const highestRisk =
    getHighestRiskStockImpact(
      snapshot.stockImpacts,
    );

  if (!highestRisk) {
    return {
      id: "inventory-stable",
      source: "inventory",
      label: "Inventory",
      finding:
        "No material inventory risk was detected during the latest trading period.",
      tone: "positive",
      confidence:
        snapshot.inventory.score ?? 85,
      priority: 50,
    };
  }

  const stockDays =
    highestRisk.estimatedStockDaysRemaining;

  const stockText =
    stockDays === null
      ? "requires an inventory review"
      : `has approximately ${stockDays} ${pluralise(
          stockDays,
          "day",
        )} of stock remaining`;

  const revenueRisk =
    highestRisk.estimatedRevenueAtRiskGbp;

  return {
    id: `inventory-${highestRisk.productId}`,
    source: "inventory",
    label: "Inventory",
    finding: `${highestRisk.productName} ${stockText}.${
      revenueRisk === null ||
      revenueRisk === undefined
        ? ""
        : ` ${formatCurrency(
            revenueRisk,
          )} of estimated revenue may be exposed.`
    }`,
    tone: getStockTone(
      highestRisk.urgency,
    ),
    confidence: clampPercentage(
      highestRisk.confidence,
    ),
    priority:
      getUrgencyPriority(
        highestRisk.urgency,
      ),
  };
}

function buildSupplierFinding(
  snapshot: VaultBrainOperationalSnapshot,
): NarratorFinding {
  const supplierSource =
    snapshot.sourceStatuses.find(
      (source) =>
        source.source === "supplier",
    );

  if (!supplierSource) {
    return {
      id: "supplier-unknown",
      source: "supplier",
      label: "Suppliers",
      finding:
        "Supplier intelligence is not currently available.",
      tone: "neutral",
      confidence: 0,
      priority: 45,
    };
  }

  if (
    supplierSource.status === "offline"
  ) {
    return {
      id: "supplier-offline",
      source: "supplier",
      label: "Suppliers",
      finding:
        supplierSource.message ??
        "Supplier intelligence is offline and cannot contribute to purchasing decisions.",
      tone: "critical",
      confidence: 100,
      priority: 98,
    };
  }

  if (
    supplierSource.status === "degraded"
  ) {
    return {
      id: "supplier-degraded",
      source: "supplier",
      label: "Suppliers",
      finding:
        supplierSource.message ??
        "Supplier intelligence is operating with reduced confidence.",
      tone: "warning",
      confidence: 85,
      priority: 78,
    };
  }

  return {
    id: "supplier-healthy",
    source: "supplier",
    label: "Suppliers",
    finding:
      "No new supplier, fulfilment or delivery risks were detected.",
    tone: "positive",
    confidence: 95,
    priority: 42,
  };
}

function buildCapitalFinding(
  snapshot: VaultBrainOperationalSnapshot,
): NarratorFinding {
  const purchasingPower =
    snapshot.cash
      .availablePurchasingPowerGbp;

  const availableCash =
    snapshot.cash.availableCashGbp;

  if (
    purchasingPower === null ||
    availableCash === null
  ) {
    return {
      id: "capital-unavailable",
      source: "capital",
      label: "Capital",
      finding:
        "Capital intelligence is incomplete because the current cash position is unavailable.",
      tone: "warning",
      confidence: 100,
      priority: 80,
    };
  }

  const reserveProtected =
    snapshot.cash.protectedReserveGbp;

  return {
    id: "capital-position",
    source: "capital",
    label: "Capital",
    finding: `${formatCurrency(
      purchasingPower,
    )} purchasing power is available from ${formatCurrency(
      availableCash,
    )} cash.${
      reserveProtected === null
        ? ""
        : ` A ${formatCurrency(
            reserveProtected,
          )} reserve remains protected.`
    }`,
    tone:
      purchasingPower > 0
        ? "positive"
        : "critical",
    confidence: 96,
    priority:
      purchasingPower > 0
        ? 68
        : 100,
  };
}

function buildMissionFinding(
  snapshot: VaultBrainOperationalSnapshot,
): NarratorFinding {
  const { missions } = snapshot;

  if (
    missions.highestPriorityMissionTitle
  ) {
    return {
      id: "mission-priority",
      source: "missions",
      label: "Priority",
      finding: `“${missions.highestPriorityMissionTitle}” is today’s highest-value mission. ${missions.actionable} actionable ${pluralise(
        missions.actionable,
        "mission",
      )} are currently available.`,
      tone:
        missions.critical > 0
          ? "warning"
          : "info",
      confidence:
        clampPercentage(
          missions.averageConfidence,
        ),
      priority:
        missions.critical > 0
          ? 97
          : 86,
    };
  }

  return {
    id: "mission-clear",
    source: "missions",
    label: "Priority",
    finding:
      "No active mission currently requires immediate attention.",
    tone: "positive",
    confidence:
      clampPercentage(
        missions.averageConfidence,
      ),
    priority: 40,
  };
}

function buildCatalogueFinding(
  snapshot: VaultBrainOperationalSnapshot,
): NarratorFinding {
  const catalogueSource =
    snapshot.sourceStatuses.find(
      (source) =>
        source.source === "catalogue",
    );

  if (
    catalogueSource?.status === "offline"
  ) {
    return {
      id: "catalogue-offline",
      source: "catalogue",
      label: "Catalogue",
      finding:
        catalogueSource.message ??
        "Catalogue intelligence is offline.",
      tone: "critical",
      confidence: 100,
      priority: 96,
    };
  }

  if (
    catalogueSource?.status === "degraded"
  ) {
    return {
      id: "catalogue-degraded",
      source: "catalogue",
      label: "Catalogue",
      finding:
        catalogueSource.message ??
        "Catalogue intelligence is operating with reduced confidence.",
      tone: "warning",
      confidence: 85,
      priority: 74,
    };
  }

  return {
    id: "catalogue-ready",
    source: "catalogue",
    label: "Catalogue",
    finding: `${snapshot.inventory.totalProducts} catalogue products are available for intelligence analysis.`,
    tone: "positive",
    confidence: 95,
    priority: 44,
  };
}

/* ============================================================
   STORY BUILDERS
============================================================ */

function buildFindings(
  snapshot: VaultBrainOperationalSnapshot,
): NarratorFinding[] {
  return [
    buildTradingFinding(snapshot),
    buildProfitFinding(snapshot),
    buildInventoryFinding(snapshot),
    buildSupplierFinding(snapshot),
    buildCatalogueFinding(snapshot),
    buildCapitalFinding(snapshot),
    buildMissionFinding(snapshot),
  ].sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }

    return b.confidence - a.confidence;
  });
}

function buildHeadline(
  findings: NarratorFinding[],
): string {
  const criticalFinding =
    findings.find(
      (finding) =>
        finding.tone === "critical",
    );

  if (criticalFinding) {
    return criticalFinding.finding;
  }

  const warningFinding =
    findings.find(
      (finding) =>
        finding.tone === "warning",
    );

  if (warningFinding) {
    return warningFinding.finding;
  }

  const tradingFinding =
    findings.find(
      (finding) =>
        finding.source === "shopify",
    );

  return (
    tradingFinding?.finding ??
    "Vault Brain has completed the latest business analysis."
  );
}

function buildNarrative(
  findings: NarratorFinding[],
): string[] {
  const preferredSources: VaultBrainDataSource[] =
    [
      "shopify",
      "commercial",
      "inventory",
      "capital",
      "supplier",
      "missions",
    ];

  const narrative: string[] = [];

  preferredSources.forEach((source) => {
    const finding = findings.find(
      (item) => item.source === source,
    );

    if (
      finding &&
      !narrative.includes(
        finding.finding,
      )
    ) {
      narrative.push(
        finding.finding,
      );
    }
  });

  return narrative.slice(0, 6);
}

function calculateConfidence(
  findings: NarratorFinding[],
): number {
  if (findings.length === 0) {
    return 0;
  }

  const weightedTotal =
    findings.reduce(
      (total, finding) =>
        total +
        finding.confidence *
          Math.max(
            finding.priority,
            1,
          ),
      0,
    );

  const totalWeight =
    findings.reduce(
      (total, finding) =>
        total +
        Math.max(
          finding.priority,
          1,
        ),
      0,
    );

  return clampPercentage(
    weightedTotal / totalWeight,
  );
}

/* ============================================================
   ENGINE
============================================================ */

export const NarratorEngine = {
  analyse({
    snapshot,
    impacts = [],
    recommendations = [],
  }: NarratorContext): NarratorStory {
    const findings =
      buildFindings(snapshot);

    const narrative =
      buildNarrative(findings);

    const generatedDate = new Date(
      snapshot.generatedAt,
    );

    return {
      generatedAt:
        snapshot.generatedAt,

      greeting: getGreeting(
        snapshot.userName,
        generatedDate,
      ),

      headline:
        buildHeadline(findings),

      summary:
        narrative.join(" "),

      findings,

      narrative,

      impacts,

      recommendations,

      confidence:
        calculateConfidence(
          findings,
        ),
    };
  },
} as const;