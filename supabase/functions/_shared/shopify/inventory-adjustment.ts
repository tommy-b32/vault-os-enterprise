import { shopifyGraphQL } from "./graphql.ts";

export type InventoryPostingChange = { inventoryItemId: string; variantId: string; locationId: string; quantity: number };

const SCOPE_QUERY = `query VaultInventoryPostingScopes { currentAppInstallation { accessScopes { handle } } }`;
const IDENTITY_QUERY = `query VaultInventoryPostingIdentity($itemIds: [ID!]!, $locationId: ID!) {
  items: nodes(ids: $itemIds) { ... on InventoryItem { id variant { id } } }
  location: node(id: $locationId) { ... on Location { id } }
}`;
const ADJUST_MUTATION = `mutation VaultPostReceivedInventory($input: InventoryAdjustQuantitiesInput!, $idempotencyKey: String!) {
  inventoryAdjustQuantities(input: $input) @idempotent(key: $idempotencyKey) {
    inventoryAdjustmentGroup { createdAt reason referenceDocumentUri changes { name delta } }
    userErrors { field message code }
  }
}`;

export async function assertInventoryWriteScope(): Promise<void> {
  const data = await shopifyGraphQL<{ currentAppInstallation: { accessScopes: Array<{ handle: string }> } }>(SCOPE_QUERY);
  if (!data.currentAppInstallation.accessScopes.some(({ handle }) => handle === "write_inventory")) {
    throw new Error("Shopify write_inventory access scope is not granted");
  }
}

export async function assertCurrentInventoryIdentities(changes: InventoryPostingChange[]): Promise<void> {
  const itemIds = [...new Set(changes.map((change) => change.inventoryItemId))];
  const locationIds = [...new Set(changes.map((change) => change.locationId))];
  if (locationIds.length !== 1) throw new Error("A posting must target one exact Shopify location");
  const data = await shopifyGraphQL<{
    items: Array<{ id: string; variant: { id: string } | null } | null>;
    location: { id: string } | null;
  }>(IDENTITY_QUERY, { itemIds, locationId: locationIds[0] });
  if (!data.location || data.location.id !== locationIds[0]) throw new Error("The persisted Shopify receiving location is unavailable");
  const variantsByItem = new Map(data.items
    .filter((item): item is { id: string; variant: { id: string } } => Boolean(item?.variant))
    .map((item) => [item.id, item.variant.id]));
  for (const change of changes) {
    if (variantsByItem.get(change.inventoryItemId) !== change.variantId) {
      throw new Error("Current Shopify inventory-item/variant identity does not match the receipt snapshot");
    }
  }
}

export async function adjustReceivedInventory(input: { postingId: string; idempotencyKey: string; changes: InventoryPostingChange[] }) {
  const data = await shopifyGraphQL<{
    inventoryAdjustQuantities: {
      inventoryAdjustmentGroup: null | { createdAt: string; reason: string; referenceDocumentUri: string | null; changes: Array<{ name: string; delta: number }> };
      userErrors: Array<{ field: string[] | null; message: string; code?: string }>;
    };
  }>(ADJUST_MUTATION, {
    idempotencyKey: input.idempotencyKey,
    input: { reason: "received", name: "available",
      referenceDocumentUri: `vault://purchase-order-inventory-posting/${input.postingId}`,
      changes: input.changes.map((change) => ({ delta: change.quantity, inventoryItemId: change.inventoryItemId, locationId: change.locationId })) },
  });
  return data.inventoryAdjustQuantities;
}
