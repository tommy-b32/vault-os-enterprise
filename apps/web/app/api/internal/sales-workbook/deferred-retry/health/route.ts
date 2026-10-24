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
  const configured = process.env.SALES_WORKBOOK_AUTOMATION_SECRET;
  const provided = request.headers.get("x-vault-sales-workbook-automation-secret");
  if (!same(provided, configured)) {
    return NextResponse.json({
      configured_secret_present: Boolean(configured),
      configured_secret_length_matches_64: configured?.length === 64,
      provided_secret_length_matches_64: provided?.length === 64,
    }, { status: 401 });
  }

  return NextResponse.json({ status: "ok" });
}
