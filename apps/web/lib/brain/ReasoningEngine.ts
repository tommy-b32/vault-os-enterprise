export type ReasoningLevel =
  | "excellent"
  | "good"
  | "warning"
  | "critical";

export type ReasoningFinding = {
  id: string;
  title: string;
  explanation: string;
  impact: string;
  confidence: number;
  level: ReasoningLevel;
};

export type ReasoningReport = {
  score: number;
  findings: ReasoningFinding[];
};

type Input = {
  diagnostics: {
    commercialDataMissing: number;
    supplierAssigned: number;
    productsScanned: number;
    productsQualifying: number;
    lowStock: number;
    commercialCostTrusted: number;
  };
};

export class ReasoningEngine {
  static analyse(
    input: Input,
  ): ReasoningReport {
    const findings: ReasoningFinding[] = [];

    let score = 100;

    if (
      input.diagnostics.commercialDataMissing >
      0
    ) {
      findings.push({
        id: "commercial",
        title:
          "Commercial information missing",
        explanation:
          "Products are missing trusted commercial data.",
        impact:
          "Buying confidence is reduced.",
        confidence: 98,
        level: "critical",
      });

      score -= 35;
    }

    if (
      input.diagnostics.supplierAssigned <
      input.diagnostics.productsScanned
    ) {
      findings.push({
        id: "supplier",
        title:
          "Supplier coverage incomplete",
        explanation:
          "Some products cannot yet be analysed for purchasing decisions.",
        impact:
          "Recommendations remain limited.",
        confidence: 95,
        level: "warning",
      });

      score -= 20;
    }

    if (
      input.diagnostics.lowStock >
      10
    ) {
      findings.push({
        id: "stock",
        title:
          "Growing stock exposure",
        explanation:
          "Several products are approaching reorder level.",
        impact:
          "Potential missed sales.",
        confidence: 91,
        level: "warning",
      });

      score -= 10;
    }

    if (
      input.diagnostics.productsQualifying >
      0
    ) {
      findings.push({
        id: "buy",
        title:
          "Purchase opportunities detected",
        explanation:
          "Vault Brain has identified products meeting every buying rule.",
        impact:
          "Buying decisions available.",
        confidence: 99,
        level: "excellent",
      });
    }

    score = Math.max(score, 5);

    return {
      score,
      findings,
    };
  }
}