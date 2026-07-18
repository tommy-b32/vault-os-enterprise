import { shopifyGraphQL } from "./graphql.ts";

export type ShopifyInventoryQuantity = {
  name: string;
  quantity: number;
};

export type ShopifyInventoryLevelNode = {
  location: {
    id: string;
    name: string;
  };
  quantities: ShopifyInventoryQuantity[];
};

export type ShopifyInventoryItemNode = {
  id: string;
  inventoryLevels: {
    nodes: ShopifyInventoryLevelNode[];
  };
};

type InventoryNodesResponse = {
  nodes: Array<ShopifyInventoryItemNode | null>;
};

const INVENTORY_QUERY = `
  query VaultInventorySync($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on InventoryItem {
        id

        inventoryLevels(first: 10) {
          nodes {
            location {
              id
              name
            }

            quantities(
              names: [
                "available"
                "committed"
                "incoming"
                "on_hand"
              ]
            ) {
              name
              quantity
            }
          }
        }
      }
    }
  }
`;

export async function fetchShopifyInventoryItems(
  inventoryItemIds: string[],
): Promise<ShopifyInventoryItemNode[]> {
  if (inventoryItemIds.length === 0) {
    return [];
  }

  const data =
    await shopifyGraphQL<InventoryNodesResponse>(
      INVENTORY_QUERY,
      {
        ids: inventoryItemIds,
      },
    );

  return data.nodes.filter(
    (
      item,
    ): item is ShopifyInventoryItemNode =>
      item !== null &&
      typeof item.id === "string",
  );
}