import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchMetaDailyInsights } from "../_shared/meta/insights.ts";

type FailureCode =
  | "configuration_missing"
  | "unauthorized"
  | "throttled"
  | "meta_api_error"
  | "invalid_response";

function getFailureCode(error: unknown): FailureCode {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes("META_ACCESS_TOKEN is unavailable") ||
    message.includes("META_AD_ACCOUNT_ID is unavailable")
  ) {
    return "configuration_missing";
  }

  if (
    message.includes("OAuthException") ||
    message.includes("Invalid OAuth") ||
    message.includes("access token")
  ) {
    return "unauthorized";
  }

  if (
    message.includes("rate limit") ||
    message.includes("User request limit reached") ||
    message.includes("Application request limit reached")
  ) {
    return "throttled";
  }

  if (message.includes("invalid")) {
    return "invalid_response";
  }

  return "meta_api_error";
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SERVICE_ROLE_KEY");
  const expectedSyncSecret = Deno.env.get("VAULT_ORDER_SYNC_SECRET");
  const providedSyncSecret = request.headers.get("x-vault-sync-secret");

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json(
      { ok: false, error: "Supabase service configuration is unavailable" },
      { status: 500 },
    );
  }

  if (!expectedSyncSecret || providedSyncSecret !== expectedSyncSecret) {
    return Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const attemptedAt = new Date().toISOString();

  try {
    const insights = await fetchMetaDailyInsights(30);
    const fetchedAt = new Date().toISOString();

    const rows = insights.days.map((day) => ({
      ad_account_id: insights.adAccountId,
      reporting_date: day.reportingDate,
      reporting_timezone: insights.reportingTimezone,
      currency: insights.currency,
      spend: day.spend,
      impressions: day.impressions,
      clicks: day.clicks,
      link_clicks: day.linkClicks,
      landing_page_views: day.landingPageViews,
      ctr: day.ctr,
      cpc: day.cpc,
      purchases: day.purchases,
      purchase_value: day.purchaseValue,
      add_to_carts: day.addToCarts,
      checkouts: day.checkouts,
      roas: day.roas,
      fetched_at: fetchedAt,
      availability: "live",
    }));

    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from("vault_meta_ads_daily")
        .upsert(rows, {
          onConflict: "ad_account_id,reporting_date",
        });

      if (upsertError) {
        throw new Error(`Meta daily upsert failed: ${upsertError.message}`);
      }
    }

    const { error: syncStateError } = await supabase
      .from("vault_meta_ads_sync_state")
      .upsert(
        {
          singleton: true,
          ad_account_id: insights.adAccountId,
          reporting_timezone: insights.reportingTimezone,
          currency: insights.currency,
          availability: "live",
          last_attempted_at: attemptedAt,
          last_successful_at: fetchedAt,
          failure_code: null,
        },
        {
          onConflict: "singleton",
        },
      );

    if (syncStateError) {
      throw new Error(
        `Meta sync state update failed: ${syncStateError.message}`,
      );
    }

    return Response.json({
      ok: true,
      adAccountId: insights.adAccountId,
      reportingTimezone: insights.reportingTimezone,
      currency: insights.currency,
      daysSynced: rows.length,
      fetchedAt,
    });
  } catch (error) {
    const failureCode = getFailureCode(error);

    await supabase
      .from("vault_meta_ads_sync_state")
      .upsert(
        {
          singleton: true,
          availability:
            failureCode === "configuration_missing"
              ? "pending_configuration"
              : "unavailable",
          last_attempted_at: attemptedAt,
          failure_code: failureCode,
        },
        {
          onConflict: "singleton",
        },
      );

    console.error("Meta Ads sync failed", error);

    return Response.json(
      {
        ok: false,
        failureCode,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
});
