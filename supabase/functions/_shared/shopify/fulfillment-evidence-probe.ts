import { shopifyGraphQL } from "./graphql.ts";

export const FULFILLMENT_EVIDENCE_PROBE_VERSION = "fulfillment_evidence_probe_v1";
const PAGE_SIZE = 50;
const MAX_ORDERS = 5;
const MAX_PAGES = 50;
const ORDER_GID = /^gid:\/\/shopify\/Order\/[1-9][0-9]*$/;

type GraphQL = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;
type PageInfo = { hasNextPage: boolean; endCursor: string | null };
type RawLine = { id: string; createdAt: string; quantity: number; lineItem: { id: string; variant: { id: string; inventoryItem: { id: string } | null } | null } | null };
type RawEvent = { id: string; status: string; happenedAt: string; createdAt: string };
type RawTracking = { number: string | null; company: string | null; url: string | null };
type RawFulfillment = { id: string; status: string; displayStatus: string | null; createdAt: string; updatedAt: string; inTransitAt: string | null; deliveredAt: string | null; location: { id: string } | null; trackingInfo: RawTracking[]; fulfillmentLineItems: { nodes: RawLine[]; pageInfo: PageInfo }; events: { nodes: RawEvent[]; pageInfo: PageInfo } };

export const FULFILLMENT_EVIDENCE_PROBE_QUERY = `query VaultFulfillmentEvidenceProbe($orderIds: [ID!]!) {
  nodes(ids: $orderIds) { ... on Order { id updatedAt fulfillments { ${fulfillmentFields()} } } }
}`;
const LINE_PAGE_QUERY = `query VaultFulfillmentEvidenceProbeLinePage($fulfillmentId: ID!, $after: String!, $first: Int!) {
  node(id: $fulfillmentId) { ... on Fulfillment { fulfillmentLineItems(first: $first, after: $after) { nodes { id createdAt quantity lineItem { id variant { id inventoryItem { id } } } } pageInfo { hasNextPage endCursor } } } }
}`;
const EVENT_PAGE_QUERY = `query VaultFulfillmentEvidenceProbeEventPage($fulfillmentId: ID!, $after: String!, $first: Int!) {
  node(id: $fulfillmentId) { ... on Fulfillment { events(first: $first, after: $after) { nodes { id status happenedAt createdAt } pageInfo { hasNextPage endCursor } } } }
}`;

function fulfillmentFields() { return `id status displayStatus createdAt updatedAt inTransitAt deliveredAt location { id } trackingInfo { number company url } fulfillmentLineItems(first: ${PAGE_SIZE}) { nodes { id createdAt quantity lineItem { id variant { id inventoryItem { id } } } pageInfo { hasNextPage endCursor } } events(first: ${PAGE_SIZE}) { nodes { id status happenedAt createdAt } pageInfo { hasNextPage endCursor } }`; }

export function parseFulfillmentEvidenceProbeRequest(input: unknown): { orderIds: string[] } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_FULFILLMENT_PROBE_REQUEST");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some((key) => key !== "diagnostic" && key !== "orderIds") || value.diagnostic !== FULFILLMENT_EVIDENCE_PROBE_VERSION || !Array.isArray(value.orderIds) || value.orderIds.length < 1 || value.orderIds.length > MAX_ORDERS || value.orderIds.some((id) => typeof id !== "string" || !ORDER_GID.test(id)) || new Set(value.orderIds).size !== value.orderIds.length) throw new Error("INVALID_FULFILLMENT_PROBE_REQUEST");
  return { orderIds: value.orderIds as string[] };
}

function required(value: unknown, code = "REQUIRED_FULFILLMENT_FIELD_MISSING") { if (typeof value !== "string" || !value) throw new Error(code); return value; }
function pageInfo(value: unknown): PageInfo { if (!value || typeof value !== "object" || typeof (value as PageInfo).hasNextPage !== "boolean" || (!((value as PageInfo).endCursor === null || typeof (value as PageInfo).endCursor === "string"))) throw new Error("SHOPIFY_RESPONSE_MALFORMED"); return value as PageInfo; }
function connection(value: unknown): { nodes: unknown[]; pageInfo: PageInfo } { if (!value || typeof value !== "object" || !Array.isArray((value as { nodes?: unknown[] }).nodes)) throw new Error("SHOPIFY_RESPONSE_MALFORMED"); return { nodes: (value as { nodes: unknown[] }).nodes, pageInfo: pageInfo((value as { pageInfo?: unknown }).pageInfo) }; }
function nextCursor(info: PageInfo, seen: Set<string>) { if (!info.hasNextPage) return null; if (!info.endCursor || seen.has(info.endCursor)) throw new Error("FULFILLMENT_PAGINATION_INCOMPLETE"); seen.add(info.endCursor); return info.endCursor; }
function line(raw: RawLine) { const item = raw?.lineItem; const variant = item?.variant; return { fulfillmentLineItemId: required(raw?.id), createdAt: required(raw?.createdAt), quantity: typeof raw?.quantity === "number" && Number.isInteger(raw.quantity) && raw.quantity >= 0 ? raw.quantity : (() => { throw new Error("REQUIRED_FULFILLMENT_FIELD_MISSING"); })(), orderLineItemId: required(item?.id), variantId: required(variant?.id), inventoryItemId: required(variant?.inventoryItem?.id) }; }
function event(raw: RawEvent) { return { eventId: required(raw?.id), status: required(raw?.status), happenedAt: required(raw?.happenedAt), createdAt: required(raw?.createdAt) }; }
function tracking(raw: RawTracking) { const number = typeof raw?.number === "string" ? raw.number.trim() : ""; return number ? { trackingNumber: number, trackingCompany: typeof raw.company === "string" && raw.company.trim() ? raw.company.trim() : null, trackingUrl: typeof raw.url === "string" && raw.url.trim() ? raw.url.trim() : null } : null; }

