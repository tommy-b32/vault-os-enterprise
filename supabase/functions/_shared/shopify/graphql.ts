import { getShopifyAccessToken } from "./auth.ts";

export async function shopifyGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const auth = await getShopifyAccessToken();

  const response = await fetch(
    `https://${auth.storeDomain}/admin/api/${auth.apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token":
          auth.accessToken,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    },
  );

  const json = await response.json();

  if (!response.ok) {
    console.error(
      "[Vault Shopify GraphQL HTTP]",
      json,
    );

    throw new Error(
      `Shopify GraphQL request failed with status ${response.status}`,
    );
  }

  if (json.errors) {
    console.error(
      "[Vault Shopify GraphQL]",
      json.errors,
    );

    throw new Error(
      json.errors
        .map(
          (error: { message?: string }) =>
            error.message || "GraphQL error",
        )
        .join("; "),
    );
  }

  if (!json.data) {
    throw new Error(
      "Shopify GraphQL returned no data",
    );
  }

  return json.data as T;
}