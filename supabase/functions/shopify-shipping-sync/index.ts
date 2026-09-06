import { createClient } from "npm:@supabase/supabase-js@2";
import { parseShippingRequest, syncShippingBatch } from "../_shared/shopify/shipping-labels.ts";

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const secret = Deno.env.get("VAULT_ORDER_SYNC_SECRET");
  if (!secret || request.headers.get("X-Vault-Sync-Secret") !== secret) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let input;
  try { input = parseShippingRequest(await request.json()); }
  catch { return Response.json({ error: "Invalid bounded shipping request" }, { status: 400 }); }
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Missing configuration");
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    return Response.json({ success: true, accounting_status: "unreconciled", ...await syncShippingBatch(supabase, input) });
  } catch {
    return Response.json({ success: false, error: "Shipping sync unavailable; retry the same bounded request" }, { status: 502 });
  }
});
