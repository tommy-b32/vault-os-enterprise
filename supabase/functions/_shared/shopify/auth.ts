const SHOPIFY_API_VERSION = "2026-07";
const DEFAULT_TOKEN_TTL_MS = 5 * 60 * 1000;
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

type ShopifyAuth = {
  storeDomain: string;
  accessToken: string;
  apiVersion: string;
};

type CachedShopifyAuth = ShopifyAuth & {
  expiresAt: number;
};

type ShopifyAccessTokenOptions = {
  forceRefresh?: boolean;
};

let cachedAuth: CachedShopifyAuth | null = null;
let refreshPromise: Promise<CachedShopifyAuth> | null = null;

function cleanStoreDomain(domain: string): string {
  return domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

function getShopifyCredentials() {
  const storeDomain = Deno.env.get("SHOPIFY_STORE_DOMAIN");
  const clientId = Deno.env.get("SHOPIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SHOPIFY_CLIENT_SECRET");

  if (!storeDomain) {
    throw new Error("SHOPIFY_STORE_DOMAIN missing");
  }

  if (!clientId) {
    throw new Error("SHOPIFY_CLIENT_ID missing");
  }

  if (!clientSecret) {
    throw new Error("SHOPIFY_CLIENT_SECRET missing");
  }

  return {
    storeDomain: cleanStoreDomain(storeDomain),
    clientId,
    clientSecret,
  };
}

async function requestShopifyAccessToken(): Promise<CachedShopifyAuth> {
  const credentials = getShopifyCredentials();
  const response = await fetch(
    `https://${credentials.storeDomain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Shopify client-credentials token exchange failed with status ${response.status}`,
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new Error("Shopify token exchange returned invalid JSON");
  }

  if (typeof payload !== "object" || payload === null) {
    throw new Error("Shopify token exchange returned an invalid response");
  }

  const tokenResponse = payload as Record<string, unknown>;
  const accessToken = tokenResponse.access_token;
  const expiresIn = tokenResponse.expires_in;

  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw new Error("Shopify token exchange returned no access token");
  }

  if (
    expiresIn !== undefined &&
    (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0)
  ) {
    throw new Error("Shopify token exchange returned an invalid expires_in value");
  }

  const tokenTtlMs = typeof expiresIn === "number"
    ? expiresIn * 1000
    : DEFAULT_TOKEN_TTL_MS;

  return {
    storeDomain: credentials.storeDomain,
    accessToken,
    apiVersion: SHOPIFY_API_VERSION,
    expiresAt: Date.now() + tokenTtlMs,
  };
}

export async function getShopifyAccessToken(
  options: ShopifyAccessTokenOptions = {},
): Promise<ShopifyAuth> {
  if (
    !options.forceRefresh &&
    cachedAuth &&
    Date.now() < cachedAuth.expiresAt - TOKEN_REFRESH_BUFFER_MS
  ) {
    return cachedAuth;
  }

  if (options.forceRefresh || !refreshPromise) {
    refreshPromise = requestShopifyAccessToken()
      .then((auth) => {
        cachedAuth = auth;
        return auth;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return await refreshPromise;
}
