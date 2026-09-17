export const GOVERNED_DECISION_MEMORY_CAPTURE_PATH =
  "/api/internal/governed-decision-memory/capture";

export function bypassesInteractiveAuthentication(pathname: string): boolean {
  return pathname === GOVERNED_DECISION_MEMORY_CAPTURE_PATH;
}
