import { createClient } from "npm:@supabase/supabase-js@2";
import { parseExactPaymentFeeOrderIds, refreshUnresolvedPaymentFees, syncExactPaymentFeeOrders } from "../_shared/shopify/payment-fees.ts";

const respond = (body: unknown, status = 200) => Response.json(body, { status });

Deno.serve(async (request) => {
  if (request.method !== "POST") return respond({ success: false, error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
  const syncSecret = Deno.env.get("VAULT_ORDER_SYNC_SECRET");
  if (!supabaseUrl || !serviceRoleKey || !syncSecret) return respond({ success: false, error: "Required configuration is unavailable" }, 500);
  if (request.headers.get("X-Vault-Sync-Secret") !== syncSecret) return respond({ success: false, error: "Unauthorized" }, 401);
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await request.json().catch(() => ({}));
    if (!body || typeof body !== "object" || Array.isArray(body)) return respond({ success: false, error: "Invalid payment-fee recovery request" }, 400);
    const fields = Object.keys(body as Record<string, unknown>);
    if (fields.length === 0) return respond({ success: true, payment_fees: await refreshUnresolvedPaymentFees(supabase) });
    if (fields.length !== 1 || fields[0] !== "shopifyOrderIds") return respond({ success: false, error: "Invalid payment-fee recovery request" }, 400);
    const shopifyOrderIds = parseExactPaymentFeeOrderIds((body as Record<string, unknown>).shopifyOrderIds);
    return respond({ success: true, mode: "exact_orders", payment_fees: await syncExactPaymentFeeOrders(supabase, shopifyOrderIds) });
  } catch (error) {
    return respond({ success: false, error: error instanceof Error ? error.message : "Shopify payment-fee retry failed" }, 502);
  }
});
