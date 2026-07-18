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
          privacy_limited_percentage
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