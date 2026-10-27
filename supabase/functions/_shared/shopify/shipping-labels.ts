import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { shopifyGraphQL } from "./graphql.ts";

export const SHIPPING_BATCH_SIZE = 50;
export const SHIPPING_RECENT_SCAN_DAYS = 7;
export const SHIPPING_RECOVERY_MAX_AGE_DAYS = 30;
type Order = { id: string; shopify_order_id: string; shopify_created_at: string };
type Table = { columns: { name: string }[]; rows: unknown };
type LabelCost = { cost: string; count: number };
type LabelNode = { id: string; fulfillments: Array<{ shippingLabel: { id: string } | null }> } | null;

export type ShippingValidationDiagnostic = {
  candidateOrderIds: string[];
  stage: "shopifyql_table_shape" | "shopifyql_row_validation" | "fulfillment_node_validation";
  columnNames: string[];
  rowCount: number | null;
};

export class ShippingSourceIncompleteError extends Error {
  constructor(readonly diagnostic: ShippingValidationDiagnostic) {
    super("Shipping source incomplete");
  }
}

function tableDiagnostic(table: unknown, stage: ShippingValidationDiagnostic["stage"]): ShippingValidationDiagnostic {
  const value = table && typeof table === "object" && !Array.isArray(table) ? table as Record<string, unknown> : {};
  const columns = Array.isArray(value.columns) ? value.columns : [];
  const columnNames = [...new Set(columns.flatMap(column => column && typeof column === "object" && !Array.isArray(column) && typeof (column as Record<string, unknown>).name === "string"
    ? [(column as Record<string, string>).name] : []))].slice(0, 20);
  return { candidateOrderIds: [], stage, columnNames, rowCount: Array.isArray(value.rows) ? value.rows.length : null };
}

function incompleteShippingSource(table: unknown, stage: ShippingValidationDiagnostic["stage"]): never {
  throw new ShippingSourceIncompleteError(tableDiagnostic(table, stage));
}

export function shippingValidationDiagnostic(error: unknown): ShippingValidationDiagnostic | null {
  return error instanceof ShippingSourceIncompleteError ? error.diagnostic : null;
}

export function parseShippingRequest(input: unknown, now = new Date()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid shipping request");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["createdFrom", "createdBefore", "after"].includes(key))) throw new Error("Unknown shipping request field");
  const createdFrom = value.createdFrom ?? new Date(now.getTime() - SHIPPING_RECENT_SCAN_DAYS * 86400000).toISOString();
  const createdBefore = value.createdBefore ?? now.toISOString();
  const after = value.after ?? null;
  if (typeof createdFrom !== "string" || typeof createdBefore !== "string" ||
      !Number.isFinite(Date.parse(createdFrom)) || !Number.isFinite(Date.parse(createdBefore)) ||
      Date.parse(createdFrom) >= Date.parse(createdBefore) || Date.parse(createdBefore) > now.getTime() ||
      Date.parse(createdBefore) - Date.parse(createdFrom) > 31 * 86400000 ||
      (after !== null && (typeof after !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(after)))) {
    throw new Error("Shipping request needs a past interval of at most 31 days and a valid order cursor");
  }
  return { createdFrom: new Date(createdFrom).toISOString(), createdBefore: new Date(createdBefore).toISOString(), after };
}

function isShippingOrder(value: unknown): value is Order {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const order = value as Record<string, unknown>;
  return typeof order.id === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(order.id) &&
    typeof order.shopify_order_id === "string" && /^gid:\/\/shopify\/Order\/[1-9][0-9]*$/.test(order.shopify_order_id) &&
    typeof order.shopify_created_at === "string" && Number.isFinite(Date.parse(order.shopify_created_at));
}

export function shippingRecoveryWindow(now = new Date()) {
  return {
    createdFrom: new Date(now.getTime() - SHIPPING_RECOVERY_MAX_AGE_DAYS * 86400000).toISOString(),
    createdBefore: new Date(now.getTime() - SHIPPING_RECENT_SCAN_DAYS * 86400000).toISOString(),
  };
}

/**
 * Select a single bounded backlog page. The creation-date bands are deliberately
 * disjoint from the normal seven-day scan, so an order cannot be queried twice
 * in one refresh invocation.
 */
