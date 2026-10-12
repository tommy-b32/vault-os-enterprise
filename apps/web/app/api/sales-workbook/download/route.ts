import { NextResponse } from "next/server";
import { OperatorAuthorizationError, requireOperatorRole } from "@/lib/auth/operators";
import { SalesWorkbookRepository } from "@/lib/sales-workbook/SalesWorkbookRepository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const operator = await requireOperatorRole("owner", "operator");
    const { url } = await SalesWorkbookRepository.createSignedDownload({
      operatorId: operator.id,
      expiresIn: 120,
    });
    return NextResponse.redirect(url, {
      status: 302,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof OperatorAuthorizationError) {
      const status = error.reason === "forbidden" ? 403 : 401;
      return NextResponse.json({ error: status === 403 ? "Forbidden" : "Unauthorized" }, { status });
    }
    console.error("Sales workbook download failed", {
      name: error instanceof Error ? error.name : "Unknown",
    });
    return NextResponse.json({ error: "Workbook download unavailable" }, { status: 500 });
  }
}