async function pages<T>(initial: { nodes: T[]; pageInfo: PageInfo }, fetch: (cursor: string) => Promise<{ nodes: T[]; pageInfo: PageInfo }>, identity: (item: T) => string) {
  const result: T[] = []; const ids = new Set<string>(); const cursors = new Set<string>(); let current = initial;
  for (let count = 0; count < MAX_PAGES; count++) { for (const item of current.nodes) { const id = identity(item); if (ids.has(id)) throw new Error("DUPLICATE_FULFILLMENT_IDENTITY"); ids.add(id); result.push(item); } const cursor = nextCursor(current.pageInfo, cursors); if (!cursor) return result; current = await fetch(cursor); }
  throw new Error("FULFILLMENT_PAGINATION_INCOMPLETE");
}

async function sanitizeFulfillment(raw: RawFulfillment, graphql: GraphQL) {
  const fulfillmentId = required(raw?.id); const baseLines = connection(raw?.fulfillmentLineItems); const baseEvents = connection(raw?.events);
  const lines = await pages(baseLines as { nodes: RawLine[]; pageInfo: PageInfo }, async (after) => { const data = await graphql<{ node: { fulfillmentLineItems: unknown } | null }>(LINE_PAGE_QUERY, { fulfillmentId, after, first: PAGE_SIZE }); return connection(data?.node?.fulfillmentLineItems) as { nodes: RawLine[]; pageInfo: PageInfo }; }, (value) => required(value?.id));
  const events = await pages(baseEvents as { nodes: RawEvent[]; pageInfo: PageInfo }, async (after) => { const data = await graphql<{ node: { events: unknown } | null }>(EVENT_PAGE_QUERY, { fulfillmentId, after, first: PAGE_SIZE }); return connection(data?.node?.events) as { nodes: RawEvent[]; pageInfo: PageInfo }; }, (value) => required(value?.id));
  if (!Array.isArray(raw?.trackingInfo)) throw new Error("SHOPIFY_RESPONSE_MALFORMED");
  const trackingValues = raw.trackingInfo.map(tracking).filter((value): value is NonNullable<ReturnType<typeof tracking>> => value !== null);
  return { fulfillmentId, status: required(raw?.status), displayStatus: raw.displayStatus === null ? null : required(raw.displayStatus), createdAt: required(raw?.createdAt), updatedAt: required(raw?.updatedAt), inTransitAt: raw.inTransitAt === null ? null : required(raw.inTransitAt), deliveredAt: raw.deliveredAt === null ? null : required(raw.deliveredAt), locationId: raw.location === null ? null : required(raw.location.id), trackingValues, lineItemCount: lines.length, lineItemsComplete: true, eventCount: events.length, eventsComplete: true, lineItems: lines.map(line), events: events.map(event) };
}

export async function runFulfillmentEvidenceProbe(orderIds: string[], graphql: GraphQL = shopifyGraphQL): Promise<unknown> {
  const data = await graphql<{ nodes: Array<{ id: string; updatedAt: string; fulfillments: RawFulfillment[] } | null> }>(FULFILLMENT_EVIDENCE_PROBE_QUERY, { orderIds });
  if (!data || !Array.isArray(data.nodes) || data.nodes.length !== orderIds.length) throw new Error("SHOPIFY_RESPONSE_MALFORMED");
  const orders = [];
  for (const requestedId of orderIds) {
    const initialOrder = data.nodes.find((node) => node?.id === requestedId);
    if (!initialOrder) throw new Error("ORDER_NOT_FOUND");
    if (!Array.isArray(initialOrder.fulfillments)) throw new Error("SHOPIFY_RESPONSE_MALFORMED");
    const fulfillmentIds = new Set<string>();
    for (const fulfillment of initialOrder.fulfillments) {
      const fulfillmentId = required(fulfillment?.id);
      if (fulfillmentIds.has(fulfillmentId)) throw new Error("DUPLICATE_FULFILLMENT_IDENTITY");
      fulfillmentIds.add(fulfillmentId);
    }
    const fulfillments = initialOrder.fulfillments;
    orders.push({ orderId: required(initialOrder.id), updatedAt: required(initialOrder.updatedAt), fulfillmentCount: fulfillments.length, fulfillmentsComplete: true, fulfillments: await Promise.all(fulfillments.map((value) => sanitizeFulfillment(value, graphql))) });
  }
  return { success: true, probeVersion: FULFILLMENT_EVIDENCE_PROBE_VERSION, orders, completeness: { ordersRequested: orderIds.length, ordersFound: orders.length, allRequestedOrdersFound: true, allConnectionsComplete: true } };
}
