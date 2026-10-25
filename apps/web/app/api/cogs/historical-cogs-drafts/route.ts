import { OperatorAuthorizationError, requireOperatorRole } from "@/lib/auth/operators";
import { createHistoricalCogsDraftHandler } from "@/lib/cogs/HistoricalCogsDraftHttp";
import { supabaseAdmin } from "@/lib/supabase-admin";

const handler = createHistoricalCogsDraftHandler({
  requireOperator: () => requireOperatorRole("owner", "operator"),
  isOperatorAuthorizationError: (error): error is OperatorAuthorizationError => error instanceof OperatorAuthorizationError,
  async createDraft(input) {
    const { data, error } = await supabaseAdmin.rpc("create_exclusive_tee_historical_cogs_draft", {
      p_legacy_batch_ids: input.legacyBatchIds,
      p_governed_delivery_batch_ids: input.governedDeliveryBatchIds,
      p_actor_id: input.operatorId,
    });
    if (error || typeof data !== "string") throw error ?? new Error("Historical COGS draft RPC returned no identifier");
    return data;
  },
});

export async function POST(request: Request) { return handler(request); }
