import "server-only";

import { createGovernedDecisionMemoryCaptureHandler } from "@/lib/governed-decision-memory/createGovernedDecisionMemoryCaptureHandler";
import { runGovernedDecisionMemoryCapture } from "@/lib/brain/runGovernedDecisionMemoryCapture";

export const runtime = "nodejs";

const handleCapture = createGovernedDecisionMemoryCaptureHandler({
  capture: runGovernedDecisionMemoryCapture,
  getSchedulerSecret: () => process.env.GOVERNED_DECISION_MEMORY_SCHEDULER_SECRET,
});

export async function POST(request: Request): Promise<Response> {
  return handleCapture(request);
}
