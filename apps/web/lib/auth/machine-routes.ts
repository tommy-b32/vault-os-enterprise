export const GOVERNED_DECISION_MEMORY_CAPTURE_PATH =
  "/api/internal/governed-decision-memory/capture";
export const SALES_WORKBOOK_DEFERRED_RETRY_PATH =
  "/api/internal/sales-workbook/deferred-retry";
export const SALES_WORKBOOK_DEFERRED_RETRY_HEALTH_PATH =
  "/api/internal/sales-workbook/deferred-retry/health";

const MACHINE_ROUTE_PATHS = new Set([
  GOVERNED_DECISION_MEMORY_CAPTURE_PATH,
  SALES_WORKBOOK_DEFERRED_RETRY_PATH,
  SALES_WORKBOOK_DEFERRED_RETRY_HEALTH_PATH,
]);

export function bypassesInteractiveAuthentication(pathname: string): boolean {
  return MACHINE_ROUTE_PATHS.has(pathname);
}
