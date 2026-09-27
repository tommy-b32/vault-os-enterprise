export type StockUrgency = "INSUFFICIENT DATA" | "OUT OF STOCK" | "REORDER NOW" | "REORDER ATTENTION" | "HEALTHY" | "SLOW MOVING / NO RECENT VELOCITY";
export type PackFit = "GOOD FIT" | "ACCEPTABLE" | "REVIEW";
export type PlanningState = "ALLOCATED" | "DEFERRED — BUDGET" | "BLOCKED — BUDGET" | "BLOCKED — WALLET" | "BLOCKED — COST EVIDENCE";

export type StockPurchasingPlanCandidate = {
  recommendationId: string;
  supplierId: string;
  supplierName: string | null;
  styleId: string;
  parentProductId: string;
  productName: string | null;
  modelDesign: string;
  trusted: boolean;
  recommendedPackCount: number | null;
  recommendedTotalUnits: number | null;
  landedCostPerPackGbp: number | null;
  stockState: StockUrgency;
  packFit: PackFit | null;
  currentCoverDays: number | null;
  demandPressure: number;
  leadTimeDays: number;
  totalShortageRemainingUnits: number;
  totalProjectedExcessUnits: number;
  reasonCodes: readonly string[];
};
export type StockPurchasingPlanItem = StockPurchasingPlanCandidate & { estimatedLandedCostGbp: number | null; planningState: PlanningState; planningReason: string };
export type StockPurchasingPlan = { budgetGbp: number | null; walletCapacityGbp: number | null; usableCapacityGbp: number | null; identifiedCostGbp: number; allocatedCostGbp: number; deferredCostGbp: number; unallocatedBudgetGbp: number | null; items: StockPurchasingPlanItem[] };

const urgencyRank: Record<StockUrgency, number> = { "OUT OF STOCK": 0, "REORDER NOW": 1, "REORDER ATTENTION": 2, "HEALTHY": 3, "SLOW MOVING / NO RECENT VELOCITY": 4, "INSUFFICIENT DATA": 5 };
const fitRank: Record<PackFit, number> = { "GOOD FIT": 0, ACCEPTABLE: 1, REVIEW: 2 };
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function usablePlanningCapacity(budgetGbp: number | null, walletCapacityGbp: number | null): number | null {
  if (budgetGbp === null || walletCapacityGbp === null || !Number.isFinite(budgetGbp) || !Number.isFinite(walletCapacityGbp) || budgetGbp < 0 || walletCapacityGbp < 0) return null;
  return Math.min(budgetGbp, walletCapacityGbp);
}

const usableConstraint = (value: number | null) => value !== null && Number.isFinite(value) && value >= 0;

export function planningAvailabilityMessage(budgetGbp: number | null, walletCapacityGbp: number | null): string | null {
  if (!usableConstraint(budgetGbp)) return "Set a Stock Purchasing Budget before allocating replenishment. This is a planning constraint, not cash.";
  if (!usableConstraint(walletCapacityGbp)) return "Authoritative purchasing-wallet capacity is unavailable; replenishment cannot be allocated.";
  return null;
}

export function buildStockPurchasingPlan(candidates: readonly StockPurchasingPlanCandidate[], budgetGbp: number | null, walletCapacityGbp: number | null): StockPurchasingPlan {
  const capacity = usablePlanningCapacity(budgetGbp, walletCapacityGbp);
  const prepared = candidates.map((candidate) => ({ ...candidate, estimatedLandedCostGbp: candidate.landedCostPerPackGbp !== null && candidate.recommendedPackCount !== null && candidate.landedCostPerPackGbp > 0 && candidate.recommendedPackCount > 0 ? money(candidate.landedCostPerPackGbp * candidate.recommendedPackCount) : null }))
    .filter((candidate) => candidate.trusted && (candidate.recommendedPackCount ?? 0) > 0 && (candidate.recommendedTotalUnits ?? 0) > 0)
    .sort((a, b) => urgencyRank[a.stockState] - urgencyRank[b.stockState] || fitRank[a.packFit ?? "REVIEW"] - fitRank[b.packFit ?? "REVIEW"] || b.demandPressure - a.demandPressure || (a.currentCoverDays ?? Number.POSITIVE_INFINITY) - (b.currentCoverDays ?? Number.POSITIVE_INFINITY) || a.recommendationId.localeCompare(b.recommendationId));
  let remaining = capacity;
  const items = prepared.map((candidate): StockPurchasingPlanItem => {
    if (candidate.estimatedLandedCostGbp === null) return { ...candidate, planningState: "BLOCKED — COST EVIDENCE", planningReason: "Governed landed-cost evidence is incomplete." };
    if (remaining === null) {
      const availabilityMessage = planningAvailabilityMessage(budgetGbp, walletCapacityGbp);
      return {
        ...candidate,
        planningState: !usableConstraint(budgetGbp) ? "BLOCKED — BUDGET" : "BLOCKED — WALLET",
        planningReason: availabilityMessage ?? "Planning capacity is unavailable.",
      };
    }
    if (candidate.estimatedLandedCostGbp <= remaining) { remaining = money(remaining - candidate.estimatedLandedCostGbp); return { ...candidate, planningState: "ALLOCATED", planningReason: "The complete governed recommendation fits the remaining planning capacity." }; }
    return { ...candidate, planningState: capacity === budgetGbp && (walletCapacityGbp ?? 0) >= (budgetGbp ?? 0) ? "DEFERRED — BUDGET" : "BLOCKED — WALLET", planningReason: "The complete governed recommendation does not fit remaining capacity; quantities were not changed." };
  });
  const identifiedCostGbp = money(items.reduce((sum, item) => sum + (item.estimatedLandedCostGbp ?? 0), 0));
  const allocatedCostGbp = money(items.filter((item) => item.planningState === "ALLOCATED").reduce((sum, item) => sum + (item.estimatedLandedCostGbp ?? 0), 0));
  return { budgetGbp, walletCapacityGbp, usableCapacityGbp: capacity, identifiedCostGbp, allocatedCostGbp, deferredCostGbp: money(identifiedCostGbp - allocatedCostGbp), unallocatedBudgetGbp: remaining, items };
}
