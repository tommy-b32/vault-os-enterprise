import "server-only";

import { ShopifyFinancialReadModelRepository } from "@/lib/business/ShopifyFinancialReadModelRepository";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildFinancialIntelligenceSnapshot, type CanonicalFinancialCoverageOrder, type FinancialRange } from "./FinancialIntelligence";

type CanonicalOrderRow = { id: string; shopify_created_at: string; currency: string; net_revenue: number | string };

function mapCanonicalOrder(row: CanonicalOrderRow): CanonicalFinancialCoverageOrder {
  const canonicalNetRevenue = Number(row.net_revenue);
  if (typeof row.id !== "string" || typeof row.shopify_created_at !== "string" || typeof row.currency !== "string" || !Number.isFinite(canonicalNetRevenue)) throw new Error("Canonical Shopify financial coverage is invalid");
  return { id: row.id, createdAt: row.shopify_created_at, currency: row.currency, canonicalNetRevenue };
}

async function getCanonicalOrders(range: FinancialRange): Promise<CanonicalFinancialCoverageOrder[]> {
  const records: CanonicalFinancialCoverageOrder[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabaseAdmin.from("vault_shopify_orders")
      .select("id,shopify_created_at,currency,net_revenue")
      .eq("source", "shopify")
      .gte("shopify_created_at", range.from)
      .lt("shopify_created_at", range.to)
      .order("shopify_created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + 499);
    if (error || data === null) throw new Error(`Unable to read canonical Shopify financial coverage: ${error?.message ?? "no data"}`);
    records.push(...(data as CanonicalOrderRow[]).map(mapCanonicalOrder));
    if (data.length < 500) return records;
  }
}

export const FinancialIntelligenceRepository = {
  async getSnapshot(range: FinancialRange) {
    const [canonicalOrders, verifiedOrders] = await Promise.all([
      getCanonicalOrders(range),
      ShopifyFinancialReadModelRepository.getByCreatedAtRange(range),
    ]);
    return buildFinancialIntelligenceSnapshot(range, canonicalOrders, verifiedOrders);
  },
} as const;
