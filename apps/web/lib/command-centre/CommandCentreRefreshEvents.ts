export const COMMAND_CENTRE_REFRESH_EVENT_TYPES = {
  trading: [
    "order-sync-completed",
    "order-created-completed",
    "order-updated-completed",
  ],
  inventory: [
    "inventory-sync-started",
    "inventory-sync-completed",
    "inventory-sync-failed",
  ],
  fulfilment: ["fulfilment-sync-completed"],
  refund: ["refund-sync-completed"],
  finance: ["cash-transaction-created", "purchasing-policy-updated"],
  purchasing: ["purchase-order-commitment-changed"],
  catalogue: ["product-settings-updated", "commercial-costs-updated"],
  supplier: ["supplier-rules-updated"],
  "advisor-input": [
    "reorder-approval-approved",
    "reorder-approval-revoked",
  ],
} as const;

export type CommandCentreRefreshDomain =
  keyof typeof COMMAND_CENTRE_REFRESH_EVENT_TYPES;

export type CommandCentreRefreshEventType<
  Domain extends CommandCentreRefreshDomain = CommandCentreRefreshDomain,
> = (typeof COMMAND_CENTRE_REFRESH_EVENT_TYPES)[Domain][number];

export type CommandCentreRefreshEventRow = {
  domain: string;
  event_type: string;
  entity_id?: string | null;
  occurred_at?: string;
  source?: string;
};

export function isCommandCentreRefreshDomain(
  value: string,
): value is CommandCentreRefreshDomain {
  return Object.hasOwn(COMMAND_CENTRE_REFRESH_EVENT_TYPES, value);
}

export function isCommandCentreRefreshEvent(
  value: unknown,
): value is CommandCentreRefreshEventRow {
  if (!value || typeof value !== "object") return false;

  const row = value as Record<string, unknown>;
  if (typeof row.domain !== "string" || !isCommandCentreRefreshDomain(row.domain)) {
    return false;
  }
  if (typeof row.event_type !== "string") return false;

  const expected = COMMAND_CENTRE_REFRESH_EVENT_TYPES[row.domain] as readonly string[];
  return expected.includes(row.event_type);
}
