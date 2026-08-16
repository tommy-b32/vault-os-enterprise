import { getInventoryScopeDiagnostic } from "../_shared/shopify/inventory-scope-diagnostic.ts";

const respond = (body: unknown, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { "Content-Type": "application/json" } },
);

function getLegacyJwtRole(apiKey: string): string | null {
  const payload = apiKey.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/")
      .padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims = JSON.parse(atob(base64)) as { role?: unknown };
    return typeof claims.role === "string" ? claims.role : null;
  } catch {
    return null;
  }
}

function isVaultServerInvocation(request: Request): boolean {
  const apiKey = request.headers.get("apikey");
  const authorization = request.headers.get("Authorization");
  if (!apiKey) return false;

  // Supabase's gateway authenticates the key before this verify_jwt=true
  // function executes. New sb_secret keys are intentionally sent only as an
  // apikey, never as a bearer token. Legacy service-role JWTs use both headers.
  if (apiKey.startsWith("sb_secret_")) return true;
  return authorization === `Bearer ${apiKey}` &&
    getLegacyJwtRole(apiKey) === "service_role";
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return respond({ success: false, error: "Method not allowed" }, 405);
  }

  if (!isVaultServerInvocation(request)) {
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
