export const ORDER_STALE_AFTER_MS = 30 * 60 * 1000;

export type OrderFreshnessState = "current" | "stale" | "unavailable";

export function deriveOrderFreshness(
  latestSyncAt: string | null,
  now = new Date(),
): OrderFreshnessState {
  if (!latestSyncAt) return "unavailable";
  const observedAt = Date.parse(latestSyncAt);
  if (!Number.isFinite(observedAt)) return "stale";
  return now.getTime() - observedAt > ORDER_STALE_AFTER_MS ? "stale" : "current";
}
