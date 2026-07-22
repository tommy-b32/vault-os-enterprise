import {
  AdvisorEngine,
} from "@/lib/brain/AdvisorEngine";

import type {
  AdvisorDiagnostics,
} from "@/lib/brain/AdvisorEngine";

import type {
  Insight,
} from "@/lib/brain/InsightEngine";

type AdvisorAnalysis =
  ReturnType<
    typeof AdvisorEngine.analyse
  >["analysis"];

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

export type MorningBriefingResult = {
  greeting: string;
  headline: string;
  summary: string;
  recommendation: string;
  readinessPercentage: number;
  readinessLabel: string;
  items: MorningBriefingItem[];
};

type AnalyseInput = {
  diagnostics: AdvisorDiagnostics;
  analysis: AdvisorAnalysis;
  insights: Insight[];
  catalogueCompletionPercentage: number;
  userName?: string;
};

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function calculatePercentage(
  value: number,
  total: number,
): number {
  if (total <= 0) {
    return 0;
  }

  return clampPercentage((value / total) * 100);
}

function getGreeting(userName: string): string {
  const hour = new Date().getHours();

  if (hour < 12) {
    return `Good morning ${userName}.`;
  }

  if (hour < 18) {
    return `Good afternoon ${userName}.`;
  }

  return `Good evening ${userName}.`;
}

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

function getHeadline(
  diagnostics: AdvisorDiagnostics,
): string {
  if (diagnostics.productsQualifying > 0) {
    return `${diagnostics.productsQualifying} commercial ${
      diagnostics.productsQualifying === 1
        ? "opportunity is"
        : "opportunities are"
    } ready for review.`;
  }

  if (diagnostics.commercialDataMissing > 0) {
    return "Commercial readiness is currently being limited by incomplete catalogue data.";
  }

  if (diagnostics.lowStock > 0) {
    return "Inventory exposure requires attention today.";
  }

  return "Vault Brain has completed today’s commercial review.";
}

function getRecommendation(
  diagnostics: AdvisorDiagnostics,
): string {
  if (
    diagnostics.supplierAssigned <
    diagnostics.productsScanned
  ) {
    return "Complete supplier assignments before placing new purchase orders so Vault Brain can compare cost, reliability and reorder risk accurately.";
  }

  if (diagnostics.commercialDataMissing > 0) {
    return "Complete the missing commercial fields so margin, return and purchasing recommendations can be trusted.";
  }

  if (
    diagnostics.lowStock > 0 &&
    diagnostics.productsQualifying === 0
  ) {
    return "Review low-stock products and confirm their cost and reorder settings before committing additional capital.";
  }

  if (diagnostics.productsQualifying > 0) {
    return "Review the ranked commercial opportunities and prioritise the highest-confidence recommendation first.";
  }

  return "No urgent commercial action is required. Continue maintaining supplier, stock and cost data.";
}

export const MorningBriefingEngine = {
  analyse({
    diagnostics,
    analysis,
    insights,
    catalogueCompletionPercentage,
    userName = "Tom",
  }: AnalyseInput): MorningBriefingResult {
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
        catalogueCompletionPercentage * 0.4 +
          commercialTrustPercentage * 0.35 +
          supplierCoveragePercentage * 0.25,
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
        diagnostics.commercialCostTrusted === 1
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
      headline: getHeadline(diagnostics),
      summary: summaryParts.join(" "),
      recommendation:
        getRecommendation(diagnostics),
      readinessPercentage,
      readinessLabel:
        getReadinessLabel(readinessPercentage),
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
          value: String(diagnostics.lowStock),
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
            supplierCoveragePercentage >= 80
              ? "success"
              : "warning",
        },
        {
          id: "commercial-trust",
          label: "Commercial trust",
          value: `${commercialTrustPercentage}%`,
          tone:
            commercialTrustPercentage >= 80
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
          value: String(warningInsights),
          tone:
            warningInsights > 0
              ? "warning"
              : "success",
        },
      ],
    };
  },
};