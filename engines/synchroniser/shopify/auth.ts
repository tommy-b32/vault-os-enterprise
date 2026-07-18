const SHOPIFY_API_VERSION = "2026-07";

function cleanStoreDomain(domain: string): string {
  return domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

export async function getShopifyAccessToken() {
  const clientId = Deno.env.get("SHOPIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SHOPIFY_CLIENT_SECRET");
  const storeDomain = Deno.env.get("SHOPIFY_STORE_DOMAIN");

  if (!clientId) {
    throw new Error("SHOPIFY_CLIENT_ID missing");
  }

  if (!clientSecret) {
    throw new Error("SHOPIFY_CLIENT_SECRET missing");
  }

  if (!storeDomain) {
    throw new Error("SHOPIFY_STORE_DOMAIN missing");
  }

  const domain = cleanStoreDomain(storeDomain);

  const response = await fetch(
    `https://${domain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    },
  );

  const json = await response.json();

  if (!response.ok) {
    console.error(json);
    throw new Error("Unable to authenticate with Shopify");
  }

  return {
    storeDomain: domain,
    accessToken: json.access_token,
    apiVersion: SHOPIFY_API_VERSION,
  };
}