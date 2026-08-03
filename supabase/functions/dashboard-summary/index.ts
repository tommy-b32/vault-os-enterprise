import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "GET") {
    return respond(
      { success: false, error: "Method not allowed" },
      405,
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Required environment variables are unavailable");
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const today = new Date().toISOString().slice(0, 10);

    const { data: traffic, error: trafficError } = await supabase
      .from("vault_traffic_daily")
      .select(
        `
          traffic_date,
          total_page_views,
          tracked_page_views,
          privacy_limited_page_views,
          tracked_sessions,
          tracked_view_percentage,
          privacy_limited_percentage,
          tracked_visitors,
          estimated_privacy_visitors,
          estimated_total_visitors,
          tracked_visitor_percentage,
          estimated_privacy_visitor_percentage,
          live_tracked_visitors,
          latest_activity_at
        `,
      )
      .eq("traffic_date", today)
      .maybeSingle();

    if (trafficError) {
      throw trafficError;
    }

    const { data: pageTypes, error: pageTypesError } = await supabase
      .from("vault_traffic_by_page_type")
      .select(
        `
          page_type,
          total_page_views,
          tracked_page_views,
          privacy_limited_page_views
        `,
      )
      .eq("traffic_date", today)
      .order("total_page_views", { ascending: false });

    if (pageTypesError) {
      throw pageTypesError;
    }

    return respond({
      success: true,
      generated_at: new Date().toISOString(),
      traffic: traffic ?? {
        traffic_date: today,
        total_page_views: 0,
        tracked_page_views: 0,
        privacy_limited_page_views: 0,
        tracked_sessions: 0,
        tracked_view_percentage: 0,
        privacy_limited_percentage: 0,
      },
      visitors: traffic
        ? {
          tracked: traffic.tracked_visitors,
          estimated_privacy: traffic.estimated_privacy_visitors,
          estimated_total: traffic.estimated_total_visitors,
          live_tracked: traffic.live_tracked_visitors,
          tracked_percentage: traffic.tracked_visitor_percentage,
          estimated_privacy_percentage:
            traffic.estimated_privacy_visitor_percentage,
          latest_activity_at: traffic.latest_activity_at,
        }
        : {
          tracked: 0,
          estimated_privacy: null,
          estimated_total: null,
          live_tracked: null,
          tracked_percentage: null,
          estimated_privacy_percentage: null,
          latest_activity_at: null,
        },
      page_types: pageTypes ?? [],
    });
  } catch (error) {
    console.error("[Vault Dashboard Summary]", error);

    return respond(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected dashboard error",
      },
      500,
    );
  }
});
