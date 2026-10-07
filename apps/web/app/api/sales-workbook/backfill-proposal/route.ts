import { NextResponse } from "next/server";

import { OperatorAuthorizationError, requireOperatorRole } from "@/lib/auth/operators";
import { getBackfillProposal } from "@/lib/sales-workbook/BackfillProposalService";

export async function GET() {
  try {
    await requireOperatorRole("owner", "operator");
    return NextResponse.json(await getBackfillProposal());
  } catch (error) {
    if (error instanceof OperatorAuthorizationError) return NextResponse.json({ error: error.reason === "forbidden" ? "Forbidden" : "Unauthorized" }, { status: error.reason === "forbidden" ? 403 : 401 });
    console.error("Sales workbook backfill proposal unavailable", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Sales workbook backfill proposal is unavailable" }, { status: 500 });
  }
}
