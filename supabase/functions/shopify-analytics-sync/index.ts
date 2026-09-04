import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchShopifyAnalytics } from "../_shared/shopify/analytics.ts";

const respond = (body: unknown, status = 200) => Response.json(body, { status });

Deno.serve(async (request) => {
  if (request.method !== "POST") return respond({ success: false, error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
  const syncSecret = Deno.env.get("VAULT_ORDER_SYNC_SECRET");
  if (!supabaseUrl || !serviceRoleKey || !syncSecret) return respond({ success: false, error: "Required configuration is unavailable" }, 500);
  if (request.headers.get("X-Vault-Sync-Secret") !== syncSecret) return respond({ success: false, error: "Unauthorized" }, 401);
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const fetchedAt = new Date().toISOString();
  try {
    const result = await fetchShopifyAnalytics();
    if (result.days.length) {
      const rows = result.days.map((day) => ({
        shop_id: result.shopId, reporting_date: day.reportingDate, reporting_timezone: result.reportingTimezone,
        sessions: day.sessions, online_store_visitors: day.visitors, sessions_with_cart_additions: day.cartAdditions,
        sessions_that_reached_checkout: day.reachedCheckout, sessions_that_completed_checkout: day.completedCheckout,
        conversion_rate: day.conversionRate, fetched_at: fetchedAt, availability: "live",
      }));
      const { error } = await supabase.from("vault_shopify_analytics_daily").upsert(rows, { onConflict: "shop_id,reporting_date" });
      if (error) throw error;
    }
    const { error: stateError } = await supabase.from("vault_shopify_analytics_sync_state").upsert({
      singleton: true, shop_id: result.shopId, reporting_timezone: result.reportingTimezone,
      availability: result.availability, last_attempted_at: fetchedAt,
      last_successful_at: result.availability === "live" ? fetchedAt : null, failure_code: null,
    });
    if (stateError) throw stateError;
    await supabase.from("vault_shopify_analytics_daily").delete().lt("reporting_date", new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10));
    return respond({ success: true, availability: result.availability, aggregate_days: result.days.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shopify Analytics synchronization failed";
    const failureCode = /access|permission|denied/i.test(message) ? "protected_data_denied" : /429|thrott/i.test(message) ? "throttled" : "shopifyql_error";
    await supabase.from("vault_shopify_analytics_sync_state").upsert({ singleton: true, availability: "unavailable", last_attempted_at: fetchedAt, failure_code: failureCode });
    return respond({ success: false, error: "Shopify Analytics is unavailable", failure_code: failureCode }, failureCode === "throttled" ? 429 : 502);
  }
});
