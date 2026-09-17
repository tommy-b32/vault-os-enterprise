import "server-only";
import { buildGovernedDecisionMemoryProjection } from "@/lib/brain/GovernedDecisionMemory";
import { recordGovernedDecisionMemory } from "@/lib/brain/GovernedDecisionMemoryRecorder";
import { runGovernedDecisionEvaluation } from "@/lib/brain/runGovernedDecisionEvaluation";

/** Dedicated scheduler/server-job entry point. It is deliberately not called by rendering. */
export async function runGovernedDecisionMemoryCapture(observedAt = new Date().toISOString()) {
  const result = await runGovernedDecisionEvaluation(observedAt);
  const projection = buildGovernedDecisionMemoryProjection({ observedAt, summary: result.reasonSummary, evaluation: result.evaluation, wallet: result.wallet, inventory: result.inventory });
  return recordGovernedDecisionMemory(projection);
}
