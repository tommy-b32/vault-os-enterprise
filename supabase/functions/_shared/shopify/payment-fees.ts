import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { shopifyGraphQL } from "./graphql.ts";

export const PAYMENT_FEE_BATCH_SIZE = 50;
type Order = { id: string; shopify_order_id: string; shopify_created_at: string };
type Money = { amount: string; currencyCode: string };
type Fee = { id: string; type: string; amount: Money; taxAmount: Money | null };
type Transaction = { id: string; kind: string; status: string; gateway: string; paymentId: string | null; processedAt: string | null; fees: Fee[] };
type ShopifyOrder = { id: string; transactions: Transaction[] } | null;

const supportedGateway = "shopify_payments";
const successfulChargeKinds = new Set(["SALE", "CAPTURE"]);
const reversalKinds = new Set(["REFUND", "VOID"]);
const validMoney = (money: Money | null | undefined) => !!money && /^\d+(\.\d{1,2})?$/.test(money.amount) && /^[A-Z]{3}$/.test(money.currencyCode);
const isGbp = (money: Money | null | undefined) => !!money && money.currencyCode === "GBP";

export function parsePaymentFeeRequest(input: unknown, now = new Date()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid payment-fee request");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["createdFrom", "createdBefore", "after"].includes(key))) throw new Error("Unknown payment-fee request field");
  const createdFrom = value.createdFrom ?? new Date(now.getTime() - 7 * 86400000).toISOString();
  const createdBefore = value.createdBefore ?? now.toISOString();
  const after = value.after ?? null;
  if (typeof createdFrom !== "string" || typeof createdBefore !== "string" || !Number.isFinite(Date.parse(createdFrom)) ||
      !Number.isFinite(Date.parse(createdBefore)) || Date.parse(createdFrom) >= Date.parse(createdBefore) ||
      Date.parse(createdBefore) > now.getTime() || Date.parse(createdBefore) - Date.parse(createdFrom) > 31 * 86400000 ||
      (after !== null && (typeof after !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(after)))) throw new Error("Payment-fee request needs a past interval of at most 31 days and a valid cursor");
  return { createdFrom: new Date(createdFrom).toISOString(), createdBefore: new Date(createdBefore).toISOString(), after };
}

export function classifyPaymentFees(order: ShopifyOrder, canonicalOrderId: string, fetchedAt: string) {
  if (!order || !Array.isArray(order.transactions)) throw new Error("Missing Shopify order transactions");
  const transactions = order.transactions;
  const successes = transactions.filter(transaction => transaction?.status === "SUCCESS" && successfulChargeKinds.has(transaction.kind));
  let state = "covered";
  if (transactions.some(transaction => transaction?.status === "SUCCESS" && reversalKinds.has(transaction.kind))) state = "unresolved_reversal_or_adjustment";
  else if (successes.length !== 1) state = successes.length > 1 ? "unresolved_duplicate_payment" : "unresolved_missing_fee";
  else if (successes[0].gateway !== supportedGateway) state = "unsupported_gateway";
  else if (!successes[0].paymentId || !Array.isArray(successes[0].fees) || successes[0].fees.length === 0) state = "unresolved_missing_fee";
  else if (!successes[0].fees.every(fee => fee?.id && validMoney(fee.amount) && (fee.taxAmount === null || validMoney(fee.taxAmount)) && isGbp(fee.amount) && (fee.taxAmount === null || isGbp(fee.taxAmount)))) state = "unresolved_currency";
  const records = transactions.flatMap(transaction => (Array.isArray(transaction?.fees) ? transaction.fees : []).map(fee => {
    if (!fee?.id || !validMoney(fee.amount) || (fee.taxAmount !== null && !validMoney(fee.taxAmount))) throw new Error("Invalid Shopify transaction fee");
    return { order_id: canonicalOrderId, shopify_order_id: order.id, shopify_order_transaction_id: transaction.id,
      fee_id: fee.id, gateway: transaction.gateway, transaction_kind: transaction.kind, transaction_status: transaction.status,
      processed_at: transaction.processedAt, fee_amount: fee.amount.amount, fee_currency: fee.amount.currencyCode,
      tax_amount: fee.taxAmount?.amount ?? "0.00", tax_currency: fee.taxAmount?.currencyCode ?? fee.amount.currencyCode,
      source_classification: transaction.gateway === supportedGateway ? "shopify_payments" : "unsupported_gateway",
      reconciliation_state: state, counts_toward_profit: state === "covered" && transaction === successes[0], fetched_at: fetchedAt };
  }));
  if (new Set(records.map(record => `${record.shopify_order_transaction_id}:${record.fee_id}`)).size !== records.length) throw new Error("Duplicate Shopify transaction fee");
  return { coverage: { order_id: canonicalOrderId, shopify_order_id: order.id, coverage_state: state, fetched_at: fetchedAt }, records };
}

