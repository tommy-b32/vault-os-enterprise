export const REFRESH_DEBOUNCE_MS = 750;
export const RECOVERY_REFRESH_MS = 90_000;

export type RefreshRequestDecision = "debounce" | "queue" | "defer";

export function decideRefreshRequest({
  hidden,
  online,
  refreshInFlight,
}: {
  hidden: boolean;
  online: boolean;
  refreshInFlight: boolean;
}): RefreshRequestDecision {
  if (hidden || !online) return "defer";
  if (refreshInFlight) return "queue";
  return "debounce";
}

export function shouldScheduleFinalRefresh(refreshQueued: boolean): boolean {
  return refreshQueued;
}
