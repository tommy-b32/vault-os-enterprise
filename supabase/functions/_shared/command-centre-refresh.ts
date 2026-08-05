import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

type VaultSupabaseClient = SupabaseClient<
  any,
  "public",
  "public",
  any,
  any
>;

const EVENT_TYPES_BY_DOMAIN = {
  trading: new Set(["order-sync-completed", "order-created-completed", "order-updated-completed"]),
  inventory: new Set(["inventory-sync-started", "inventory-sync-completed", "inventory-sync-failed"]),
  fulfilment: new Set(["fulfilment-sync-completed"]),
  refund: new Set(["refund-sync-completed"]),
} as const;

type EdgeRefreshDomain = keyof typeof EVENT_TYPES_BY_DOMAIN;

function sanitize(value: string, maximumLength: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maximumLength);
}

export async function emitCommandCentreRefreshEvent({
  supabase,
  domain,
  eventType,
  entityId = null,
  source,
}: {
  supabase: VaultSupabaseClient;
  domain: EdgeRefreshDomain;
  eventType: string;
  entityId?: string | null;
  source: string;
}): Promise<void> {
  const cleanEventType = sanitize(eventType, 100);
  const cleanEntityId = entityId ? sanitize(entityId, 200) : null;
  const cleanSource = sanitize(source, 100);

  if (!EVENT_TYPES_BY_DOMAIN[domain].has(cleanEventType as never) || !cleanSource) {
    console.warn("[Command Centre Refresh] Invalid signal rejected", { domain, eventType: cleanEventType });
    return;
  }

  try {
    const { error } = await supabase
      .from("vault_command_centre_refresh_events")
      .insert({
        domain,
        event_type: cleanEventType,
        entity_id: cleanEntityId,
        source: cleanSource,
      });

    if (error) {
      console.warn("[Command Centre Refresh] Signal write failed", {
        domain,
        eventType: cleanEventType,
        code: error.code,
      });
    }
  } catch (error) {
    console.warn("[Command Centre Refresh] Signal emission failed safely", {
      domain,
      eventType: cleanEventType,
      reason: error instanceof Error ? error.name : "unknown",
    });
  }
}
