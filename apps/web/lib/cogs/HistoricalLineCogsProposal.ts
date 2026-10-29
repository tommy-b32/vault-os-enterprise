export const HISTORICAL_COGS_PREFILL = {
  orderNumber: "1336",
  lineId: "93061d97-9d55-467b-ae9d-15c9590b899b",
  lineTitle: "Valentino Tee's",
  variantTitle: "Black / L",
  quantity: 1,
  deliveryBatchId: "eabb625c-4da1-4a30-9f41-b8a1e6f8bec7",
  deliveryReference: "TFV-HIST-20260910-EXTEE",
  unitLandedCogsGbp: 11.0730,
  attestation: "One Valentino Tee Black/L sold in order #1336 was supplied from approved Exclusive delivery TFV-HIST-20260910-EXTEE, received 10 September 2026. The verified landed unit cost is £553.65 / 50 = £11.0730.",
} as const;

export type HistoricalCogsDecision = "APPROVED" | "REJECTED";

export function isHistoricalCogsDecision(value: unknown): value is HistoricalCogsDecision {
  return value === "APPROVED" || value === "REJECTED";
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isNonEmptyNote(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 2_000;
}
