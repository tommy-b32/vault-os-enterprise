import { shopifyGraphQL } from "../_shared/shopify/graphql.ts";

const ORDER_IDS = [
  "gid://shopify/Order/13481833791866",
  "gid://shopify/Order/13515260985722",
] as const;
const RELEVANT_SCOPES = new Set([
  "read_orders", "read_reports", "read_shipping", "read_assigned_fulfillment_orders",
  "read_merchant_managed_fulfillment_orders", "read_third_party_fulfillment_orders",
  "read_marketplace_fulfillment_orders",
]);

type ShippingLabel = {
  id: string; printed: boolean; cancellable: boolean; location: { id: string } | null;
  trackingInfo: { company: string | null } | null;
  shippingDocuments: Array<{ documentType: string; format: string | null; printedAt: string | null; shippingLabelId: string }>;
};
type Fulfillment = {
  id: string; status: string; createdAt: string; updatedAt: string; location: { id: string } | null;
  trackingInfo: Array<{ company: string | null }>; shippingLabel: ShippingLabel | null;
};
type Order = { id: string; displayFulfillmentStatus: string; createdAt: string; updatedAt: string; fulfillments: Fulfillment[] } | null;

function same(left: string, right: string) {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0; for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

function cleanError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 300) : "Shopify query unavailable";
}

async function branch<T>(probe: () => Promise<T>) {
  try { return { status: "available" as const, data: await probe() }; }
  catch (error) { return { status: "unavailable" as const, error: cleanError(error) }; }
}

function structuralFulfillment(fulfillment: Fulfillment) {
  const label = fulfillment.shippingLabel;
  return {
    id: fulfillment.id, status: fulfillment.status, createdAt: fulfillment.createdAt, updatedAt: fulfillment.updatedAt,
    locationId: fulfillment.location?.id ?? null,
    tracking: { present: fulfillment.trackingInfo.length > 0, carrierCount: new Set(fulfillment.trackingInfo.map(({ company }) => company).filter(Boolean)).size },
    shippingLabel: label && {
      id: label.id, printed: label.printed, cancellable: label.cancellable, locationId: label.location?.id ?? null,
      trackingPresent: label.trackingInfo !== null,
      shippingDocuments: label.shippingDocuments.map((document) => ({ documentType: document.documentType, format: document.format, printedAt: document.printedAt, shippingLabelId: document.shippingLabelId })),
    },
  };
}

const BASE_QUERY = `query VaultShippingLabelDiagnosticBase($ids: [ID!]!) {
  nodes(ids: $ids) { ... on Order {
    id displayFulfillmentStatus createdAt updatedAt
    fulfillments(first: 250) {
      id status createdAt updatedAt location { id }
      trackingInfo(first: 10) { company }
      shippingLabel { id printed cancellable location { id } trackingInfo { company }
        shippingDocuments { documentType format printedAt shippingLabelId } }
    }
  } }
}`;

const FULFILLMENT_ORDER_QUERY = `query VaultShippingLabelDiagnosticFulfillmentOrders($ids: [ID!]!) {
  nodes(ids: $ids) { ... on Order { id
    fulfillmentOrders(first: 250) { nodes {
      id status requestStatus assignedLocation { location { id } }
      fulfillments(first: 250) { nodes {
        id status createdAt updatedAt location { id } trackingInfo(first: 10) { company }
        shippingLabel { id printed cancellable location { id } trackingInfo { company }
          shippingDocuments { documentType format printedAt shippingLabelId } }
      } }
    } }
  } }
}`;

const LABEL_QUERY = `query VaultShippingLabelDiagnosticLabels($ids: [ID!]!) {
  nodes(ids: $ids) { ... on ShippingLabel {
    id printed cancellable location { id } trackingInfo { company }
    shippingDocuments { documentType format printedAt shippingLabelId }
  } }
}`;

