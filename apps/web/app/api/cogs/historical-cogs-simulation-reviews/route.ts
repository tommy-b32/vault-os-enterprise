import { OperatorAuthorizationError, requireOperatorRole } from "@/lib/auth/operators";
import { createHistoricalCogsSimulationReviewFromPreviewHandler } from "@/lib/cogs/HistoricalCogsSimulationReviewHttp";
import { supabaseAdmin } from "@/lib/supabase-admin";

const handler = createHistoricalCogsSimulationReviewFromPreviewHandler({
  requireOperator: () => requireOperatorRole("owner", "operator"),
  isOperatorAuthorizationError: (error): error is OperatorAuthorizationError => error instanceof OperatorAuthorizationError,
  async createReviewFromPreview(previewId, operatorId) {
    const { data, error } = await supabaseAdmin.rpc("create_historical_cogs_review_from_preview", { p_preview_id: previewId, p_actor_id: operatorId });
    if (error || typeof data !== "string") throw error ?? new Error("Historical COGS simulation review RPC returned no identifier");
    return data;
  },
});

export async function POST(request: Request) { return handler(request); }
