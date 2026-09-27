export type ProfitPeriod = "7d" | "30d" | "90d" | "all";

export type ProductProfitability = {
  productId: string; productName: string; eligibleUnits: number; eligibleOrders: number;
  verifiedRevenue: number; cogs: number; shippingCost: number; paymentFees: number; contribution: number;
  asp: number | null; contributionPerUnit: number | null; contributionMarginPct: number | null;
  revenueCoveragePct: number | null; excludedOrders: number;
};

export type ProductProfitabilitySummary = { verifiedContribution: number; verifiedRevenue: number; eligibleUnits: number; eligibleOrders: number; asp: number | null; contributionMarginPct: number | null; verifiedRevenueCoveragePct: number | null };
export type ProductProfitabilityComparison = { revenueChange: number | null; contributionChange: number | null; unitsChange: number | null; marginPpChange: number | null };
export type ProfitabilitySort = "contribution" | "revenue" | "units" | "margin";

const change = (current: number, previous: number) => previous === 0 ? null : (current - previous) / previous;
export const previousProfitPeriodBounds = (period: ProfitPeriod, bounds: { from: string; to: string } | null) => {
  if (!bounds || period === "all") return null;
  const width = Date.parse(bounds.to) - Date.parse(bounds.from);
  return { from: new Date(Date.parse(bounds.from) - width).toISOString(), to: bounds.from };
};

export function summarizeProductProfitability(rows: ProductProfitability[], coverage: { eligibleRevenue: number; excludedRevenue: number }, orderIds?: Iterable<string>): ProductProfitabilitySummary {
  const verifiedRevenue = rows.reduce((sum, row) => sum + row.verifiedRevenue, 0);
  const verifiedContribution = rows.reduce((sum, row) => sum + row.contribution, 0);
  const eligibleUnits = rows.reduce((sum, row) => sum + row.eligibleUnits, 0);
  const eligibleOrders = orderIds ? new Set(orderIds).size : rows.reduce((sum, row) => sum + row.eligibleOrders, 0);
  const totalCoverage = coverage.eligibleRevenue + coverage.excludedRevenue;
  return { verifiedRevenue, verifiedContribution, eligibleUnits, eligibleOrders, asp: eligibleUnits > 0 ? verifiedRevenue / eligibleUnits : null, contributionMarginPct: verifiedRevenue > 0 ? verifiedContribution / verifiedRevenue * 100 : null, verifiedRevenueCoveragePct: totalCoverage > 0 ? coverage.eligibleRevenue / totalCoverage : null };
}

export async function collectPaginated<T>(fetchPage: (from: number, to: number) => Promise<T[]>, pageSize = 500): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0;; from += pageSize) { const page = await fetchPage(from, from + pageSize - 1); rows.push(...page); if (page.length < pageSize) return rows; }
}

export function compareProductProfitability(current: ProductProfitabilitySummary, previous: ProductProfitabilitySummary | null): ProductProfitabilityComparison | null {
  if (!previous) return null;
  return { revenueChange: change(current.verifiedRevenue, previous.verifiedRevenue), contributionChange: change(current.verifiedContribution, previous.verifiedContribution), unitsChange: change(current.eligibleUnits, previous.eligibleUnits), marginPpChange: current.contributionMarginPct === null || previous.contributionMarginPct === null ? null : current.contributionMarginPct - previous.contributionMarginPct };
}

export function filterAndSortProductProfitability(rows: ProductProfitability[], search: string, sort: ProfitabilitySort): ProductProfitability[] {
  const query = search.trim().toLocaleLowerCase();
  const value = (row: ProductProfitability) => sort === "revenue" ? row.verifiedRevenue : sort === "units" ? row.eligibleUnits : sort === "margin" ? row.contributionMarginPct ?? -Infinity : row.contribution;
  return rows.filter((row) => !query || row.productName.toLocaleLowerCase().includes(query)).sort((a, b) => value(b) - value(a) || a.productName.localeCompare(b.productName));
}
