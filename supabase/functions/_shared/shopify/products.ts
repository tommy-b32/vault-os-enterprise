import { shopifyGraphQL } from "./graphql.ts";

export type ShopifyVariantNode = {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  compareAtPrice: string | null;
  availableForSale: boolean;
  selectedOptions: Array<{
    name: string;
    value: string;
  }>;
  inventoryItem: {
    id: string;
  } | null;
};

export type ShopifyProductNode = {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  status: string;
  updatedAt: string;
  featuredImage: {
    url: string;
  } | null;
  variants: {
    nodes: ShopifyVariantNode[];
  };
};

type ProductPage = {
  products: {
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
    nodes: ShopifyProductNode[];
  };
};

const PRODUCT_QUERY = `
  query VaultProductSync($cursor: String) {
    products(
      first: 20
      after: $cursor
      sortKey: UPDATED_AT
      reverse: true
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }

      nodes {
        id
        title
        handle
        vendor
        productType
        status
        updatedAt

        featuredImage {
          url
        }

        variants(first: 100) {
          nodes {
            id
            title
            sku
            barcode
            price
            compareAtPrice
            availableForSale

            selectedOptions {
              name
              value
            }

            inventoryItem {
              id
            }
          }
        }
      }
    }
  }
`;

export async function fetchAllShopifyProducts(): Promise<
  ShopifyProductNode[]
> {
  const products: ShopifyProductNode[] = [];

  let cursor: string | null = null;
  let hasNextPage = true;
  let pagesFetched = 0;

  while (hasNextPage) {
    const data = await shopifyGraphQL<ProductPage>(
      PRODUCT_QUERY,
      { cursor },
    );

    const connection = data.products;

    products.push(...connection.nodes);

    hasNextPage =
      connection.pageInfo.hasNextPage === true;

    cursor =
      connection.pageInfo.endCursor ?? null;

    pagesFetched += 1;

    if (pagesFetched > 100) {
      throw new Error(
        "Product pagination exceeded safety limit",
      );
    }

    if (hasNextPage && !cursor) {
      throw new Error(
        "Shopify reported another product page without a cursor",
      );
    }
  }

  return products;
}