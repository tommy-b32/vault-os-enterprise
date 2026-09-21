import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

type FinancialMode = "prospective" | "historical";
type MoneyBag = { shopMoney: { amount: string; currencyCode: string }; presentmentMoney?: { amount: string; currencyCode: string } };
export type FinancialEvidencePayload = Record<string, unknown>;

function money(value: MoneyBag) {
  const amount = Number(value?.shopMoney?.amount);
  const currency = value?.shopMoney?.currencyCode;
  const presentmentAmount = value?.presentmentMoney ? Number(value.presentmentMoney.amount) : null;
  const presentmentCurrency = value?.presentmentMoney?.currencyCode ?? null;
  if (!Number.isFinite(amount) || !currency || !/^[A-Z]{3}$/.test(currency) || (presentmentAmount !== null && !Number.isFinite(presentmentAmount))) throw new Error("INVALID_FINANCIAL_MONEY");
  return { amount, currency, presentment_amount: presentmentAmount, presentment_currency: presentmentCurrency };
}

function fingerprint(value: unknown): string {
  const source = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

function requireComplete(connection: { pageInfo: { hasNextPage: boolean } }, code: string): void {
  if (!connection || connection.pageInfo.hasNextPage) throw new Error(code);
}

export function buildFinancialEvidence(order: any, observedAt: string, mode: FinancialMode): FinancialEvidencePayload {
  requireComplete(order.discountApplications, "FINANCIAL_DISCOUNT_APPLICATIONS_INCOMPLETE");
  requireComplete(order.lineItems, "FINANCIAL_LINE_ITEMS_INCOMPLETE");
  const applications: Record<string, unknown>[] = [];
  const allocations: Record<string, unknown>[] = [];
  const applicationIndexes = new Set<number>();
  for (const application of order.discountApplications.nodes) {
    if (!Number.isInteger(application.index) || application.index < 0) throw new Error("INVALID_DISCOUNT_APPLICATION");
    applicationIndexes.add(application.index);
    const value = application.value?.__typename === "MoneyV2" ? { pricing_value: Number(application.value.amount), pricing_currency: application.value.currencyCode } : { pricing_value: Number(application.value?.percentage), pricing_currency: null };
    if (!Number.isFinite(value.pricing_value)) throw new Error("INVALID_DISCOUNT_VALUE");
    const row = { source: "shopify", evidence_mode: mode, shopify_order_id: order.id, application_index: application.index, order_source_updated_at: order.updatedAt, application_type: application.__typename, code: application.code ?? null, title: application.title ?? null, description: application.description ?? null, allocation_method: application.allocationMethod, target_selection: application.targetSelection, target_type: application.targetType, pricing_value_type: application.value.__typename, ...value, observed_at: observedAt };
    applications.push({ ...row, payload_fingerprint: fingerprint(row) });
  }
  for (const line of order.lineItems.nodes) {
    requireComplete(line.discountAllocations, "FINANCIAL_DISCOUNT_ALLOCATIONS_INCOMPLETE");
    for (const allocation of line.discountAllocations.nodes) {
      const applicationIndex = allocation.discountApplication?.index;
      if (!applicationIndexes.has(applicationIndex)) throw new Error("UNLINKED_DISCOUNT_ALLOCATION");
      const amount = money(allocation.allocatedAmountSet);
      const row = { source: "shopify", evidence_mode: mode, shopify_order_id: order.id, shopify_line_item_id: line.id, application_index: applicationIndex, order_source_updated_at: order.updatedAt, allocated_shop_amount: amount.amount, allocated_shop_currency: amount.currency, allocated_presentment_amount: amount.presentment_amount, allocated_presentment_currency: amount.presentment_currency, observed_at: observedAt };
      allocations.push({ ...row, payload_fingerprint: fingerprint(row) });
    }
  }
  const refunds: Record<string, unknown>[] = [];
  const refund_lines: Record<string, unknown>[] = [];
  const refund_transactions: Record<string, unknown>[] = [];
  for (const refund of order.refunds) {
    requireComplete(refund.refundLineItems, "FINANCIAL_REFUND_LINES_INCOMPLETE");
    requireComplete(refund.transactions, "FINANCIAL_REFUND_TRANSACTIONS_INCOMPLETE");
    const total = money(refund.totalRefundedSet);
    const refundRow = { source: "shopify", evidence_mode: mode, shopify_order_id: order.id, shopify_refund_id: refund.id, refund_created_at: refund.createdAt, refund_source_updated_at: refund.updatedAt, refund_processed_at: refund.processedAt ?? null, total_refunded_amount: total.amount, currency: total.currency, observed_at: observedAt };
    refunds.push({ ...refundRow, payload_fingerprint: fingerprint(refundRow) });
    for (const refundLine of refund.refundLineItems.nodes) {
      const price = money(refundLine.priceSet); const subtotal = money(refundLine.subtotalSet); const tax = money(refundLine.totalTaxSet);
      if (!refundLine.id || price.currency !== subtotal.currency || subtotal.currency !== tax.currency) throw new Error("INVALID_REFUND_LINE");
      const row = { source: "shopify", evidence_mode: mode, shopify_order_id: order.id, shopify_refund_id: refund.id, shopify_refund_line_item_id: refundLine.id, shopify_line_item_id: refundLine.lineItem?.id ?? null, refund_source_updated_at: refund.updatedAt, quantity: refundLine.quantity, price_amount: price.amount, subtotal_amount: subtotal.amount, tax_amount: tax.amount, currency: price.currency, restocked: refundLine.restocked, restock_type: refundLine.restockType, restock_location_id: refundLine.location?.id ?? null, observed_at: observedAt };
      refund_lines.push({ ...row, payload_fingerprint: fingerprint(row) });
    }
    for (const transaction of refund.transactions.nodes) {
      const amount = money(transaction.amountSet);
      if (!transaction.id || !transaction.createdAt) throw new Error("INVALID_REFUND_TRANSACTION");
      const row = { source: "shopify", evidence_mode: mode, shopify_order_id: order.id, shopify_refund_id: refund.id, shopify_order_transaction_id: transaction.id, parent_transaction_id: transaction.parentTransaction?.id ?? null, refund_source_updated_at: refund.updatedAt, transaction_kind: transaction.kind, transaction_status: transaction.status, gateway: transaction.gateway ?? null, amount: amount.amount, currency: amount.currency, transaction_created_at: transaction.createdAt, processed_at: transaction.processedAt ?? null, is_test: transaction.test, observed_at: observedAt };
      refund_transactions.push({ ...row, payload_fingerprint: fingerprint(row) });
    }
  }
  return { observed_at: observedAt, capture_mode: mode, applications, allocations, refunds, refund_lines, refund_transactions };
}

export async function persistFinancialEvidence(supabase: SupabaseClient, payload: FinancialEvidencePayload): Promise<void> {
  const captureMode = payload.capture_mode as FinancialMode;
  if (captureMode !== "prospective" && captureMode !== "historical") throw new Error("INVALID_FINANCIAL_CAPTURE");
  const { error } = await supabase.rpc("record_shopify_financial_evidence", { payload, capture_mode: captureMode });
  if (error) throw new Error(`Unable to persist Shopify financial evidence: ${error.message}`);
}
