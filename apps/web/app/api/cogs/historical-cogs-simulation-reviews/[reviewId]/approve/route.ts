import { OperatorAuthorizationError, requireOperatorRole } from "@/lib/auth/operators";
import { createHistoricalCogsSimulationReviewApprovalFromPreviewHandler } from "@/lib/cogs/HistoricalCogsSimulationReviewHttp";
import { supabaseAdmin } from "@/lib/supabase-admin";

const handler = createHistoricalCogsSimulationReviewApprovalFromPreviewHandler({
  requireOperator: () => requireOperatorRole("owner"),
  isOperatorAuthorizationError: (error): error is OperatorAuthorizationError => error instanceof OperatorAuthorizationError,
  async approveReviewFromPreview(reviewId, previewId, approvalNote, operatorId) {
    const { data, error } = await supabaseAdmin.rpc("approve_historical_cogs_review_from_preview", { p_review_id: reviewId, p_preview_id: previewId, p_approval_note: approvalNote, p_actor_id: operatorId });
    if (error || typeof data !== "string") throw error ?? new Error("Historical COGS simulation approval RPC returned no identifier");
    return data;
  },
});

export async function POST(request: Request) { return handler(request); }
