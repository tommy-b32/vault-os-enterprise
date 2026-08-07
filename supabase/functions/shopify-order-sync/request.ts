export type OrderSyncRequest =
  | { mode: "reconciliation" }
  | {
      mode: "historical_backfill";
      createdFrom: string;
      createdBefore: string;
    };

const ISO_8601_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function timestamp(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    !ISO_8601_TIMESTAMP.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new Error(`${field} must be a valid ISO-8601 timestamp`);
  }

  return value;
}

export function parseOrderSyncRequest(value: unknown): OrderSyncRequest {
  if (value === null || value === undefined) return { mode: "reconciliation" };
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Request body must be a JSON object");
  }

  const body = value as Record<string, unknown>;
  const hasFrom = body.created_from !== undefined;
  const hasBefore = body.created_before !== undefined;
  if (!hasFrom && !hasBefore) return { mode: "reconciliation" };
  if (!hasFrom || !hasBefore) {
    throw new Error("created_from and created_before must be supplied together");
  }

  const createdFrom = timestamp(body.created_from, "created_from");
  const createdBefore = timestamp(body.created_before, "created_before");
  if (Date.parse(createdFrom) >= Date.parse(createdBefore)) {
    throw new Error("created_from must be earlier than created_before");
  }

  return { mode: "historical_backfill", createdFrom, createdBefore };
}