export async function selectShippingRecoveryCandidates(supabase: SupabaseClient, now = new Date()) {
  const window = shippingRecoveryWindow(now);
  const { data, error } = await supabase.from("vault_shopify_shipping_costs")
    .select("order_id,vault_shopify_orders!inner(id,shopify_order_id,shopify_created_at)")
    .in("source_state", ["missing", "awaiting_shopify_cost"])
    .gte("vault_shopify_orders.shopify_created_at", window.createdFrom)
    .lt("vault_shopify_orders.shopify_created_at", window.createdBefore)
    .eq("vault_shopify_orders.source", "shopify")
    .is("vault_shopify_orders.cancelled_at", null)
    .eq("vault_shopify_orders.metadata->>test", false)
    .order("fetched_at", { ascending: true })
    .order("order_id", { ascending: true })
    .limit(SHIPPING_BATCH_SIZE);
  if (error || !data || !Array.isArray(data)) throw new Error("Unable to select shipping recovery candidates");

  const seen = new Set<string>();
  const orders: Order[] = [];
  for (const row of data as Array<Record<string, unknown>>) {
    const joined = row.vault_shopify_orders;
    const order = Array.isArray(joined) ? joined[0] : joined;
    if (!isShippingOrder(order) || seen.has(order.id)) continue;
    const createdAt = Date.parse(order.shopify_created_at);
    if (createdAt < Date.parse(window.createdFrom) || createdAt >= Date.parse(window.createdBefore)) continue;
    seen.add(order.id);
    orders.push(order);
  }
  return orders;
}

export function shippingQuery(orders: Order[]) {
  if (!orders.length || orders.length > SHIPPING_BATCH_SIZE) throw new Error("Invalid shipping batch size");
  const ids = orders.map(order => {
    const match = /^gid:\/\/shopify\/Order\/([1-9][0-9]*)$/.exec(order.shopify_order_id);
    if (!match || !Number.isFinite(Date.parse(order.shopify_created_at))) throw new Error("Invalid canonical order identity");
    return match[1];
  });
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate canonical order");
  // Label dates only bound the source scan; the requested cohort is selected by ORDER creation.
  const from = new Date(Math.min(...orders.map(order => Date.parse(order.shopify_created_at))) - 86400000).toISOString().slice(0, 10);
  return { from, query: `FROM shipping_labels SHOW shipping_label_costs, shipping_labels GROUP BY order_id WHERE order_id IN (${ids.join(",")}) SINCE ${from} UNTIL today LIMIT ${SHIPPING_BATCH_SIZE + 1}` };
}

export function parseLabelCosts(table: Table, orders: Order[]): Map<string, LabelCost> {
  const names = table.columns.map(column => column.name);
  if (!["order_id", "shipping_label_costs", "shipping_labels"].every(name => names.includes(name)) ||
      !Array.isArray(table.rows) || table.rows.length > orders.length) incompleteShippingSource(table, "shopifyql_table_shape");
  const expected = new Set(orders.map(order => order.shopify_order_id));
  const result = new Map<string, LabelCost>();
  for (const raw of table.rows) {
    if (!raw || typeof raw !== "object") incompleteShippingSource(table, "shopifyql_row_validation");
    const row = Array.isArray(raw) ? Object.fromEntries(names.map((name, i) => [name, raw[i]])) : raw as Record<string, unknown>;
    // IDs remain strings throughout: never round a Shopify ID through Number.
    if (typeof row.order_id !== "string" || !/^[1-9][0-9]*$/.test(row.order_id)) incompleteShippingSource(table, "shopifyql_row_validation");
    const id = `gid://shopify/Order/${row.order_id}`;
    const cost = row.shipping_label_costs;
    const count = row.shipping_labels;
    if (!expected.has(id) || result.has(id) || typeof cost !== "string" || !/^\d+(\.\d{1,2})?$/.test(cost) ||
        !Number.isSafeInteger(Math.round(Number(cost) * 100)) ||
        (typeof count !== "string" && typeof count !== "number") || !/^[1-9][0-9]*$/.test(String(count)) ||
        !Number.isSafeInteger(Number(count))) incompleteShippingSource(table, "shopifyql_row_validation");
    result.set(id, { cost, count: Number(count) });
  }
  return result;
}

export function confirmedShippingLabels(nodes: LabelNode[], orders: Order[]): Set<string> {
  const expected = new Set(orders.map(order => order.shopify_order_id));
  const confirmed = new Set<string>();
  const seen = new Set<string>();
  for (const node of nodes) {
    if (node === null) continue;
    if (!expected.has(node.id) || seen.has(node.id) || !Array.isArray(node.fulfillments)) {
      incompleteShippingSource(null, "fulfillment_node_validation");
    }
    seen.add(node.id);
    if (node.fulfillments.some(fulfilment => fulfilment?.shippingLabel?.id)) confirmed.add(node.id);
  }
  return confirmed;
}

