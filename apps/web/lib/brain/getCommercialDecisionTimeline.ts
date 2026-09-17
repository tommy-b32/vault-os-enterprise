import "server-only";

import {
  CommercialDecisionTimeline,
  type CommercialDecisionTimelineResult,
} from "@/lib/brain/CommercialDecisionTimeline";
import { runGovernedDecisionEvaluation } from "@/lib/brain/runGovernedDecisionEvaluation";

export async function getCommercialDecisionTimeline(
  generatedAt: string,
): Promise<CommercialDecisionTimelineResult | null> {
  try {
    const { evaluation, advisor, reasonSummary } = await runGovernedDecisionEvaluation(generatedAt);
    const candidates = evaluation.candidates;

    return CommercialDecisionTimeline.build({
      advisor,
      candidates,
      reasonSummary,
      generatedAt,
    });
  } catch {
    return null;
  }
}
