import { getShopifyAccessToken } from "./auth.ts";

export async function shopifyGraphQL(
  query: string,
  variables: Record<string, unknown> = {},
) {
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
    console.error(json);

    throw new Error(
      "Shopify GraphQL request failed",
    );
  }

  if (json.errors) {
    console.error(json.errors);

    throw new Error(
      json.errors
        .map((e: { message: string }) => e.message)
        .join(", "),
    );
  }

  return json.data;
}