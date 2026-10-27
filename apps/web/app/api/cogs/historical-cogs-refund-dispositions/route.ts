import { OperatorAuthorizationError, requireOperatorRole } from "@/lib/auth/operators";
import { createHistoricalCogsRefundDispositionHandler } from "@/lib/cogs/HistoricalCogsRefundDispositionHttp";
import { supabaseAdmin } from "@/lib/supabase-admin";

const handler = createHistoricalCogsRefundDispositionHandler({
  requireOwner: () => requireOperatorRole("owner"),
  isOperatorAuthorizationError: (error): error is OperatorAuthorizationError => error instanceof OperatorAuthorizationError,
  async record(input) {
    const { data, error } = await supabaseAdmin.rpc("record_exclusive_tee_historical_cogs_refund_disposition", {
      p_draft_policy_version_id: input.draftPolicyVersionId, p_subject_order_line_id: input.subjectOrderLineId,
      p_refund_line_observation_ids: input.refundLineObservationIds, p_disposition: input.disposition,
      p_owner_attestation: input.ownerAttestation, p_actor_id: input.operatorId,
    });
    if (error || typeof data !== "string") throw error ?? new Error("Historical COGS refund disposition RPC returned no identifier");
    return data;
  },
});

export async function POST(request: Request) { return handler(request); }
