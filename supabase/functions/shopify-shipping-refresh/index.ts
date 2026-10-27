import { createClient } from "npm:@supabase/supabase-js@2";
import { refreshShippingCosts, shippingValidationDiagnostic } from "../_shared/shopify/shipping-labels.ts";
import { recordShippingSyncOutcome, shippingSyncFailureCode } from "../_shared/shopify/shipping-sync-observability.ts";

const respond = (body: unknown, status = 200) => Response.json(body, { status });

Deno.serve(async (request) => {
  if (request.method !== "POST") return respond({ success: false, error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
  const syncSecret = Deno.env.get("VAULT_ORDER_SYNC_SECRET");
  if (!supabaseUrl || !serviceRoleKey || !syncSecret) {
    return respond({ success: false, error: "Shipping refresh configuration is unavailable", failure_code: "SHIPPING_CONFIGURATION_UNAVAILABLE" }, 500);
  }
  if (request.headers.get("X-Vault-Sync-Secret") !== syncSecret) return respond({ success: false, error: "Unauthorized" }, 401);
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const shipping = await refreshShippingCosts(supabase);
    if (shipping.recovery.failure) {
      const failure_code = shippingSyncFailureCode(shipping.recovery.failure);
      console.error("[Vault Shopify Shipping Refresh] Recovery failed", {
        failureCode: failure_code,
        diagnostic: shippingValidationDiagnostic(shipping.recovery.failure),
      });
      try { await recordShippingSyncOutcome(supabase, { status: "unavailable", failureCode: failure_code }); }
      catch { console.error("[Vault Shopify Shipping Refresh] Telemetry recording failed"); }
      return respond({ success: false, error: "Shipping recovery unavailable; normal refresh completed", failure_code }, 502);
    }
    try { await recordShippingSyncOutcome(supabase, { status: "success", failureCode: null }); }
    catch { console.error("[Vault Shopify Shipping Refresh] Telemetry recording failed"); }
    return respond({ success: true, shipping });
  } catch (error) {
    const failure_code = shippingSyncFailureCode(error);
    console.error("[Vault Shopify Shipping Refresh] Failed", { failureCode: failure_code });
    try { await recordShippingSyncOutcome(supabase, { status: "unavailable", failureCode: failure_code }); }
    catch { console.error("[Vault Shopify Shipping Refresh] Telemetry recording failed"); }
    return respond({ success: false, error: "Shipping refresh unavailable; retry the same bounded window", failure_code }, 502);
  }
});
