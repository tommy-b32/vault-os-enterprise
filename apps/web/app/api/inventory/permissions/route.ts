import { NextResponse } from "next/server";

import { authorizeApiRequest } from "@/lib/auth/api";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const denied = await authorizeApiRequest(["owner", "operator"]);
  if (denied) return denied;

  const { data, error } = await supabaseAdmin.functions.invoke(
    "shopify-inventory-scope-diagnostic",
    { body: {} },
  );

  if (error) {
    const response = (error as { context?: Response }).context;
    if (response) {
      const payload = await response.clone().json().catch(() => null) as
        | { error?: string }
        | null;
      if (payload?.error) {
        return NextResponse.json({ success: false, error: payload.error }, { status: 502 });
      }
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 502 });
  }

  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
