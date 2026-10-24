import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

const same = (provided: string | null, configured: string | undefined) => {
  if (!provided || !configured) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(configured);
  return left.length === right.length && timingSafeEqual(left, right);
};

// This intentionally performs no recovery, database, Storage, or Shopify work.
export async function GET(request: Request) {
  if (!same(request.headers.get("x-vault-sales-workbook-automation-secret"), process.env.SALES_WORKBOOK_AUTOMATION_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ status: "ok" });
}
