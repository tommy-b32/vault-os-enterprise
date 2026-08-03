import { createClient } from "npm:@supabase/supabase-js@2";

import { fetchShopifyPaymentsSnapshot } from "../_shared/shopify/payments.ts";

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return respond({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
    const syncSecret = Deno.env.get("VAULT_FINANCE_SYNC_SECRET");

    if (!supabaseUrl || !serviceRoleKey || !syncSecret) {
      throw new Error("Required Supabase environment variables are unavailable");
    }

    if (request.headers.get("X-Vault-Finance-Sync-Secret") !== syncSecret) {
      return respond({ success: false, error: "Unauthorized" }, 401);
    }

    const snapshot = await fetchShopifyPaymentsSnapshot();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await supabase
      .from("vault_shopify_payments_snapshots")
      .insert({
        activated: snapshot.activated,
        default_currency: snapshot.defaultCurrency,
        balances: snapshot.balances,
        today_payout: snapshot.todayPayout,
        next_scheduled_payout: snapshot.nextScheduledPayout,
        latest_successful_payout: snapshot.latestSuccessfulPayout,
        synced_at: snapshot.synchronizedAt,
      });

    if (error) throw error;

    return respond({ success: true, snapshot });
  } catch (error) {
    return respond(
      {
        success: false,
        error: error instanceof Error
          ? error.message
          : "Shopify Payments synchronization failed",
      },
      500,
    );
  }
});
