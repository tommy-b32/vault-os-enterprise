import { createClient } from "npm:@supabase/supabase-js@2";

import {
  fetchShopifyOrderById,
  upsertShopifyOrder,
} from "../_shared/shopify/orders.ts";
import { emitCommandCentreRefreshEvent } from "../_shared/command-centre-refresh.ts";

const SUPPORTED_TOPICS = new Set([
  "orders/create",
  "orders/updated",
  "orders/cancelled",
  "refunds/create",
]);

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function cleanStoreDomain(domain: string): string {
  return domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(value), (character) =>
      character.charCodeAt(0)
    );
  } catch {
    return null;
  }
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }

  return difference === 0;
}

async function verifyShopifyHmac(
  rawBody: Uint8Array,
  providedHmac: string,
  secret: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const calculated = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, rawBody as Uint8Array<ArrayBuffer>),
  );
  const provided = decodeBase64(providedHmac);

  return provided !== null && constantTimeEqual(calculated, provided);
}

function getOrderId(payload: unknown, topic: string): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const value = topic === "refunds/create"
    ? record.order_id
    : record.admin_graphql_api_id ?? record.id;

  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return respond({ success: false, error: "Method not allowed" }, 405);
  }

  // Webhook HMAC uses its dedicated secret contract. For a Dev Dashboard app,
  // the configured value may be the app client secret, but it is never an API token.
  const webhookSecret = Deno.env.get("SHOPIFY_WEBHOOK_SECRET");
  const configuredDomain = Deno.env.get("SHOPIFY_STORE_DOMAIN");
  const providedHmac = request.headers.get("x-shopify-hmac-sha256");
  const topic = request.headers.get("x-shopify-topic");
  const webhookId = request.headers.get("x-shopify-webhook-id");
  const shopDomain = request.headers.get("x-shopify-shop-domain");
  const rawBody = new Uint8Array(await request.arrayBuffer());

  if (!webhookSecret || !configuredDomain) {
    console.error("[Vault Shopify Order Webhook] Shopify configuration missing");
    return respond({ success: false, error: "Webhook configuration unavailable" }, 500);
  }

  if (
    !providedHmac ||
    !(await verifyShopifyHmac(rawBody, providedHmac, webhookSecret))
  ) {
    return respond({ success: false, error: "Invalid webhook signature" }, 401);
  }

  if (!topic || !SUPPORTED_TOPICS.has(topic)) {
    return respond({ success: false, error: "Unsupported webhook topic" }, 400);
  }

  if (!webhookId || !shopDomain) {
    return respond({ success: false, error: "Required Shopify headers missing" }, 400);
  }

  if (cleanStoreDomain(shopDomain) !== cleanStoreDomain(configuredDomain)) {
    return respond({ success: false, error: "Unexpected Shopify store" }, 403);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return respond({ success: false, error: "Storage configuration unavailable" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    const { data: existing, error: existingError } = await supabase
      .from("vault_shopify_webhook_deliveries")
      .select("status")
      .eq("shopify_webhook_id", webhookId)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing?.status === "complete") {
      return respond({ success: true, duplicate: true });
    }

    const { error: deliveryError } = await supabase
      .from("vault_shopify_webhook_deliveries")
      .upsert(
        {
          shopify_webhook_id: webhookId,
          topic,
          shop_domain: cleanStoreDomain(shopDomain),
          status: "processing",
          error_message: null,
          processed_at: null,
        },
        { onConflict: "shopify_webhook_id" },
      );

    if (deliveryError) {
      throw deliveryError;
    }

    const payload = JSON.parse(new TextDecoder().decode(rawBody)) as unknown;
    const orderId = getOrderId(payload, topic);

    if (!orderId) {
      throw new Error("Webhook payload does not contain an order ID");
    }

    const order = await fetchShopifyOrderById(orderId);

    if (!order) {
      throw new Error("Shopify order was not found during webhook reconciliation");
    }

    const { data: previousOrder, error: previousOrderError } = await supabase
      .from("vault_shopify_orders")
      .select("fulfilment_status")
      .eq("source", "shopify")
      .eq("shopify_order_id", order.id)
      .maybeSingle();

    if (previousOrderError) {
      throw previousOrderError;
    }

    await upsertShopifyOrder(supabase, order);

    const { error: completionError } = await supabase
      .from("vault_shopify_webhook_deliveries")
      .update({
        status: "complete",
        processed_at: new Date().toISOString(),
      })
      .eq("shopify_webhook_id", webhookId);

    if (completionError) {
      throw completionError;
    }

    const refreshSignal = topic === "refunds/create"
      ? { domain: "refund" as const, eventType: "refund-sync-completed" }
      : topic === "orders/create"
        ? { domain: "trading" as const, eventType: "order-created-completed" }
        : { domain: "trading" as const, eventType: "order-updated-completed" };

    await emitCommandCentreRefreshEvent({
      supabase,
      ...refreshSignal,
      entityId: order.id,
      source: "shopify-order-webhook",
    });

    if (
      topic === "orders/updated" &&
      order.displayFulfillmentStatus.toUpperCase() === "FULFILLED" &&
      previousOrder?.fulfilment_status?.toUpperCase() !== "FULFILLED"
    ) {
      await emitCommandCentreRefreshEvent({
        supabase,
        domain: "fulfilment",
        eventType: "fulfilment-sync-completed",
        entityId: order.id,
        source: "shopify-order-webhook",
      });
    }

    return respond({ success: true });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Unexpected webhook processing error";

    console.error("[Vault Shopify Order Webhook]", message);

    await supabase
      .from("vault_shopify_webhook_deliveries")
      .upsert(
        {
          shopify_webhook_id: webhookId,
          topic,
          shop_domain: cleanStoreDomain(shopDomain),
          status: "error",
          error_message: message.slice(0, 500),
          processed_at: new Date().toISOString(),
        },
        { onConflict: "shopify_webhook_id" },
      );

    return respond({ success: false, error: message }, 500);
  }
});
