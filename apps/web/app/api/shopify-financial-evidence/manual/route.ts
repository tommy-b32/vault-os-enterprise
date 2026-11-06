import { NextResponse } from "next/server";
import { OperatorAuthorizationError, requireOperatorRole } from "@/lib/auth/operators";
import { supabaseAdmin } from "@/lib/supabase-admin";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const operator = await requireOperatorRole("owner");
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || Object.keys(body).some(key => !["orderId", "amountGbp", "reason", "supportingEvidence"].includes(key)) || typeof body.orderId !== "string" || !uuid.test(body.orderId) || typeof body.amountGbp !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(body.amountGbp) || Number(body.amountGbp) > 1_000_000 || typeof body.reason !== "string" || body.reason.trim().length < 10 || body.reason.trim().length > 2000 || typeof body.supportingEvidence !== "string" || body.supportingEvidence.trim().length < 3 || body.supportingEvidence.trim().length > 4000) return NextResponse.json({ error: "Invalid manual payment-fee evidence" }, { status: 400 });
    const { data, error } = await supabaseAdmin.rpc("record_shopify_manual_financial_evidence", { p_order_id: body.orderId, p_evidence_type: "payment_fee", p_amount_gbp: body.amountGbp, p_reason: body.reason.trim(), p_supporting_evidence: body.supportingEvidence.trim(), p_operator_id: operator.id });
    if (error) return NextResponse.json({ error: "Manual payment-fee evidence was rejected" }, { status: 409 });
    return NextResponse.json({ evidenceId: data }, { status: 201 });
  } catch (error) {
    if (error instanceof OperatorAuthorizationError) return NextResponse.json({ error: error.reason === "forbidden" ? "Forbidden" : "Unauthorized" }, { status: error.reason === "forbidden" ? 403 : 401 });
    return NextResponse.json({ error: "Manual payment-fee evidence is unavailable" }, { status: 500 });
  }
}
