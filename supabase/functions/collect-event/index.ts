import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CollectorPayload = {
  event_name?: string;
  event_source?: string;
  analytics_allowed?: boolean;

  session_id?: string;
  privacy_visit_id?: string;
  shopify_event_id?: string;
  occurred_at?: string;
  shopify_checkout_token?: string | null;

  page_path?: string;
  page_type?: string;

  product_id?: string;
  product_handle?: string;
  product_title?: string;
  variant_id?: string;
  variant_title?: string;
  selected_colour?: string;
  selected_size?: string;

  qualifies_for_bundle?: boolean;

  customer_item_count?: number;
  qualifying_item_count?: number;
  qualifying_pair_count?: number;
  secured_saving?: number;

  vaultcare_active?: boolean;

  operator_intent?: string;
  operator_mission?: string;
  operator_message_id?: string;
  confidence_score?: number;

  metadata?: Record<string, unknown>;
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function safeInteger(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return 0;

  return Math.max(0, Math.floor(parsed));
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TRACKED_EVENT_NAMES = new Set([
  "PAGE_VIEW",
  "PRODUCT_ADDED_TO_CART",
  "CHECKOUT_STARTED",
  "CHECKOUT_COMPLETED",
]);

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Method not allowed",
      },
      405,
    );
  }

  try {
    const payload =
      (await request.json()) as CollectorPayload;

    const eventName =
      String(payload.event_name || "").trim();

    if (!eventName || eventName.length > 100) {
      return jsonResponse(
        {
          success: false,
          error: "A valid event_name is required",
        },
        400,
      );
    }

    const analyticsAllowed =
      payload.analytics_allowed === true;
    const shopifyEventId = String(
      payload.shopify_event_id || payload.metadata?.shopify_event_id || "",
    ).trim();

    if (!shopifyEventId || shopifyEventId.length > 150) {
      return jsonResponse(
        { success: false, error: "A valid shopify_event_id is required" },
        400,
      );
    }

    if (!TRACKED_EVENT_NAMES.has(eventName)) {
      return jsonResponse(
        { success: false, error: "Unsupported event_name" },
        400,
      );
    }

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL");

    const serviceRoleKey =
      Deno.env.get(
        "SERVICE_ROLE_KEY",
      );

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        "Required Supabase environment variables are unavailable",
      );
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

    const [trackedDuplicate, privacyDuplicate] = await Promise.all([
      supabase
        .from("vault_events")
        .select("id")
        .eq("shopify_event_id", shopifyEventId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("vault_traffic_counts")
        .select("id")
        .eq("shopify_event_id", shopifyEventId)
        .limit(1)
        .maybeSingle(),
    ]);

    if (trackedDuplicate.error || privacyDuplicate.error) {
      throw trackedDuplicate.error || privacyDuplicate.error;
    }

    if (trackedDuplicate.data || privacyDuplicate.data) {
      return jsonResponse({ success: true, mode: "duplicate_ignored" });
    }

    /*
     * Privacy-limited traffic:
     * no persistent visitor or session identifier.
     */
    if (!analyticsAllowed) {
      if (eventName !== "PAGE_VIEW") {
        return jsonResponse(
          { success: false, error: "Privacy-limited collection accepts PAGE_VIEW only" },
          400,
        );
      }

      const privacyVisitId = String(payload.privacy_visit_id || "").trim();

      if (!UUID_PATTERN.test(privacyVisitId)) {
        return jsonResponse(
          { success: false, error: "A valid ephemeral privacy_visit_id is required" },
          400,
        );
      }

      const now = new Date();

      now.setSeconds(0, 0);

      const { error } = await supabase
        .from("vault_traffic_counts")
        .insert({
          minute_bucket: now.toISOString(),
          page_path:
            payload.page_path || null,
          page_type:
            payload.page_type || null,
          total_views: 1,
          analytics_allowed: false,
          privacy_visit_id: privacyVisitId,
          shopify_event_id: shopifyEventId,
          metadata: {
            event_name: eventName,
            ...(payload.metadata || {}),
          },
        });

      if (error?.code === "23505") {
        return jsonResponse({ success: true, mode: "duplicate_ignored" });
      }

      if (error) {
        throw error;
      }

      return jsonResponse({
        success: true,
        mode: "privacy_limited",
      });
    }

    const sessionId =
      String(payload.session_id || "").trim();

    if (!sessionId) {
      return jsonResponse(
        {
          success: false,
          error:
            "session_id is required when analytics are allowed",
        },
        400,
      );
    }

    const occurredAt = String(
      payload.occurred_at || payload.metadata?.occurred_at || "",
    ).trim();
    const occurredAtTimestamp = Date.parse(occurredAt);

    if (!occurredAt || !Number.isFinite(occurredAtTimestamp)) {
      return jsonResponse(
        { success: false, error: "A valid occurred_at timestamp is required" },
        400,
      );
    }

    const checkoutToken = String(payload.shopify_checkout_token || "").trim();

    if (checkoutToken.length > 255) {
      return jsonResponse(
        { success: false, error: "shopify_checkout_token is too long" },
        400,
      );
    }

    const { error } = await supabase
      .from("vault_events")
      .insert({
        session_id: sessionId,
        shopify_event_id: shopifyEventId,
        occurred_at: new Date(occurredAtTimestamp).toISOString(),
        shopify_checkout_token: checkoutToken || null,
        event_name: eventName,
        event_source:
          payload.event_source ||
          "storefront",

        page_path:
          payload.page_path || null,
        page_type:
          payload.page_type || null,

        product_id:
          payload.product_id || null,
        product_handle:
          payload.product_handle || null,
        product_title:
          payload.product_title || null,
        variant_id:
          payload.variant_id || null,
        variant_title:
          payload.variant_title || null,
        selected_colour:
          payload.selected_colour || null,
        selected_size:
          payload.selected_size || null,

        qualifies_for_bundle:
          payload.qualifies_for_bundle ===
          true,

        customer_item_count:
          safeInteger(
            payload.customer_item_count,
          ),

        qualifying_item_count:
          safeInteger(
            payload.qualifying_item_count,
          ),

        qualifying_pair_count:
          safeInteger(
            payload.qualifying_pair_count,
          ),

        secured_saving:
          Math.max(
            0,
            Number(
              payload.secured_saving,
            ) || 0,
          ),

        vaultcare_active:
          payload.vaultcare_active === true,

        operator_intent:
          payload.operator_intent || null,
        operator_mission:
          payload.operator_mission || null,
        operator_message_id:
          payload.operator_message_id ||
          null,

        confidence_score:
          payload.confidence_score ??
          null,

        analytics_allowed: true,
        metadata:
          payload.metadata || {},
      });

    if (error?.code === "23505") {
      return jsonResponse({ success: true, mode: "duplicate_ignored" });
    }

    if (error) {
      throw error;
    }

    return jsonResponse({
      success: true,
      mode: "journey",
    });
  } catch (error) {
    console.error(
      "[Vault Collector]",
      error,
    );

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected collector error",
      },
      500,
    );
  }
});
