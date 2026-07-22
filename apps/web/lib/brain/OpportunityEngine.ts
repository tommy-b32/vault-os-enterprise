export type OpportunityPriority =
  | "critical"
  | "high"
  | "medium"
  | "low";

export type Opportunity = {
  id: string;

  title: string;
  description: string;

  priority: OpportunityPriority;

  estimatedProfit: number;

  confidence: number;

  source:
    | "commercial"
    | "capital"
    | "inventory"
    | "supplier"
    | "forecast";
};

export type OpportunityEngineInput = {
  opportunities: Opportunity[];
};

export type OpportunityEngineResult = {
  highestPriority: Opportunity | null;

  ranked: Opportunity[];

  totalEstimatedProfit: number;

  averageConfidence: number;
};

function priorityWeight(
  priority: OpportunityPriority,
): number {
  switch (priority) {
    case "critical":
      return 4;

    case "high":
      return 3;

    case "medium":
      return 2;

    default:
      return 1;
  }
}

export function analyseOpportunities(
  input: OpportunityEngineInput,
): OpportunityEngineResult {
  const ranked = [...input.opportunities].sort(
    (a, b) => {
      const priorityDifference =
        priorityWeight(b.priority) -
        priorityWeight(a.priority);

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      if (
        b.estimatedProfit !==
        a.estimatedProfit
      ) {
        return (
          b.estimatedProfit -
          a.estimatedProfit
        );
      }

      return (
        b.confidence -
        a.confidence
      );
    },
  );

  const totalEstimatedProfit =
    ranked.reduce(
      (total, opportunity) =>
        total +
        opportunity.estimatedProfit,
      0,
    );

  const averageConfidence =
    ranked.length === 0
      ? 0
      : Math.round(
          ranked.reduce(
            (total, opportunity) =>
              total +
              opportunity.confidence,
            0,
          ) / ranked.length,
        );

  return {
    highestPriority:
      ranked.length > 0
        ? ranked[0]
        : null,

    ranked,

    totalEstimatedProfit,

    averageConfidence,
  };
}

export const OpportunityEngine = {
  analyse: analyseOpportunities,
};