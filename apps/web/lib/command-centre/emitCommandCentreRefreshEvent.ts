import "server-only";

import {
  COMMAND_CENTRE_REFRESH_EVENT_TYPES,
  type CommandCentreRefreshDomain,
} from "@/lib/command-centre/CommandCentreRefreshEvents";
import { supabaseAdmin } from "@/lib/supabase-admin";

type EmitCommandCentreRefreshEventInput<
  Domain extends CommandCentreRefreshDomain,
> = {
  domain: Domain;
  eventType: (typeof COMMAND_CENTRE_REFRESH_EVENT_TYPES)[Domain][number];
  entityId?: string | null;
  source: string;
};

function sanitize(value: string, maximumLength: number): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maximumLength);
}

export async function emitCommandCentreRefreshEvent<
  Domain extends CommandCentreRefreshDomain,
>({
  domain,
  eventType,
  entityId = null,
  source,
}: EmitCommandCentreRefreshEventInput<Domain>): Promise<void> {
  const expected = COMMAND_CENTRE_REFRESH_EVENT_TYPES[domain] as readonly string[];
  const cleanEventType = sanitize(eventType, 100);
  const cleanSource = sanitize(source, 100);
  const cleanEntityId = entityId ? sanitize(entityId, 200) : null;

  if (!expected.includes(cleanEventType) || !cleanSource || (entityId && !cleanEntityId)) {
    console.warn("Command Centre refresh signal rejected", { domain, eventType: cleanEventType });
    return;
  }

  try {
    const { error } = await supabaseAdmin
      .from("vault_command_centre_refresh_events")
      .insert({
        domain,
        event_type: cleanEventType,
        entity_id: cleanEntityId,
        source: cleanSource,
      });

    if (error) {
      console.warn("Command Centre refresh signal could not be recorded", {
        domain,
        eventType: cleanEventType,
        code: error.code,
      });
    }
  } catch (error) {
    console.warn("Command Centre refresh signal emission failed safely", {
      domain,
      eventType: cleanEventType,
      reason: error instanceof Error ? error.name : "unknown",
    });
  }
}