function diagnosticQuery() {
  const ids = ORDER_IDS.map((id) => id.split("/").at(-1)).join(",");
  return `FROM shipping_labels SHOW shipping_label_costs, shipping_labels GROUP BY order_id, shipping_label_currency WHERE order_id IN (${ids}) SINCE -31d UNTIL today LIMIT 5`;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const secret = Deno.env.get("VAULT_ORDER_SYNC_SECRET");
  if (!secret || !same(request.headers.get("x-vault-sync-secret") ?? "", secret)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.text()).trim();
  if (body && body !== "{}") return Response.json({ error: "This diagnostic accepts no order input" }, { status: 400 });

  const base = await branch(() => shopifyGraphQL<{ nodes: Order[] }>(BASE_QUERY, { ids: ORDER_IDS }));
  const fulfillmentOrders = await branch(() => shopifyGraphQL<{ nodes: Array<{ id: string; fulfillmentOrders: { nodes: Array<{ id: string; status: string; requestStatus: string; assignedLocation: { location: { id: string } | null } | null; fulfillments: { nodes: Fulfillment[] } }> } } | null> }>(FULFILLMENT_ORDER_QUERY, { ids: ORDER_IDS }));
  const labelIds = base.status === "available" ? base.data.nodes.flatMap((order) => order?.fulfillments.flatMap((fulfillment) => fulfillment.shippingLabel ? [fulfillment.shippingLabel.id] : []) ?? []) : [];
  const labels = labelIds.length ? await branch(() => shopifyGraphQL<{ nodes: Array<ShippingLabel | null> }>(LABEL_QUERY, { ids: labelIds })) : { status: "not_attempted" as const, reason: "No ShippingLabel IDs were discoverable from Order.fulfillments" };
  const shopifyql = await branch(() => shopifyGraphQL<{ shopifyqlQuery: { parseErrors: string[]; tableData: { columns: Array<{ name: string }>; rows: unknown[] } | null } | null }>(`query VaultShippingLabelDiagnosticShopifyql($query: String!) { shopifyqlQuery(query: $query) { parseErrors tableData { columns { name } rows } } }`, { query: diagnosticQuery() }));
  const scopes = await branch(() => shopifyGraphQL<{ currentAppInstallation: { accessScopes: Array<{ handle: string }> } }>(`query VaultShippingLabelDiagnosticScopes { currentAppInstallation { accessScopes { handle } } }`));

  return Response.json({
    allowlistedOrderIds: ORDER_IDS,
    base: base.status === "available" ? { status: base.status, orders: base.data.nodes.map((order) => order && ({ id: order.id, fulfillmentStatus: order.displayFulfillmentStatus, createdAt: order.createdAt, updatedAt: order.updatedAt, fulfillments: order.fulfillments.map(structuralFulfillment) })) } : base,
    fulfillmentOrders: fulfillmentOrders.status === "available" ? { status: fulfillmentOrders.status, orders: fulfillmentOrders.data.nodes.map((order) => order && ({ id: order.id, fulfillmentOrders: order.fulfillmentOrders.nodes.map((fulfillmentOrder) => ({ id: fulfillmentOrder.id, status: fulfillmentOrder.status, requestStatus: fulfillmentOrder.requestStatus, locationId: fulfillmentOrder.assignedLocation?.location?.id ?? null, fulfillments: fulfillmentOrder.fulfillments.nodes.map(structuralFulfillment) })) })) } : fulfillmentOrders,
    labels: labels.status === "available" ? { status: labels.status, labels: labels.data.nodes.filter((label): label is ShippingLabel => label !== null).map((label) => ({ id: label.id, printed: label.printed, cancellable: label.cancellable, locationId: label.location?.id ?? null, trackingPresent: label.trackingInfo !== null, shippingDocuments: label.shippingDocuments.map(({ documentType, format, printedAt, shippingLabelId }) => ({ documentType, format, printedAt, shippingLabelId })) })) } : labels,
    shopifyql,
    scopes: scopes.status === "available" ? { status: scopes.status, relevantGrantedScopes: scopes.data.currentAppInstallation.accessScopes.map(({ handle }) => handle).filter((handle) => RELEVANT_SCOPES.has(handle)).sort() } : scopes,
  });
});