export async function syncShippingOrders(supabase: SupabaseClient, orders: Order[]) {
  if (!orders.length || orders.length > SHIPPING_BATCH_SIZE || orders.some(order => !isShippingOrder(order))) {
    throw new Error("Invalid shipping order batch");
  }
  if (new Set(orders.map(order => order.id)).size !== orders.length) throw new Error("Duplicate shipping order batch");
  const fetchedAt = new Date().toISOString();
  const { query, from } = shippingQuery(orders);
  const response = await shopifyGraphQL<{
    shop: { id: string; currencyCode: string; ianaTimezone: string };
    nodes: LabelNode[];
    shopifyqlQuery: { parseErrors: string[]; tableData: Table | null } | null;
  }>(`query VaultShippingCosts($query: String!, $orderIds: [ID!]!) {
    shop { id currencyCode ianaTimezone }
    nodes(ids: $orderIds) { ... on Order { id fulfillments(first: 250) { shippingLabel { id } } } }
    shopifyqlQuery(query: $query) { parseErrors tableData { columns { name } rows } }
  }`, { query, orderIds: orders.map(order => order.shopify_order_id) }, Date.now() + 25000);
  if (!response.shopifyqlQuery || response.shopifyqlQuery.parseErrors.length || !response.shopifyqlQuery.tableData ||
      response.shop.currencyCode !== "GBP" || response.shop.ianaTimezone !== "Europe/London") throw new Error("Shipping analytics unavailable or incompatible currency/timezone");
  let costs: Map<string, LabelCost>;
  let labels: Set<string>;
  try {
    costs = parseLabelCosts(response.shopifyqlQuery.tableData, orders);
    labels = confirmedShippingLabels(response.nodes, orders);
  } catch (error) {
    const diagnostic = shippingValidationDiagnostic(error);
    if (diagnostic) throw new ShippingSourceIncompleteError({ ...diagnostic, candidateOrderIds: orders.map(order => order.id) });
    throw error;
  }
  const rows = orders.map(order => ({
    order_id: order.id, shopify_order_id: order.shopify_order_id, shop_id: response.shop.id,
    label_cost_gbp: costs.get(order.shopify_order_id)?.cost ?? null,
    label_count: costs.get(order.shopify_order_id)?.count ?? null,
    source_state: costs.has(order.shopify_order_id) ? "covered" : labels.has(order.shopify_order_id) ? "awaiting_shopify_cost" : "missing",
    fetched_at: fetchedAt, query_from: from,
  }));
  // One atomic replace per order, including explicit missing snapshots; never add totals.
  const { error: writeError } = await supabase.rpc("record_shopify_shipping_costs", { snapshots: rows });
  if (writeError) throw new Error("Unable to persist shipping costs");
  return { processed: orders.length, covered: costs.size };
}

export async function syncShippingBatch(supabase: SupabaseClient, input: ReturnType<typeof parseShippingRequest>) {
  let selection = supabase.from("vault_shopify_orders").select("id,shopify_order_id,shopify_created_at")
    .eq("source", "shopify").gte("shopify_created_at", input.createdFrom).lt("shopify_created_at", input.createdBefore)
    .is("cancelled_at", null).eq("metadata->>test", false).order("id").limit(SHIPPING_BATCH_SIZE + 1);
  if (input.after) selection = selection.gt("id", input.after);
  const { data, error } = await selection;
  if (error || !data) throw new Error("Unable to select shipping orders");
  const orders = (data as Order[]).slice(0, SHIPPING_BATCH_SIZE);
  const next = data.length > SHIPPING_BATCH_SIZE ? orders.at(-1)!.id : null;
  if (!orders.length) return { processed: 0, covered: 0, next, ...input };
  return { ...input, ...(await syncShippingOrders(supabase, orders)), next };
}

export async function refreshShippingCosts(supabase: SupabaseClient, now = new Date()) {
  const recoveryOrders = await selectShippingRecoveryCandidates(supabase, now);
  let recovery: { processed: number; covered: number; failure: unknown | null } = { processed: 0, covered: 0, failure: null };
  if (recoveryOrders.length) {
    try { recovery = { ...(await syncShippingOrders(supabase, recoveryOrders)), failure: null }; }
    catch (error) { recovery = { processed: 0, covered: 0, failure: error }; }
  }
  let input = parseShippingRequest({}, now);
  // At most 200 orders per scheduled run. Larger cohorts use the explicit cursor endpoint.
  for (let page = 0; page < 4; page++) {
    const result = await syncShippingBatch(supabase, input);
    if (!result.next) return { complete: true, recovery };
    input = { ...input, after: result.next };
  }
  return { complete: false, recovery, ...input };
}
