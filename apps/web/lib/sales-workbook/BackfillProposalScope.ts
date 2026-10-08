import "server-only";

import { normalizeWorkbookOrderNumber } from "./WorkbookParser";

export const BACKFILL_TARGET_ORDER_NUMBERS = Array.from({ length: 79 }, (_, index) => String(1251 + index));

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
