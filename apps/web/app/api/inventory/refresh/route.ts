import { NextResponse } from "next/server";

import { authorizeApiRequest } from "@/lib/auth/api";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST() {
  const denied = await authorizeApiRequest(["owner", "operator"]);
  if (denied) return denied;

  const { data, error } = await supabaseAdmin.functions.invoke(
    "shopify-inventory-sync",
    { body: {} },
  );

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 502 },
    );
  }

  return NextResponse.json(data);
}
