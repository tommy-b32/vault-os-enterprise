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

export const FINANCIAL_FINGERPRINT_CONTRACT_VERSION = "shopify-source-content-v1";

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function sourceContentFingerprint(value: unknown): string {
  const source = canonicalJson(value);
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
  if (!Array.isArray(order.refunds)) throw new Error("FINANCIAL_REFUNDS_INCOMPLETE");
  const applications: Record<string, unknown>[] = [];
  const allocations: Record<string, unknown>[] = [];
  const applicationIndexes = new Set<number>();
  for (const application of order.discountApplications.nodes) {
    if (!Number.isInteger(application.index) || application.index < 0) throw new Error("INVALID_DISCOUNT_APPLICATION");
    applicationIndexes.add(application.index);
    const value = application.value?.__typename === "MoneyV2" ? { pricing_value: Number(application.value.amount), pricing_currency: application.value.currencyCode } : { pricing_value: Number(application.value?.percentage), pricing_currency: null };
    if (!Number.isFinite(value.pricing_value)) throw new Error("INVALID_DISCOUNT_VALUE");
    const sourceContent = { source: "shopify", shopify_order_id: order.id, application_index: application.index, order_source_updated_at: order.updatedAt, application_type: application.__typename, code: application.code ?? null, title: application.title ?? null, description: application.description ?? null, allocation_method: application.allocationMethod, target_selection: application.targetSelection, target_type: application.targetType, pricing_value_type: application.value.__typename, ...value };
    const row = { ...sourceContent, evidence_mode: mode, observed_at: observedAt };
    const source_content_fingerprint = sourceContentFingerprint(sourceContent);
    applications.push({ ...row, fingerprint_contract_version: FINANCIAL_FINGERPRINT_CONTRACT_VERSION, source_content_fingerprint, payload_fingerprint: source_content_fingerprint });
  }
  for (const line of order.lineItems.nodes) {
    if (!Array.isArray(line.discountAllocations)) throw new Error("INVALID_DISCOUNT_ALLOCATIONS");
    for (const allocation of line.discountAllocations) {
      const applicationIndex = allocation.discountApplication?.index;
      if (!applicationIndexes.has(applicationIndex)) throw new Error("UNLINKED_DISCOUNT_ALLOCATION");
      const amount = money(allocation.allocatedAmountSet);
      const sourceContent = { source: "shopify", shopify_order_id: order.id, shopify_line_item_id: line.id, application_index: applicationIndex, order_source_updated_at: order.updatedAt, allocated_shop_amount: amount.amount, allocated_shop_currency: amount.currency, allocated_presentment_amount: amount.presentment_amount, allocated_presentment_currency: amount.presentment_currency };
      const row = { ...sourceContent, evidence_mode: mode, observed_at: observedAt };
      const source_content_fingerprint = sourceContentFingerprint(sourceContent);
      allocations.push({ ...row, fingerprint_contract_version: FINANCIAL_FINGERPRINT_CONTRACT_VERSION, source_content_fingerprint, payload_fingerprint: source_content_fingerprint });
    }
  }
  const refunds: Record<string, unknown>[] = [];
  const refund_lines: Record<string, unknown>[] = [];
  const refund_transactions: Record<string, unknown>[] = [];
  for (const refund of order.refunds) {
    requireComplete(refund.refundLineItems, "FINANCIAL_REFUND_LINES_INCOMPLETE");
    requireComplete(refund.transactions, "FINANCIAL_REFUND_TRANSACTIONS_INCOMPLETE");
    const total = money(refund.totalRefundedSet);
    const refundSourceContent = { source: "shopify", shopify_order_id: order.id, shopify_refund_id: refund.id, refund_created_at: refund.createdAt, refund_source_updated_at: refund.updatedAt, refund_processed_at: refund.processedAt ?? null, total_refunded_amount: total.amount, currency: total.currency };
    const refundRow = { ...refundSourceContent, evidence_mode: mode, observed_at: observedAt };
    const refund_source_content_fingerprint = sourceContentFingerprint(refundSourceContent);
    refunds.push({ ...refundRow, fingerprint_contract_version: FINANCIAL_FINGERPRINT_CONTRACT_VERSION, source_content_fingerprint: refund_source_content_fingerprint, payload_fingerprint: refund_source_content_fingerprint });
    for (const refundLine of refund.refundLineItems.nodes) {
      const price = money(refundLine.priceSet); const subtotal = money(refundLine.subtotalSet); const tax = money(refundLine.totalTaxSet);
      if (!refundLine.id || price.currency !== subtotal.currency || subtotal.currency !== tax.currency) throw new Error("INVALID_REFUND_LINE");
      const sourceContent = { source: "shopify", shopify_order_id: order.id, shopify_refund_id: refund.id, shopify_refund_line_item_id: refundLine.id, shopify_line_item_id: refundLine.lineItem?.id ?? null, refund_source_updated_at: refund.updatedAt, quantity: refundLine.quantity, price_amount: price.amount, subtotal_amount: subtotal.amount, tax_amount: tax.amount, currency: price.currency, restocked: refundLine.restocked, restock_type: refundLine.restockType, restock_location_id: refundLine.location?.id ?? null };
      const row = { ...sourceContent, evidence_mode: mode, observed_at: observedAt };
      const source_content_fingerprint = sourceContentFingerprint(sourceContent);
      refund_lines.push({ ...row, fingerprint_contract_version: FINANCIAL_FINGERPRINT_CONTRACT_VERSION, source_content_fingerprint, payload_fingerprint: source_content_fingerprint });
    }
    for (const transaction of refund.transactions.nodes) {
      const amount = money(transaction.amountSet);
      if (!transaction.id || !transaction.createdAt) throw new Error("INVALID_REFUND_TRANSACTION");
      const sourceContent = { source: "shopify", shopify_order_id: order.id, shopify_refund_id: refund.id, shopify_order_transaction_id: transaction.id, parent_transaction_id: transaction.parentTransaction?.id ?? null, refund_source_updated_at: refund.updatedAt, transaction_kind: transaction.kind, transaction_status: transaction.status, gateway: transaction.gateway ?? null, amount: amount.amount, currency: amount.currency, transaction_created_at: transaction.createdAt, processed_at: transaction.processedAt ?? null, is_test: transaction.test };
      const row = { ...sourceContent, evidence_mode: mode, observed_at: observedAt };
      const source_content_fingerprint = sourceContentFingerprint(sourceContent);
      refund_transactions.push({ ...row, fingerprint_contract_version: FINANCIAL_FINGERPRINT_CONTRACT_VERSION, source_content_fingerprint, payload_fingerprint: source_content_fingerprint });
    }
  }
  // This is an affirmative observation, not an inference from empty evidence arrays.
  // It is produced only after every financial structure above has been retrieved
  // completely and validated, including every refund's nested connections.
  const completenessSourceContent = {
    source: "shopify",
    shopify_order_id: order.id,
    order_source_updated_at: order.updatedAt,
    discount_application_count: applications.length,
    discount_allocation_count: allocations.length,
    refund_count: refunds.length,
    refund_line_count: refund_lines.length,
    refund_transaction_count: refund_transactions.length,
  };
  const source_content_fingerprint = sourceContentFingerprint(completenessSourceContent);
  const completeness = {
    ...completenessSourceContent,
    evidence_mode: mode,
    observed_at: observedAt,
    discount_applications_complete: true,
    line_items_complete: true,
    refunds_complete: true,
    refund_lines_complete: true,
    refund_transactions_complete: true,
    fingerprint_contract_version: FINANCIAL_FINGERPRINT_CONTRACT_VERSION,
    source_content_fingerprint,
    payload_fingerprint: source_content_fingerprint,
  };
  return { observed_at: observedAt, capture_mode: mode, applications, allocations, refunds, refund_lines, refund_transactions, completeness };
}

export async function persistFinancialEvidence(supabase: SupabaseClient, payload: FinancialEvidencePayload): Promise<void> {
  const captureMode = payload.capture_mode as FinancialMode;
  if (captureMode !== "prospective" && captureMode !== "historical") throw new Error("INVALID_FINANCIAL_CAPTURE");
  const { error } = await supabase.rpc("record_shopify_financial_evidence", { payload, capture_mode: captureMode });
  if (error) throw new Error(`Unable to persist Shopify financial evidence: ${error.message}`);
}
