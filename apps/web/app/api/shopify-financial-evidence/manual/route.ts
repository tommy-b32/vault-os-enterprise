import { NextResponse } from "next/server";

import { OperatorAuthorizationError, requireOperatorRole } from "@/lib/auth/operators";
import { supabaseAdmin } from "@/lib/supabase-admin";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const evidenceTypes = new Set(["shipping_cost", "payment_fee"]);

function parse(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !["orderId", "evidenceType", "amountGbp", "reason", "supportingEvidence"].includes(key)) ||
      typeof body.orderId !== "string" || !uuid.test(body.orderId) || typeof body.evidenceType !== "string" || !evidenceTypes.has(body.evidenceType) ||
      typeof body.amountGbp !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(body.amountGbp) || Number(body.amountGbp) > 1_000_000 ||
      typeof body.reason !== "string" || body.reason.trim().length < 10 || body.reason.trim().length > 2000 ||
      typeof body.supportingEvidence !== "string" || body.supportingEvidence.trim().length < 3 || body.supportingEvidence.trim().length > 4000) return null;
  return { orderId: body.orderId, evidenceType: body.evidenceType, amountGbp: body.amountGbp, reason: body.reason.trim(), supportingEvidence: body.supportingEvidence.trim() };
}

export async function POST(request: Request) {
  try {
    const operator = await requireOperatorRole("owner");
    const input = parse(await request.json().catch(() => null));
    if (!input) return NextResponse.json({ error: "Invalid manual financial evidence" }, { status: 400 });
    const { data, error } = await supabaseAdmin.rpc("record_shopify_manual_financial_evidence", {
      p_order_id: input.orderId, p_evidence_type: input.evidenceType, p_amount_gbp: input.amountGbp,
      p_reason: input.reason, p_supporting_evidence: input.supportingEvidence, p_operator_id: operator.id,
    });
    if (error) return NextResponse.json({ error: "Manual financial evidence was rejected" }, { status: 409 });
    return NextResponse.json({ evidenceId: data }, { status: 201 });
  } catch (error) {
    if (error instanceof OperatorAuthorizationError) return NextResponse.json({ error: error.reason === "forbidden" ? "Forbidden" : "Unauthorized" }, { status: error.reason === "forbidden" ? 403 : 401 });
    console.error("Manual financial evidence unavailable", { name: error instanceof Error ? error.name : "Unknown" });
    return NextResponse.json({ error: "Manual financial evidence is unavailable" }, { status: 500 });
  }
}
