import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { GovernedDecisionMemoryProjection } from "@/lib/brain/GovernedDecisionMemory";

export type GovernedDecisionMemoryRecord = GovernedDecisionMemoryProjection & { semantic_hash: string };
export const GovernedDecisionMemoryRepository = {
  async record(record: GovernedDecisionMemoryRecord): Promise<{ inserted: boolean; captureKind: "change" | "daily_baseline" | null }> {
    const { data, error } = await supabaseAdmin.rpc("record_governed_decision_memory", { input: record }).single();
    if (error) throw new Error(`Unable to record governed decision memory: ${error.message}`);
    const result = data as { inserted: boolean; recorded_capture_kind: "change" | "daily_baseline" | null };
    return { inserted: result.inserted, captureKind: result.recorded_capture_kind };
  },
} as const;
