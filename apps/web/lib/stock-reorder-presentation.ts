import type { FixedPackPurchaseReasonCode } from "@/lib/brain/FixedPackPurchaseRecommendationEngine";

export const STAGE_3_TOTAL_TARGET_DAYS = 45;
export const STAGE_3_ATTENTION_BUFFER_DAYS = 7;

export type Stage3StockState = "INSUFFICIENT DATA" | "OUT OF STOCK" | "REORDER NOW" | "REORDER ATTENTION" | "HEALTHY" | "SLOW MOVING / NO RECENT VELOCITY";
export type Stage3PackFit = "GOOD FIT" | "ACCEPTABLE" | "REVIEW" | "DO NOT REORDER";

export type Stage3SizePresentationEvidence = { netAvailableStock: number; calculatedDailyDemand: number; projectedDaysCover: number | null; remainingShortage: number; projectedExcess: number; drivesPackNeed: boolean; reasonCodes: readonly FixedPackPurchaseReasonCode[] };
export type Stage3RecommendationPresentation = { trusted: boolean; recommendedPackCount: number | null; totalShortageRemainingUnits: number | null; totalPackShapeExcessUnits: number | null; warnings: readonly FixedPackPurchaseReasonCode[]; reasonCodes: readonly FixedPackPurchaseReasonCode[]; sizes: readonly Stage3SizePresentationEvidence[]; governedLeadTimeDays: number | null };

export function stage3TargetStockDays(governedLeadTimeDays: number | null): number | null {
  if (governedLeadTimeDays === null || !Number.isFinite(governedLeadTimeDays) || governedLeadTimeDays <= 0) return null;
  return Math.max(0, STAGE_3_TOTAL_TARGET_DAYS - governedLeadTimeDays);
}

export function stage3AttentionThresholdDays(governedLeadTimeDays: number | null): number | null {
  if (governedLeadTimeDays === null || !Number.isFinite(governedLeadTimeDays) || governedLeadTimeDays <= 0) return null;
  return governedLeadTimeDays + STAGE_3_ATTENTION_BUFFER_DAYS;
}

export function stage3CurrentDaysCover(size: Pick<Stage3SizePresentationEvidence, "netAvailableStock" | "calculatedDailyDemand">): number | null {
  return size.calculatedDailyDemand > 0 ? Math.max(0, size.netAvailableStock) / size.calculatedDailyDemand : null;
}

export function stage3PrimaryReason(reasons: readonly string[], zeroDemandDominant = false): string | null {
  return zeroDemandDominant || reasons.includes("ZERO_DEMAND") ? "No recent sales demand currently justifies replenishment for this colour/design." : null;
}

export function stage3StockState(input: Stage3RecommendationPresentation): Stage3StockState {
  if (!input.trusted || input.recommendedPackCount === null || input.governedLeadTimeDays === null) return "INSUFFICIENT DATA";
  const relevant = input.sizes.filter((size) => size.calculatedDailyDemand > 0);
  if (relevant.length === 0 || input.reasonCodes.includes("ZERO_DEMAND")) return "SLOW MOVING / NO RECENT VELOCITY";
  if (relevant.some((size) => size.netAvailableStock <= 0)) return "OUT OF STOCK";
  const lowestCover = Math.min(...relevant.map((size) => stage3CurrentDaysCover(size) as number));
  if (lowestCover <= input.governedLeadTimeDays) return "REORDER NOW";
  const attention = stage3AttentionThresholdDays(input.governedLeadTimeDays);
  if (attention !== null && lowestCover <= attention) return "REORDER ATTENTION";
  return "HEALTHY";
}

export function stage3PackFit(input: Stage3RecommendationPresentation): Stage3PackFit | null {
  if (!input.trusted || input.recommendedPackCount === null) return null;
  if (input.recommendedPackCount === 0) return "DO NOT REORDER";
  const reasons = new Set([...input.reasonCodes, ...input.warnings]);
  if ((input.totalShortageRemainingUnits ?? 0) > 0 || reasons.has("SHORTAGE_REMAINS_AFTER_SELECTED_PACKS") || reasons.has("CANDIDATE_RANGE_EXHAUSTED")) return "REVIEW";
  if ((input.totalPackShapeExcessUnits ?? 0) > 0 || reasons.has("PACK_SHAPE_EXCESS") || reasons.has("MOQ_INDUCED_EXCESS")) return "ACCEPTABLE";
  return "GOOD FIT";
}
