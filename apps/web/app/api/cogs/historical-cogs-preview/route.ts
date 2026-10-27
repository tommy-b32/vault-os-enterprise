import { OperatorAuthorizationError, requireOperatorRole } from "@/lib/auth/operators";
import { createHistoricalMovingAverageCogsPreviewHandler, createHistoricalMovingAverageCogsPreviewPersistenceHandler } from "@/lib/cogs/HistoricalMovingAverageCogsPreviewHttp";
import { SupabaseHistoricalMovingAverageCogsPreviewRepository } from "@/lib/cogs/HistoricalMovingAverageCogsPreviewRepository";
import { supabaseAdmin } from "@/lib/supabase-admin";

const handler = createHistoricalMovingAverageCogsPreviewHandler({
  requireOperator: () => requireOperatorRole("owner", "operator"),
  isOperatorAuthorizationError: (error): error is OperatorAuthorizationError => error instanceof OperatorAuthorizationError,
  source: new SupabaseHistoricalMovingAverageCogsPreviewRepository(supabaseAdmin),
});
const persistenceHandler = createHistoricalMovingAverageCogsPreviewPersistenceHandler({
  requireOperator: () => requireOperatorRole("owner", "operator"),
  isOperatorAuthorizationError: (error): error is OperatorAuthorizationError => error instanceof OperatorAuthorizationError,
  source: new SupabaseHistoricalMovingAverageCogsPreviewRepository(supabaseAdmin),
  async persist(preview, operatorId) {
    const { result, hashes } = preview;
    const { data, error } = await supabaseAdmin.rpc("record_exclusive_tee_historical_cogs_preview", {
      p_draft_policy_version_id: preview.draftPolicyVersionId, p_source_snapshot_sha256: hashes.inputSha256, p_result_sha256: hashes.resultSha256, p_engine_sha256: hashes.engineSha256, p_per_line_sha256: hashes.perLineSha256,
      p_source_evidence: preview.sourceEvidence, p_lines: result.lines, p_calculated_line_count: result.calculatedLineCount, p_returned_restocked_line_count: result.returnedRestockedLineCount,
      p_same_day_receipt_warning_count: result.flagCounts.SAME_DAY_RECEIPT_ORDER_AMBIGUOUS ?? 0, p_simulated_cogs_gbp: result.simulatedCogsGbp, p_existing_policy_cogs_gbp: result.existingPolicyCogsGbp,
      p_closing_inventory_units: result.closingInventoryUnits, p_closing_inventory_landed_gbp: result.closingInventoryLandedGbp, p_actor_id: operatorId,
    });
    if (error || typeof data !== "string") throw error ?? new Error("Historical COGS preview RPC returned no identifier"); return data;
  },
});

export async function GET(request: Request) { return handler(request); }
export async function POST(request: Request) { return persistenceHandler(request); }
