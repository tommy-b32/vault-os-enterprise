import { getInventoryScopeDiagnostic } from "../_shared/shopify/inventory-scope-diagnostic.ts";

const respond = (body: unknown, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { "Content-Type": "application/json" } },
);

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return respond({ success: false, error: "Method not allowed" }, 405);
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SERVICE_ROLE_KEY");
  if (!serviceKey) {
    return respond({ success: false, error: "Supabase service configuration unavailable" }, 500);
  }
  if (request.headers.get("Authorization") !== `Bearer ${serviceKey}`) {
    return respond({ success: false, error: "Shopify permission diagnostics require the authenticated Vault server endpoint" }, 403);
  }

  try {
    return respond(await getInventoryScopeDiagnostic());
  } catch (error) {
    return respond({
      success: false,
      error: error instanceof Error
        ? error.message
        : "Shopify inventory permissions could not be checked",
    }, 502);
  }
});
