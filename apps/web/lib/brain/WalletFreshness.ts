export type WalletFreshnessStatus = "current" | "stale" | "unknown";

export type WalletFreshnessEvaluation = {
  status: WalletFreshnessStatus;
  evidenceTimestamp: string | null;
  thresholdMinutes: number | null;
  evaluatedAt: string;
  reason: string;
  provenance: "vault_purchasing_policy";
};

export function evaluateWalletFreshness({
  evidenceTimestamp,
  thresholdMinutes,
  evaluatedAt = new Date().toISOString(),
}: {
  evidenceTimestamp: string | null;
  thresholdMinutes: number | null;
  evaluatedAt?: string;
}): WalletFreshnessEvaluation {
  const base = {
    evidenceTimestamp,
    thresholdMinutes,
    evaluatedAt,
    provenance: "vault_purchasing_policy" as const,
  };
  const evidenceTime = evidenceTimestamp === null ? Number.NaN : Date.parse(evidenceTimestamp);
  const evaluationTime = Date.parse(evaluatedAt);

  if (
    !Number.isFinite(evidenceTime) ||
    !Number.isFinite(evaluationTime) ||
    thresholdMinutes === null ||
    !Number.isFinite(thresholdMinutes) ||
    thresholdMinutes <= 0
  ) {
    return {
      ...base,
      status: "unknown",
      reason: "Wallet freshness cannot be evaluated because its timestamp or canonical threshold is unavailable.",
    };
  }

  const ageMinutes = Math.max(0, (evaluationTime - evidenceTime) / 60_000);
  return ageMinutes <= thresholdMinutes
    ? {
        ...base,
        status: "current",
        reason: `Wallet evidence is ${Math.floor(ageMinutes)} minutes old and within the ${thresholdMinutes}-minute policy.`,
      }
    : {
        ...base,
        status: "stale",
        reason: `Wallet evidence is ${Math.floor(ageMinutes)} minutes old and exceeds the ${thresholdMinutes}-minute policy.`,
      };
}

export const WalletFreshness = { evaluate: evaluateWalletFreshness } as const;
