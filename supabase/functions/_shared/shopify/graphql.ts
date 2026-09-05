import { getShopifyAccessToken } from "./auth.ts";
import { boundedShopifyRead } from "./bounded-read.ts";

export async function shopifyGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {},
  historicalDeadline?: number,
): Promise<T> {
  const auth = await getShopifyAccessToken();

  if (historicalDeadline !== undefined) {
    if (!/^\s*query\b/.test(query)) throw new Error("Bounded Shopify transport accepts queries only");
    return boundedShopifyRead<T>((signal) => fetch(
      `https://${auth.storeDomain}/admin/api/${auth.apiVersion}/graphql.json`,
      {
        method: "POST", signal,
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": auth.accessToken },
        body: JSON.stringify({ query, variables }),
      },
    ), historicalDeadline);
  }

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
