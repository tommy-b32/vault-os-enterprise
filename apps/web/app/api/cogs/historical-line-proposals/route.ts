import { NextResponse } from "next/server";

import { OperatorAuthorizationError, requireOperatorRole } from "@/lib/auth/operators";
import { createSessionSupabaseClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createHistoricalLineCogsProposalHandler } from "@/lib/cogs/HistoricalLineCogsProposalHttp";
import {
  HISTORICAL_COGS_PREFILL,
} from "@/lib/cogs/HistoricalLineCogsProposal";

type ProposalRow = {
  id: string;
  approval_status: "PENDING" | "APPROVED" | "REJECTED";
  owner_attestation: string;
  proposed_at: string;
  approved_at: string | null;
};

type AuditRow = {
  id: string;
  proposal_id: string;
  event_type: "PROPOSED" | "APPROVED" | "REJECTED";
  note: string;
  recorded_at: string;
};

async function loadPreview() {
  const [lineResult, batchResult, proposalResult, resolutionResult] = await Promise.all([
    supabaseAdmin
      .from("vault_shopify_order_lines")
      .select("id, order_id, title, variant_title, cogs_quantity, cogs_status, cogs_history_id, vault_shopify_orders!inner(order_number, shopify_created_at)")
      .eq("id", HISTORICAL_COGS_PREFILL.lineId)
      .maybeSingle(),
    supabaseAdmin
      .from("vault_historical_delivery_cost_batches")
      .select("id, source_reference, receipt_status, validation_status, approval_status, received_at, landed_cost_gbp, received_quantity")
      .eq("id", HISTORICAL_COGS_PREFILL.deliveryBatchId)
      .maybeSingle(),
    supabaseAdmin
      .from("vault_governed_historical_line_cogs_proposals")
      .select("id, approval_status, owner_attestation, proposed_at, approved_at")
      .eq("order_line_id", HISTORICAL_COGS_PREFILL.lineId)
      .maybeSingle<ProposalRow>(),
    supabaseAdmin
      .from("vault_stage1_sold_line_cogs_resolutions")
      .select("order_line_id")
      .eq("order_line_id", HISTORICAL_COGS_PREFILL.lineId)
      .maybeSingle(),
  ]);

  for (const result of [lineResult, batchResult, proposalResult, resolutionResult]) {
    if (result.error && result.error.code !== "PGRST116") throw result.error;
  }

  const line = lineResult.data as {
    id: string; title: string | null; variant_title: string | null; cogs_quantity: number; cogs_status: string;
    cogs_history_id: string | null; vault_shopify_orders: { order_number: string; shopify_created_at: string } | null;
  } | null;
  const batch = batchResult.data as {
    id: string; source_reference: string; receipt_status: string; validation_status: string; approval_status: string;
    received_at: string | null; landed_cost_gbp: number; received_quantity: number;
  } | null;
  const computedUnitCost = batch && batch.received_quantity > 0
    ? Math.round((Number(batch.landed_cost_gbp) / Number(batch.received_quantity)) * 10_000) / 10_000
    : null;
  const saleAt = line?.vault_shopify_orders?.shopify_created_at ?? null;
  const eligible = Boolean(
    line && batch && saleAt &&
    line.cogs_quantity === HISTORICAL_COGS_PREFILL.quantity &&
    line.cogs_status !== "trusted" && !line.cogs_history_id &&
    !proposalResult.data && !resolutionResult.data &&
    batch.source_reference === HISTORICAL_COGS_PREFILL.deliveryReference &&
    batch.receipt_status === "RECEIVED" && batch.validation_status === "VALID" && batch.approval_status === "APPROVED" &&
    batch.received_at && new Date(batch.received_at) <= new Date(saleAt) &&
    computedUnitCost === HISTORICAL_COGS_PREFILL.unitLandedCogsGbp,
  );

  const proposal = proposalResult.data ?? null;
  const auditResult = proposal
    ? await supabaseAdmin
      .from("vault_governed_historical_line_cogs_proposal_audit")
      .select("id, proposal_id, event_type, note, recorded_at")
      .eq("proposal_id", proposal.id)
      .order("recorded_at", { ascending: true })
    : { data: [] as AuditRow[], error: null };
  if (auditResult.error) throw auditResult.error;

  return {
    prefill: HISTORICAL_COGS_PREFILL,
    line: line ? { title: line.title, variantTitle: line.variant_title, quantity: line.cogs_quantity, cogsStatus: line.cogs_status, saleAt } : null,
    batch: batch ? { reference: batch.source_reference, receivedAt: batch.received_at, receiptStatus: batch.receipt_status, validationStatus: batch.validation_status, approvalStatus: batch.approval_status, computedUnitCost } : null,
    eligible,
    proposal,
    audit: auditResult.data ?? [],
  };
}

function authorizationResponse(error: unknown) {
  if (!(error instanceof OperatorAuthorizationError)) return null;
  const status = error.reason === "forbidden" ? 403 : 401;
  return NextResponse.json({ error: status === 403 ? "Forbidden" : "Unauthorized" }, { status });
}

export async function GET() {
  try {
    const operator = await requireOperatorRole("owner", "operator");
    return NextResponse.json({ ...(await loadPreview()), operatorRole: operator.role });
  } catch (error) {
    return authorizationResponse(error) ?? NextResponse.json({ error: "Historical COGS preview is unavailable" }, { status: 500 });
  }
}

export const POST = createHistoricalLineCogsProposalHandler({
  requireOperator: () => requireOperatorRole("owner", "operator"),
  requireOwner: () => requireOperatorRole("owner"),
  isOperatorAuthorizationError: (error): error is OperatorAuthorizationError => error instanceof OperatorAuthorizationError,
  loadPreview,
  async stage() {
    // Deliberately session-scoped: auth.uid() is the authenticated operator and is rechecked by the RPC.
    const supabase = await createSessionSupabaseClient();
    const { data, error } = await supabase.rpc("stage_governed_historical_line_cogs_proposal", {
      p_order_line_id: HISTORICAL_COGS_PREFILL.lineId,
      p_delivery_batch_id: HISTORICAL_COGS_PREFILL.deliveryBatchId,
      p_unit_landed_cogs_gbp: HISTORICAL_COGS_PREFILL.unitLandedCogsGbp,
      p_owner_attestation: HISTORICAL_COGS_PREFILL.attestation,
    });
    if (error || !data) throw new Error(error?.message ?? "Historical COGS staging failed");
    return data;
  },
  async proposalExists(proposalId) {
    const { data, error } = await supabaseAdmin.from("vault_governed_historical_line_cogs_proposals").select("id").eq("id", proposalId).eq("order_line_id", HISTORICAL_COGS_PREFILL.lineId).maybeSingle();
    if (error) throw error;
    return !!data;
  },
  async decide(proposalId, decision, approvalNote) {
    // Deliberately session-scoped: the owner check happens again inside the SECURITY DEFINER RPC.
    const supabase = await createSessionSupabaseClient();
    const { error } = await supabase.rpc("decide_governed_historical_line_cogs_proposal", { p_proposal_id: proposalId, p_decision: decision, p_approval_note: approvalNote });
    if (error) throw error;
  },
});
