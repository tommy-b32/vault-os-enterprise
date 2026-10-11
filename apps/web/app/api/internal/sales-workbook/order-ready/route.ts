import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { runOrderReadyWorkbookWorker } from "@/lib/sales-workbook/OrderReadyWorkbookWorker";
import { SalesWorkbookConflictError } from "@/lib/sales-workbook/types";

const sameSecret = (provided: string | null, configured: string | undefined) => {
  if (!provided || !configured) return false;
  const left = Buffer.from(provided), right = Buffer.from(configured);
  return left.length === right.length && timingSafeEqual(left, right);
};

export async function POST(request: Request) {
  if (!sameSecret(request.headers.get("x-vault-sales-workbook-automation-secret"), process.env.SALES_WORKBOOK_AUTOMATION_SECRET)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { orderNumbers?: unknown } | null;
  if (!body || !Array.isArray(body.orderNumbers) || !body.orderNumbers.every(value => typeof value === "string" || typeof value === "number")) return NextResponse.json({ error: "Invalid affected order scope" }, { status: 400 });
  try {
    return NextResponse.json(await runOrderReadyWorkbookWorker(body.orderNumbers.map(String)));
  } catch (error) {
    if (error instanceof SalesWorkbookConflictError) return NextResponse.json({ error: "Sales workbook changed; event may be retried" }, { status: 409 });
    console.error("Sales workbook order-ready worker failed", { name: error instanceof Error ? error.name : "Unknown" });
    return NextResponse.json({ error: "Sales workbook order-ready worker failed" }, { status: 500 });
  }
}
