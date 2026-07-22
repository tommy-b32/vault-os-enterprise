import type {
  AdvisorDiagnostics,
} from "@/lib/brain/AdvisorEngine";

export type InsightSeverity =
  | "success"
  | "warning"
  | "info";

export type Insight = {
  id: string;
  severity: InsightSeverity;
  title: string;
  message: string;
};

export type InsightEngineInput = {
  diagnostics: AdvisorDiagnostics;
};

export type InsightEngineResult = {
  insights: Insight[];
  primaryInsight: Insight | null;
};

function createInsights(
  diagnostics: AdvisorDiagnostics,
): Insight[] {
  const insights: Insight[] = [];

  if (diagnostics.productsScanned === 0) {
    insights.push({
      id: "catalogue-empty",
      severity: "info",
      title: "Catalogue awaiting products",
      message:
        "Vault Brain cannot generate commercial intelligence until products are added to the catalogue.",
    });

    return insights;
  }

  if (diagnostics.commercialDataMissing > 0) {
    insights.push({
      id: "commercial-data-missing",
      severity: "warning",
      title: "Commercial data incomplete",
      message: `${diagnostics.commercialDataMissing} ${
        diagnostics.commercialDataMissing === 1
          ? "product is"
          : "products are"
      } missing the commercial information needed for full profitability analysis.`,
    });
  }

  const suppliersMissing =
    Math.max(
      0,
      diagnostics.productsScanned -
        diagnostics.supplierAssigned,
    );

  if (suppliersMissing > 0) {
    insights.push({
      id: "suppliers-missing",
      severity: "warning",
      title: "Supplier configuration required",
      message: `${suppliersMissing} ${
        suppliersMissing === 1
          ? "product does"
          : "products do"
      } not currently have a supplier assigned.`,
    });
  }

  const restockDisabled =
    Math.max(
      0,
      diagnostics.productsScanned -
        diagnostics.restockEnabled,
    );

  if (restockDisabled > 0) {
    insights.push({
      id: "restock-disabled",
      severity: "info",
      title: "Restock intelligence limited",
      message: `${restockDisabled} ${
        restockDisabled === 1
          ? "product is"
          : "products are"
      } not enabled for automated restock analysis.`,
    });
  }

  if (diagnostics.lowStock > 0) {
    insights.push({
      id: "low-stock-detected",
      severity: "warning",
      title: "Low stock detected",
      message: `${diagnostics.lowStock} ${
        diagnostics.lowStock === 1
          ? "product is"
          : "products are"
      } currently within the low-stock range and may require attention.`,
    });
  }

  if (diagnostics.productsQualifying > 0) {
    insights.push({
      id: "products-qualifying",
      severity: "success",
      title: "Buying opportunities available",
      message: `${diagnostics.productsQualifying} ${
        diagnostics.productsQualifying === 1
          ? "product currently qualifies"
          : "products currently qualify"
      } for commercial buying consideration.`,
    });
  } else {
    insights.push({
      id: "no-products-qualifying",
      severity: "info",
      title: "No products qualify today",
      message:
        "Vault Brain did not identify a product that currently passes every stock, margin, return and configuration rule.",
    });
  }

  if (
    diagnostics.commercialDataComplete ===
    diagnostics.productsScanned
  ) {
    insights.push({
      id: "commercial-data-complete",
      severity: "success",
      title: "Commercial catalogue complete",
      message:
        "Every catalogue product contains the commercial information required for analysis.",
    });
  }

  if (
    diagnostics.supplierAssigned ===
    diagnostics.productsScanned
  ) {
    insights.push({
      id: "supplier-coverage-complete",
      severity: "success",
      title: "Supplier coverage complete",
      message:
        "Every catalogue product currently has a supplier assigned.",
    });
  }

  return insights;
}

function analyse(
  input: InsightEngineInput,
): InsightEngineResult {
  const insights =
    createInsights(input.diagnostics);

  const primaryInsight =
    insights.find(
      (insight) =>
        insight.severity === "warning",
    ) ??
    insights.find(
      (insight) =>
        insight.severity === "success",
    ) ??
    insights[0] ??
    null;

  return {
    insights,
    primaryInsight,
  };
}

export const InsightEngine = {
  analyse,
};