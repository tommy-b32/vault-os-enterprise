import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type VerifiedShopifyOrderFinancial = {
  orderId: string;
  shopifyOrderId: string;
  createdAt: string;
  sourceUpdatedAt: string;
  currency: "GBP";
  canonicalNetRevenue: number;
  discountAllocationTotal: number;
  refundTotal: number;
  refundLineMerchandiseTotal: number;
  refundLineTaxTotal: number;
  refundReconciliationStatus: "not_applicable" | "reconciled" | "unreconciled";
  completenessEvidenceMode: "historical" | "prospective";
  completenessObservedAt: string;
  completenessSourceContentFingerprint: string;
};

export type VerifiedShopifyOrderFinancialRange = {
  from: string;
  to: string;
};

const money = (value: unknown, field: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid verified Shopify financial ${field}`);
  return parsed;
};
const timestamp = (value: unknown, field: string) => {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(`Invalid verified Shopify financial ${field}`);
  return value;
};

function mapRow(row: Record<string, unknown>): VerifiedShopifyOrderFinancial {
  if (row.currency !== "GBP" || !["historical", "prospective"].includes(String(row.completeness_evidence_mode)) || !["not_applicable", "reconciled", "unreconciled"].includes(String(row.refund_reconciliation_status)) || typeof row.order_id !== "string" || typeof row.shopify_order_id !== "string" || typeof row.completeness_source_content_fingerprint !== "string" || !row.completeness_source_content_fingerprint) throw new Error("Invalid verified Shopify financial row");
  return { orderId: row.order_id, shopifyOrderId: row.shopify_order_id, createdAt: timestamp(row.shopify_created_at, "created timestamp"), sourceUpdatedAt: timestamp(row.order_source_updated_at, "source timestamp"), currency: "GBP", canonicalNetRevenue: money(row.canonical_net_revenue, "net revenue"), discountAllocationTotal: money(row.discount_allocation_total, "discount total"), refundTotal: money(row.refund_total, "refund total"), refundLineMerchandiseTotal: money(row.refund_line_merchandise_total, "refund merchandise total"), refundLineTaxTotal: money(row.refund_line_tax_total, "refund tax total"), refundReconciliationStatus: row.refund_reconciliation_status as VerifiedShopifyOrderFinancial["refundReconciliationStatus"], completenessEvidenceMode: row.completeness_evidence_mode as VerifiedShopifyOrderFinancial["completenessEvidenceMode"], completenessObservedAt: timestamp(row.completeness_observed_at, "completeness timestamp"), completenessSourceContentFingerprint: row.completeness_source_content_fingerprint };
}

const FIELDS = "order_id,shopify_order_id,shopify_created_at,order_source_updated_at,currency,canonical_net_revenue,discount_allocation_total,refund_total,refund_line_merchandise_total,refund_line_tax_total,refund_reconciliation_status,completeness_evidence_mode,completeness_observed_at,completeness_source_content_fingerprint";

export const ShopifyFinancialReadModelRepository = {
  async getByShopifyOrderIds(shopifyOrderIds: readonly string[]): Promise<VerifiedShopifyOrderFinancial[]> {
    const ids = [...new Set(shopifyOrderIds.filter((id) => typeof id === "string" && id.trim()))];
    if (!ids.length) return [];
    if (ids.length > 50) throw new Error("Verified Shopify financial reads are limited to 50 orders");
    const { data, error } = await supabaseAdmin.from("vault_shopify_verified_order_financials")
      .select(FIELDS)
      .in("shopify_order_id", ids);
    if (error || data === null) throw new Error(`Unable to read verified Shopify order financials: ${error?.message ?? "no data"}`);
    return data.map((row) => mapRow(row));
  },

  async getByCreatedAtRange(range: VerifiedShopifyOrderFinancialRange): Promise<VerifiedShopifyOrderFinancial[]> {
    const from = Date.parse(range.from);
    const to = Date.parse(range.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
      throw new Error("Invalid verified Shopify financial date range");
    }
    const records: VerifiedShopifyOrderFinancial[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabaseAdmin.from("vault_shopify_verified_order_financials")
        .select(FIELDS)
        .gte("shopify_created_at", range.from)
        .lt("shopify_created_at", range.to)
        .order("shopify_created_at", { ascending: true })
        .order("order_id", { ascending: true })
        .range(offset, offset + 499);
      if (error || data === null) throw new Error(`Unable to read verified Shopify order financials: ${error?.message ?? "no data"}`);
      records.push(...data.map((row) => mapRow(row)));
      if (data.length < 500) return records;
    }
  },
} as const;
