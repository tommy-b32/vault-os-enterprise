import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { shopifyGraphQL } from "./graphql.ts";

export const SHIPPING_BATCH_SIZE = 50;
type Order = { id: string; shopify_order_id: string; shopify_created_at: string };
type Table = { columns: { name: string }[]; rows: unknown };
type LabelCost = { cost: string; count: number };

export function parseShippingRequest(input: unknown, now = new Date()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid shipping request");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["createdFrom", "createdBefore", "after"].includes(key))) throw new Error("Unknown shipping request field");
  const createdFrom = value.createdFrom ?? new Date(now.getTime() - 7 * 86400000).toISOString();
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
      !Array.isArray(table.rows) || table.rows.length > orders.length) throw new Error("Incomplete shipping table");
  const expected = new Set(orders.map(order => order.shopify_order_id));
  const result = new Map<string, LabelCost>();
  for (const raw of table.rows) {
    if (!raw || typeof raw !== "object") throw new Error("Invalid shipping row");
    const row = Array.isArray(raw) ? Object.fromEntries(names.map((name, i) => [name, raw[i]])) : raw as Record<string, unknown>;
    // IDs remain strings throughout: never round a Shopify ID through Number.
    if (typeof row.order_id !== "string" || !/^[1-9][0-9]*$/.test(row.order_id)) throw new Error("Invalid shipping order ID");
    const id = `gid://shopify/Order/${row.order_id}`;
    const cost = row.shipping_label_costs;
    const count = row.shipping_labels;
    if (!expected.has(id) || result.has(id) || typeof cost !== "string" || !/^\d+(\.\d{1,2})?$/.test(cost) ||
        !Number.isSafeInteger(Math.round(Number(cost) * 100)) ||
        (typeof count !== "string" && typeof count !== "number") || !/^[1-9][0-9]*$/.test(String(count)) ||
        !Number.isSafeInteger(Number(count))) throw new Error("Invalid shipping cost or coverage");
    result.set(id, { cost, count: Number(count) });
  }
  return result;
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
  const fetchedAt = new Date().toISOString();
  const { query, from } = shippingQuery(orders);
  const response = await shopifyGraphQL<{
    shop: { id: string; currencyCode: string; ianaTimezone: string };
    shopifyqlQuery: { parseErrors: string[]; tableData: Table | null } | null;
  }>(`query VaultShippingCosts($query: String!) {
    shop { id currencyCode ianaTimezone }
    shopifyqlQuery(query: $query) { parseErrors tableData { columns { name } rows } }
  }`, { query }, Date.now() + 25000);
  if (!response.shopifyqlQuery || response.shopifyqlQuery.parseErrors.length || !response.shopifyqlQuery.tableData ||
      response.shop.currencyCode !== "GBP" || response.shop.ianaTimezone !== "Europe/London") throw new Error("Shipping analytics unavailable or incompatible currency/timezone");
  const costs = parseLabelCosts(response.shopifyqlQuery.tableData, orders);
  const rows = orders.map(order => ({
    order_id: order.id, shopify_order_id: order.shopify_order_id, shop_id: response.shop.id,
    label_cost_gbp: costs.get(order.shopify_order_id)?.cost ?? null,
    label_count: costs.get(order.shopify_order_id)?.count ?? null,
    fetched_at: fetchedAt, query_from: from,
  }));
  // One atomic replace per order, including explicit missing snapshots; never add totals.
  const { error: writeError } = await supabase.rpc("record_shopify_shipping_costs", { snapshots: rows });
  if (writeError) throw new Error("Unable to persist shipping costs");
  return { ...input, processed: orders.length, covered: costs.size, next };
}

export async function refreshShippingCosts(supabase: SupabaseClient) {
  let input = parseShippingRequest({});
  // At most 200 orders per scheduled run. Larger cohorts use the explicit cursor endpoint.
  for (let page = 0; page < 4; page++) {
    const result = await syncShippingBatch(supabase, input);
    if (!result.next) return { complete: true };
    input = { ...input, after: result.next };
  }
  return { complete: false, ...input };
}
