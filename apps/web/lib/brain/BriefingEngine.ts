export type BriefingActionPriority =
  | "critical"
  | "high"
  | "medium"
  | "low";

export type BriefingAction = {
  id: string;

  title: string;
  description: string;

  priority: BriefingActionPriority;

  confidence: number;
};

export type BusinessHealth =
  | "excellent"
  | "good"
  | "fair"
  | "poor";

export type BriefingInput = {
  availableCapital: number;

  projectedProfit: number;

  confidence: number;

  recommendedSpend: number;

  actions: BriefingAction[];
};

export type BriefingResult = {
  businessHealth: BusinessHealth;

  businessHealthScore: number;

  availableCapital: number;

  projectedProfit: number;

  recommendedSpend: number;

  confidence: number;

  primaryAction: BriefingAction | null;

  actions: BriefingAction[];
};

function determineBusinessHealth(
  score: number,
): BusinessHealth {
  if (score >= 90) {
    return "excellent";
  }

  if (score >= 75) {
    return "good";
  }

  if (score >= 60) {
    return "fair";
  }

  return "poor";
}

export function generateBriefing(
  input: BriefingInput,
): BriefingResult {
  const healthScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        input.confidence * 0.7 +
          (input.projectedProfit > 0
            ? 20
            : 0) +
          (input.availableCapital > 1000
            ? 10
            : 0),
      ),
    ),
  );

  return {
    businessHealth:
      determineBusinessHealth(
        healthScore,
      ),

    businessHealthScore:
      healthScore,

    availableCapital:
      input.availableCapital,

    projectedProfit:
      input.projectedProfit,

    recommendedSpend:
      input.recommendedSpend,

    confidence:
      input.confidence,

    primaryAction:
      input.actions.length > 0
        ? input.actions[0]
        : null,

    actions: [...input.actions].sort(
      (a, b) =>
        b.confidence -
        a.confidence,
    ),
  };
}

export const BriefingEngine = {
  generate:
    generateBriefing,
};