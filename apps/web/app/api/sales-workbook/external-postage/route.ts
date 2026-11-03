import { NextResponse } from "next/server";
import { OperatorAuthorizationError } from "@/lib/auth/operators";
import { ExternalPostageValidationError, recordExternalOrderPostage } from "@/lib/sales-workbook/ExternalOrderPostage";

/**
 * Not active until record_external_order_postage has been deployed and
 * the verified operational-contribution SQL has been migrated and tested.
 * Never write workbook rows directly from this endpoint.
 */
export async function POST(request: Request) {
  if (process.env.VAULT_EXTERNAL_POSTAGE_ENABLED !== "true") {
    return NextResponse.json({ error: "External postage entry is not enabled" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;
  if (Object.keys(payload).some(key => !["orderNumber", "amountGbp"].includes(key)) ||
      typeof payload.orderNumber !== "string" || typeof payload.amountGbp !== "string") {
    return NextResponse.json({ error: "Invalid request fields" }, { status: 400 });
  }

  try {
    const result = await recordExternalOrderPostage({
      orderNumber: payload.orderNumber,
      amountGbp: payload.amountGbp,
    });
    return NextResponse.json({ status: "recorded", ...result });
  } catch (error) {
    if (error instanceof OperatorAuthorizationError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (error instanceof ExternalPostageValidationError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return NextResponse.json({ error: "External postage could not be recorded" }, { status: 500 });
  }
}