export async function syncPaymentFeeBatch(supabase: SupabaseClient, input: ReturnType<typeof parsePaymentFeeRequest>) {
  let selection = supabase.from("vault_shopify_orders").select("id,shopify_order_id,shopify_created_at").eq("source", "shopify")
    .gte("shopify_created_at", input.createdFrom).lt("shopify_created_at", input.createdBefore).is("cancelled_at", null)
    .eq("metadata->>test", false).order("id").limit(PAYMENT_FEE_BATCH_SIZE + 1);
  if (input.after) selection = selection.gt("id", input.after);
  const { data, error } = await selection;
  if (error || !data) throw new Error("Unable to select payment-fee orders");
  const orders = (data as Order[]).slice(0, PAYMENT_FEE_BATCH_SIZE);
  const next = data.length > PAYMENT_FEE_BATCH_SIZE ? orders.at(-1)!.id : null;
  if (!orders.length) return { processed: 0, covered: 0, next, ...input };
  if (orders.some(order => !/^gid:\/\/shopify\/Order\/[1-9][0-9]*$/.test(order.shopify_order_id))) throw new Error("Invalid canonical order identity");
  const response = await shopifyGraphQL<{ shop: { currencyCode: string; ianaTimezone: string }; nodes: ShopifyOrder[] }>(
    `query VaultPaymentFees($ids: [ID!]!) { shop { currencyCode ianaTimezone } nodes(ids: $ids) { ... on Order { id transactions { id kind status gateway paymentId processedAt fees { id type amount { amount currencyCode } taxAmount { amount currencyCode } } } } } }`,
    { ids: orders.map(order => order.shopify_order_id) }, Date.now() + 25000);
  if (response.shop.currencyCode !== "GBP" || response.shop.ianaTimezone !== "Europe/London" || response.nodes.length !== orders.length) throw new Error("Payment-fee source unavailable or incompatible currency/timezone");
  const byId = new Map(response.nodes.filter((order): order is Exclude<ShopifyOrder, null> => order !== null).map(order => [order.id, order]));
  const fetchedAt = new Date().toISOString();
  const snapshots = orders.map(order => classifyPaymentFees(byId.get(order.shopify_order_id) ?? null, order.id, fetchedAt));
  const records = snapshots.flatMap(snapshot => snapshot.records);
  if (new Set(records.map(record => `${record.shopify_order_transaction_id}:${record.fee_id}`)).size !== records.length) throw new Error("Duplicate Shopify transaction fee batch");
  const { error: writeError } = await supabase.rpc("record_shopify_payment_fees", { fee_records: records, coverage_snapshots: snapshots.map(snapshot => snapshot.coverage) });
  if (writeError) throw new Error("Unable to persist Shopify payment fees");
  return { ...input, processed: orders.length, covered: snapshots.filter(snapshot => snapshot.coverage.coverage_state === "covered").length, next };
}

export async function refreshPaymentFees(supabase: SupabaseClient) {
  let input = parsePaymentFeeRequest({});
  for (let page = 0; page < 4; page++) { const result = await syncPaymentFeeBatch(supabase, input); if (!result.next) return { complete: true }; input = { ...input, after: result.next }; }
  return { complete: false, ...input };
}
