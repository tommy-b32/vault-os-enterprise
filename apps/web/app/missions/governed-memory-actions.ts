"use server";

import { runGovernedDecisionMemoryCapture } from "@/lib/brain/runGovernedDecisionMemoryCapture";
import { requireOperatorRole } from "@/lib/auth/operators";

type GovernedDecisionMemoryCaptureState =
  | { status: "idle" }
  | {
      status: "success";
      inserted: boolean;
      captureKind: string | null;
      observedAt: string;
    }
  | { status: "error"; message: "Governed decision memory capture failed." };

export async function createFirstGovernedDecisionMemoryBaseline(
  _previousState: GovernedDecisionMemoryCaptureState,
): Promise<GovernedDecisionMemoryCaptureState> {
  try {
    await requireOperatorRole("owner");

    const observedAt = new Date().toISOString();
    const result = await runGovernedDecisionMemoryCapture(observedAt);

    return {
      status: "success",
      inserted: result.inserted,
      captureKind: result.captureKind,
      observedAt,
    };
  } catch {
    return {
      status: "error",
      message: "Governed decision memory capture failed.",
    };
  }
}
