import "server-only";

import { normalizeWorkbookOrderNumber } from "./WorkbookParser";

export const BACKFILL_TARGET_ORDER_NUMBERS = Array.from({ length: 79 }, (_, index) => String(1251 + index));

const normalizeOrderNumber = (value: string) => normalizeWorkbookOrderNumber(value);

/**
 * Limits event-driven workbook work to the orders named by the completed
 * ingestion event.  The historic backfill scope above remains intentionally
 * unchanged for the operator backfill workflow.
 */
export function affectedOrderCandidateScope(orderNumbers: Iterable<string>, existingWorkbookOrderNumbers: Iterable<string> = [], maxOrders = 25) {
  const existing = new Set<string>();
  for (const value of existingWorkbookOrderNumbers) {
    const normalized = normalizeOrderNumber(value);
    if (normalized) existing.add(normalized);
  }
  const requested = new Set<string>();
  for (const value of orderNumbers) {
    const normalized = normalizeOrderNumber(value);
    if (normalized) requested.add(normalized);
  }
  if (!requested.size || requested.size > maxOrders) throw new Error("Invalid affected Sales workbook order scope");
  const candidateOrderNumbers = [...requested].filter((orderNumber) => !existing.has(orderNumber)).sort((left, right) => Number(left) - Number(right));
  return {
    candidateOrderNumbers,
    excludedExistingOrderCount: requested.size - candidateOrderNumbers.length,
  };
}

export function backfillCandidateScope(existingWorkbookOrderNumbers: Iterable<string> = []) {
  const existing = new Set<string>();
  for (const value of existingWorkbookOrderNumbers) {
    const normalized = normalizeWorkbookOrderNumber(value);
    if (normalized) existing.add(normalized);
  }
  const candidateOrderNumbers = BACKFILL_TARGET_ORDER_NUMBERS.filter((orderNumber) => !existing.has(orderNumber));
  return {
    candidateOrderNumbers,
    excludedExistingOrderCount: BACKFILL_TARGET_ORDER_NUMBERS.length - candidateOrderNumbers.length,
  };
}
