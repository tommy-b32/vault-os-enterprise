import type { VerifiedShopifyOrderFinancial } from "@/lib/business/ShopifyFinancialReadModelRepository";

const BUSINESS_TIME_ZONE = "Europe/London";

export const FINANCIAL_PERIODS = ["today", "7d", "30d", "90d"] as const;
export type FinancialPeriod = (typeof FINANCIAL_PERIODS)[number];
export type FinancialRange = { from: string; to: string };
export type CanonicalFinancialCoverageOrder = { id: string; createdAt: string; currency: string; canonicalNetRevenue: number };
export type FinancialIntelligenceSnapshot = {
  range: FinancialRange;
  verifiedNetRevenue: number;
  verifiedOrderCount: number;
  canonicalOrderCount: number;
  excludedOrderCount: number;
  incompleteOrderCount: number;
  refundHeaderTotal: number;
  unreconciledRefundOrderCount: number;
  coverageComplete: boolean;
  reconciliationPassed: boolean;
  currencyCodes: string[];
};

function localParts(date: Date) {
  const parts = new Map(new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date).map((part) => [part.type, part.value]));
  return { year: Number(parts.get("year")), month: Number(parts.get("month")), day: Number(parts.get("day")), hour: Number(parts.get("hour")), minute: Number(parts.get("minute")), second: Number(parts.get("second")) };
}

function londonMidnight(year: number, month: number, day: number): Date {
  const utc = new Date(Date.UTC(year, month - 1, day));
  const offset = (date: Date) => { const p = localParts(date); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime(); };
  let result = new Date(utc.getTime() - offset(utc));
  result = new Date(utc.getTime() - offset(result));
  return result;
}

function shiftDay(parts: { year: number; month: number; day: number }, days: number) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function financialPeriodFromSearch(value: string | undefined): FinancialPeriod {
  return FINANCIAL_PERIODS.includes(value as FinancialPeriod) ? value as FinancialPeriod : "30d";
}

export function financialRangeForPeriod(period: FinancialPeriod, now = new Date()): FinancialRange {
  const today = localParts(now);
  const days = period === "today" ? 0 : Number.parseInt(period, 10) - 1;
  const first = shiftDay(today, -days);
  const tomorrow = shiftDay(today, 1);
  return { from: londonMidnight(first.year, first.month, first.day).toISOString(), to: londonMidnight(tomorrow.year, tomorrow.month, tomorrow.day).toISOString() };
}

export function buildFinancialIntelligenceSnapshot(range: FinancialRange, canonicalOrders: readonly CanonicalFinancialCoverageOrder[], verifiedOrders: readonly VerifiedShopifyOrderFinancial[]): FinancialIntelligenceSnapshot {
  const rangeFrom = Date.parse(range.from);
  const rangeTo = Date.parse(range.to);
  if (!Number.isFinite(rangeFrom) || !Number.isFinite(rangeTo) || rangeFrom >= rangeTo) throw new Error("Invalid Financial Intelligence date range");
  const canonical = new Map<string, CanonicalFinancialCoverageOrder>();
  for (const order of canonicalOrders) {
    if (!order.id || canonical.has(order.id) || !Number.isFinite(order.canonicalNetRevenue) || !Number.isFinite(Date.parse(order.createdAt)) || !/^[A-Z]{3}$/.test(order.currency)) throw new Error("Canonical Shopify financial coverage is invalid");
    canonical.set(order.id, order);
  }
  const verified = new Map<string, VerifiedShopifyOrderFinancial>();
  for (const order of verifiedOrders) {
    const matchingCanonical = canonical.get(order.orderId);
    if (!matchingCanonical || matchingCanonical.currency !== "GBP" || verified.has(order.orderId) || Math.abs(matchingCanonical.canonicalNetRevenue - order.canonicalNetRevenue) > 0.000001) throw new Error("Verified Shopify financial reconciliation failed");
    verified.set(order.orderId, order);
  }
  const excludedOrderCount = [...canonical.values()].filter((order) => order.currency !== "GBP").length;
  const incompleteOrderCount = [...canonical.values()].filter((order) => order.currency === "GBP" && !verified.has(order.id)).length;
  const verifiedRecords = [...verified.values()];
  return {
    range,
    verifiedNetRevenue: verifiedRecords.reduce((sum, order) => sum + order.canonicalNetRevenue, 0),
    verifiedOrderCount: verifiedRecords.length,
    canonicalOrderCount: canonical.size,
    excludedOrderCount,
    incompleteOrderCount,
    refundHeaderTotal: verifiedRecords.reduce((sum, order) => sum + order.refundTotal, 0),
    unreconciledRefundOrderCount: verifiedRecords.filter((order) => order.refundReconciliationStatus === "unreconciled").length,
    coverageComplete: canonical.size === verifiedRecords.length,
    reconciliationPassed: canonical.size === verifiedRecords.length && excludedOrderCount === 0 && incompleteOrderCount === 0,
    currencyCodes: [...new Set(canonicalOrders.map((order) => order.currency))].sort(),
  };
}
