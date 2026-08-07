export type DemandStatus = "ACTIVE" | "SLOW" | "DORMANT" | "NO_EVIDENCE";
export type DemandUrgency = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type DemandDetectionInput = {
  sold7d: number | null;
  sold14d: number | null;
  sold30d: number | null;
  daysSinceLastSale: number | null;
  canonicalHistoryComplete: boolean;
};

export type UrgencyInput = {
  currentStock: number;
  netAvailableStock: number;
  supplierLeadTimeDays: number;
  targetStockDays: number;
  unitsPerPack: number;
};

export function detectDemand(input: DemandDetectionInput): {
  demand_status: DemandStatus;
  demand_reason: string;
} {
  if (
    !input.canonicalHistoryComplete ||
    input.sold7d === null ||
    input.sold14d === null ||
    input.sold30d === null ||
    (input.sold30d > 0 && input.daysSinceLastSale === null)
  ) {
    return {
      demand_status: "NO_EVIDENCE",
      demand_reason: "Canonical 30-day sales history is unavailable or incomplete.",
    };
  }

  if (
    input.sold7d > 0 ||
    (input.sold14d >= 2 && (input.daysSinceLastSale ?? Number.POSITIVE_INFINITY) <= 14)
  ) {
    return {
      demand_status: "ACTIVE",
      demand_reason: input.sold7d > 0
        ? `${input.sold7d} units sold in the last 7 days.`
        : `${input.sold14d} units sold in 14 days; last sale ${input.daysSinceLastSale} days ago.`,
    };
  }

  if (input.sold30d > 0 && (input.daysSinceLastSale ?? Number.POSITIVE_INFINITY) <= 30) {
    return {
      demand_status: "SLOW",
      demand_reason: `${input.sold30d} units sold in 30 days; last sale ${input.daysSinceLastSale} days ago.`,
    };
  }

  return {
    demand_status: "DORMANT",
    demand_reason: input.sold30d === 0
      ? "No units sold in the complete 30-day window."
      : `Last sale was ${input.daysSinceLastSale} days ago.`,
  };
}

export function scoreUrgency(input: UrgencyInput): {
  urgency: DemandUrgency;
  urgency_reason: string;
} {
  const availablePacks = Math.max(0, input.netAvailableStock) / input.unitsPerPack;
  const stockPressure = input.netAvailableStock <= 0
    ? 60
    : availablePacks < 1
      ? 40
      : availablePacks < 2
        ? 25
        : 5;
  const currentStockPressure = input.currentStock <= 0 ? 15 : input.currentStock <= 1 ? 10 : 0;
  const leadTimePressure = input.supplierLeadTimeDays >= 14 ? 15 : input.supplierLeadTimeDays >= 7 ? 10 : 5;
  const targetCoverPressure = input.targetStockDays >= 30 ? 10 : input.targetStockDays >= 14 ? 7 : 3;
  const urgencyScore = stockPressure + currentStockPressure + leadTimePressure + targetCoverPressure;
  const urgency: DemandUrgency = urgencyScore >= 75
    ? "CRITICAL"
    : urgencyScore >= 55
      ? "HIGH"
      : urgencyScore >= 35
        ? "MEDIUM"
        : "LOW";

  return {
    urgency,
    urgency_reason: `${input.currentStock} on hand, ${input.netAvailableStock} net available (${availablePacks.toFixed(1)} packs), ${input.supplierLeadTimeDays}-day lead time and ${input.targetStockDays} target days.`,
  };
}

export const DemandLifecycleEngine = { detect: detectDemand, urgency: scoreUrgency } as const;
