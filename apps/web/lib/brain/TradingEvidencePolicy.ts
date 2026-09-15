export const TRADING_EVIDENCE_POLICY = {
  learningMaxVerifiedLiveDays: 6,
  sufficientVerifiedLiveDays: 28,
  sufficientContinuousCoverageDays: 28,
  canonicalOrderEvidenceMaxAgeMinutes: 30,
  strongEarlyDemandUnits: 12,
  strongEarlyDemandSellingDays: 3,
} as const;

export type TradingEvidenceState = "LEARNING" | "DEVELOPING_EVIDENCE" | "SUFFICIENT_EVIDENCE" | "UNKNOWN";

export type TradingEvidence = {
  state: TradingEvidenceState;
  reason: string;
  verifiedLiveDays: number | null;
  verifiedCoverageDays: number | null;
  coverageComplete: boolean;
  orderEvidenceFresh: boolean;
  firstPositiveSaleAt: string | null;
  sellingDays: number | null;
  unitsSinceLive: number | null;
};

export function classifyTradingEvidence(input: Omit<TradingEvidence, "state" | "reason">): Pick<TradingEvidence, "state" | "reason"> {
  if (input.verifiedLiveDays === null || input.verifiedCoverageDays === null || !input.coverageComplete || !input.orderEvidenceFresh) {
    return { state: "UNKNOWN", reason: "Trading history not yet verified." };
  }
  if (input.verifiedLiveDays <= TRADING_EVIDENCE_POLICY.learningMaxVerifiedLiveDays) {
    return { state: "LEARNING", reason: "Gathering trading evidence." };
  }
  if (
    input.verifiedLiveDays < TRADING_EVIDENCE_POLICY.sufficientVerifiedLiveDays ||
    input.verifiedCoverageDays < TRADING_EVIDENCE_POLICY.sufficientContinuousCoverageDays
  ) {
    return { state: "DEVELOPING_EVIDENCE", reason: "Trading evidence is still developing." };
  }
  return { state: "SUFFICIENT_EVIDENCE", reason: "Verified trading evidence is sufficient." };
}

export function hasStrongEarlyDemand(evidence: TradingEvidence): boolean {
  return evidence.state !== "SUFFICIENT_EVIDENCE" &&
    (evidence.unitsSinceLive ?? 0) >= TRADING_EVIDENCE_POLICY.strongEarlyDemandUnits &&
    (evidence.sellingDays ?? 0) >= TRADING_EVIDENCE_POLICY.strongEarlyDemandSellingDays;
}
