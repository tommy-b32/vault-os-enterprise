import type {
  BrainLearningEvent,
} from "@/types/brain-learning";

export type BrainAnalytics = {
  totalDecisions: number;

  acceptedRecommendations: number;

  manualOverrides: number;

  recommendationAccuracy: number;

  averageAcceptedConfidence: number;
};

export const BrainAnalyticsEngine = {
  analyse(
    events: BrainLearningEvent[],
  ): BrainAnalytics {
    const accepted =
      events.filter(
        (event) => event.accepted,
      );

    const recommended =
      accepted.filter(
        (event) =>
          event.decisionReason ===
          "recommended",
      );

    const manual =
      accepted.filter(
        (event) =>
          event.decisionReason ===
          "manual_override",
      );

    const averageConfidence =
      accepted.length === 0
        ? 0
        : Math.round(
            accepted.reduce(
              (total, event) =>
                total +
                event.recommendationScore,
              0,
            ) / accepted.length,
          );

    return {
      totalDecisions:
        events.length,

      acceptedRecommendations:
        recommended.length,

      manualOverrides:
        manual.length,

      recommendationAccuracy:
        events.length === 0
          ? 0
          : Math.round(
              (recommended.length /
                events.length) *
                100,
            ),

      averageAcceptedConfidence:
        averageConfidence,
    };
  },
} as const;