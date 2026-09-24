import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type EstimatedOperationalContribution = {
  orderId: string;
  shopifyOrderId: string;
  createdAt: string;
  sourceUpdatedAt: string;
  canonicalNetRevenue: number;
  trustedNetSoldLineCogs: number;
  observedPurchasedLabelCost: number;
  coveredPaymentFees: number;
  estimatedOperationalContribution: number;
  revenueBasis: "current_customer_order_total";
  taxTreatment: "included_unseparated";
  dutiesAndAdditionalFeesTreatment: "unobserved";
  shippingLabelStatus: "observed_unreconciled";
  classification: "estimated_operational_contribution";
};

export type OperationalContributionDiagnostic = {
  orderId: string;
  shopifyOrderId: string;
  createdAt: string;
  exclusionReasonCodes: string[];
};

export type OperationalContributionRange = { from: string; to: string };

const CONTRIBUTION_FIELDS = "order_id,shopify_order_id,shopify_created_at,order_source_updated_at,canonical_net_revenue,trusted_net_sold_line_cogs_gbp,observed_purchased_label_cost_gbp,covered_payment_fees_gbp,estimated_operational_contribution_gbp,revenue_basis,tax_treatment,duties_and_additional_fees_treatment,shipping_label_status,classification";
const DIAGNOSTIC_FIELDS = "order_id,shopify_order_id,shopify_created_at,exclusion_reason_codes";

function timestamp(value: unknown, field: string) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(`Invalid operational contribution ${field}`);
  return value;
}
function amount(value: unknown, field: string, allowNegative = false) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (!allowNegative && parsed < 0)) throw new Error(`Invalid operational contribution ${field}`);
  return parsed;
}
function contribution(row: Record<string, unknown>): EstimatedOperationalContribution {
  if (typeof row.order_id !== "string" || typeof row.shopify_order_id !== "string" ||
      row.revenue_basis !== "current_customer_order_total" || row.tax_treatment !== "included_unseparated" ||
      row.duties_and_additional_fees_treatment !== "unobserved" || row.shipping_label_status !== "observed_unreconciled" ||
      row.classification !== "estimated_operational_contribution") throw new Error("Invalid operational contribution row");
  const canonicalNetRevenue = amount(row.canonical_net_revenue, "canonical net revenue");
  const trustedNetSoldLineCogs = amount(row.trusted_net_sold_line_cogs_gbp, "COGS");
  const observedPurchasedLabelCost = amount(row.observed_purchased_label_cost_gbp, "shipping cost");
  const coveredPaymentFees = amount(row.covered_payment_fees_gbp, "payment fees");
  const estimatedOperationalContribution = amount(row.estimated_operational_contribution_gbp, "estimated contribution", true);
  if (Math.abs(estimatedOperationalContribution - (canonicalNetRevenue - trustedNetSoldLineCogs - observedPurchasedLabelCost - coveredPaymentFees)) > 0.000001) throw new Error("Operational contribution calculation mismatch");
  return { orderId: row.order_id, shopifyOrderId: row.shopify_order_id, createdAt: timestamp(row.shopify_created_at, "created timestamp"), sourceUpdatedAt: timestamp(row.order_source_updated_at, "source timestamp"), canonicalNetRevenue, trustedNetSoldLineCogs, observedPurchasedLabelCost, coveredPaymentFees, estimatedOperationalContribution, revenueBasis: "current_customer_order_total", taxTreatment: "included_unseparated", dutiesAndAdditionalFeesTreatment: "unobserved", shippingLabelStatus: "observed_unreconciled", classification: "estimated_operational_contribution" };
}
function diagnostic(row: Record<string, unknown>): OperationalContributionDiagnostic {
  if (typeof row.order_id !== "string" || typeof row.shopify_order_id !== "string" || !Array.isArray(row.exclusion_reason_codes) || row.exclusion_reason_codes.some(code => typeof code !== "string" || !code)) throw new Error("Invalid operational contribution diagnostic");
  return { orderId: row.order_id, shopifyOrderId: row.shopify_order_id, createdAt: timestamp(row.shopify_created_at, "diagnostic created timestamp"), exclusionReasonCodes: [...new Set(row.exclusion_reason_codes)] };
}
function validRange(range: OperationalContributionRange) {
  if (!Number.isFinite(Date.parse(range.from)) || !Number.isFinite(Date.parse(range.to)) || Date.parse(range.from) >= Date.parse(range.to)) throw new Error("Invalid operational contribution date range");
}

async function paged<T>(view: string, fields: string, range: OperationalContributionRange, map: (row: Record<string, unknown>) => T): Promise<T[]> {
  validRange(range);
  const results: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabaseAdmin.from(view).select(fields).gte("shopify_created_at", range.from).lt("shopify_created_at", range.to).order("shopify_created_at", { ascending: true }).order("order_id", { ascending: true }).range(offset, offset + 499);
    if (error || data === null) throw new Error(`Unable to read Shopify operational contribution ${view}: ${error?.message ?? "no data"}`);
    results.push(...(data as unknown as Record<string, unknown>[]).map(row => map(row)));
    if (data.length < 500) return results;
  }
}

export const ShopifyOperationalContributionReadModelRepository = {
  getEligibleByCreatedAtRange(range: OperationalContributionRange) {
    return paged("vault_shopify_verified_order_operational_contributions", CONTRIBUTION_FIELDS, range, contribution);
  },
  getDiagnosticsByCreatedAtRange(range: OperationalContributionRange) {
    return paged("vault_shopify_order_operational_contribution_diagnostics", DIAGNOSTIC_FIELDS, range, diagnostic);
  },
} as const;
