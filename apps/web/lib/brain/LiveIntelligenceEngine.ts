import type {
  BusinessEvent,
  BusinessEventResult,
} from "@/lib/brain/BusinessEventEngine";

import type {
  BusinessNarration,
  BusinessNarrative,
} from "@/lib/brain/BusinessEventNarrator";

import type {
  NarratorFinding,
  NarratorStory,
} from "@/lib/brain/NarratorEngine";

import type {
  VaultBrainDataSource,
  VaultBrainSignalTone,
} from "@/lib/brain/types";

/* ============================================================
   LIVE INTELLIGENCE CONTRACTS
============================================================ */

export type LiveIntelligenceEventType =
  | "observation"
  | "change"
  | "warning"
  | "recommendation"
  | "mission";

export type LiveIntelligenceEvent = {
  id: string;

  source: VaultBrainDataSource;
  sourceLabel: string;

  type: LiveIntelligenceEventType;
  tone: VaultBrainSignalTone;

  title: string;
  description: string;

  occurredAt: string;
  displayTime: string;

  confidence: number;
  priority: number;

  actionLabel?: string;
  actionHref?: string;
};

export type LiveIntelligenceFeed = {
  generatedAt: string;

  events:
    LiveIntelligenceEvent[];

  highestPriorityEvent:
    LiveIntelligenceEvent | null;

  confidence: number;
};

type BuildFeedInput = {
  story: NarratorStory;
  maximumEvents?: number;
};

type BuildBusinessFeedInput = {
  result: BusinessEventResult;
  narration?: BusinessNarration;
  maximumEvents?: number;
};

/* ============================================================
   SOURCE METADATA
============================================================ */

const SOURCE_LABELS: Record<
  VaultBrainDataSource,
  string
> = {
  shopify:
    "Trading Intelligence",

  inventory:
    "Inventory Intelligence",

  commercial:
    "Commercial Intelligence",

  supplier:
    "Supplier Intelligence",

  catalogue:
    "Catalogue Intelligence",

  capital:
    "Capital Intelligence",

  missions:
    "Mission Engine",

  system:
    "Vault Systems",
};

const SOURCE_TIME_OFFSETS_MINUTES: Record<
  VaultBrainDataSource,
  number
> = {
  shopify: -10,
  inventory: -8,
  commercial: -6,
  supplier: -5,
  catalogue: -4,
  capital: -3,
  missions: -1,
  system: 0,
};

/* ============================================================
   SHARED HELPERS
============================================================ */

function clampPercentage(
  value: number,
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(
      0,
      Math.round(value),
    ),
  );
}

function formatTime(
  date: Date,
): string {
  return new Intl.DateTimeFormat(
    "en-GB",
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    },
  ).format(date);
}

function createOccurredAt(
  generatedAt: string,
  source: VaultBrainDataSource,
): {
  occurredAt: string;
  displayTime: string;
} {
  const generatedDate =
    new Date(generatedAt);

  const safeGeneratedDate =
    Number.isNaN(
      generatedDate.getTime(),
    )
      ? new Date()
      : generatedDate;

  const eventDate =
    new Date(
      safeGeneratedDate.getTime() +
        SOURCE_TIME_OFFSETS_MINUTES[
          source
        ] *
          60 *
          1000,
    );

  return {
    occurredAt:
      eventDate.toISOString(),

    displayTime:
      formatTime(eventDate),
  };
}

function calculateFeedConfidence(
  events: LiveIntelligenceEvent[],
): number {
  if (events.length === 0) {
    return 0;
  }

  const weightedTotal =
    events.reduce(
      (
        total,
        event,
      ) =>
        total +
        event.confidence *
          Math.max(
            event.priority,
            1,
          ),
      0,
    );

  const totalWeight =
    events.reduce(
      (
        total,
        event,
      ) =>
        total +
        Math.max(
          event.priority,
          1,
        ),
      0,
    );

  return clampPercentage(
    weightedTotal /
      totalWeight,
  );
}

function getHighestPriorityEvent(
  events: LiveIntelligenceEvent[],
): LiveIntelligenceEvent | null {
  return (
    [...events].sort(
      (
        first,
        second,
      ) => {
        if (
          second.priority !==
          first.priority
        ) {
          return (
            second.priority -
            first.priority
          );
        }

        return (
          second.confidence -
          first.confidence
        );
      },
    )[0] ?? null
  );
}

/* ============================================================
   LEGACY NARRATOR STORY ADAPTER
============================================================ */

function getNarratorEventType(
  finding: NarratorFinding,
): LiveIntelligenceEventType {
  if (
    finding.source ===
    "missions"
  ) {
    return "mission";
  }

  if (
    finding.tone ===
      "critical" ||
    finding.tone ===
      "warning"
  ) {
    return "warning";
  }

  if (
    finding.source ===
      "capital" ||
    finding.source ===
      "commercial"
  ) {
    return "change";
  }

  return "observation";
}

function getNarratorEventTitle(
  finding: NarratorFinding,
): string {
  if (
    finding.source ===
    "missions"
  ) {
    return "Today’s priority was recalculated";
  }

  if (
    finding.source ===
      "inventory" &&
    (
      finding.tone ===
        "critical" ||
      finding.tone ===
        "warning"
    )
  ) {
    return "Stock risk detected";
  }

  if (
    finding.source ===
    "commercial"
  ) {
    return "Commercial position updated";
  }

  if (
    finding.source ===
    "capital"
  ) {
    return "Purchasing power recalculated";
  }

  if (
    finding.source ===
    "supplier"
  ) {
    return "Supplier position reviewed";
  }

  if (
    finding.source ===
    "catalogue"
  ) {
    return "Catalogue intelligence refreshed";
  }

  if (
    finding.source ===
    "shopify"
  ) {
    return "Latest trading activity analysed";
  }

  return finding.label;
}

function getEventAction(
  source: VaultBrainDataSource,
): Pick<
  LiveIntelligenceEvent,
  "actionLabel" | "actionHref"
> {
  switch (source) {
    case "inventory":
      return {
        actionLabel:
          "Review inventory",

        actionHref:
          "/inventory",
      };

    case "commercial":
      return {
        actionLabel:
          "Review commercial data",

        actionHref:
          "/commercial",
      };

    case "supplier":
      return {
        actionLabel:
          "Review suppliers",

        actionHref:
          "/partners",
      };

    case "catalogue":
      return {
        actionLabel:
          "Open catalogue",

        actionHref:
          "/catalogue",
      };

    case "missions":
      return {
        actionLabel:
          "Open missions",

        actionHref:
          "/missions",
      };

    case "capital":
      return {
        actionLabel:
          "Review capital",

        actionHref:
          "/commercial",
      };

    default:
      return {};
  }
}

function createNarratorEvent(
  finding: NarratorFinding,
  generatedAt: string,
): LiveIntelligenceEvent {
  const timing =
    createOccurredAt(
      generatedAt,
      finding.source,
    );

  return {
    id:
      `live-${finding.id}`,

    source:
      finding.source,

    sourceLabel:
      SOURCE_LABELS[
        finding.source
      ],

    type:
      getNarratorEventType(
        finding,
      ),

    tone:
      finding.tone,

    title:
      getNarratorEventTitle(
        finding,
      ),

    description:
      finding.finding,

    occurredAt:
      timing.occurredAt,

    displayTime:
      timing.displayTime,

    confidence:
      clampPercentage(
        finding.confidence,
      ),

    priority:
      finding.priority,

    ...getEventAction(
      finding.source,
    ),
  };
}

/* ============================================================
   BUSINESS EVENT ADAPTER
============================================================ */

function normaliseBusinessSource(
  event: BusinessEvent,
): VaultBrainDataSource {
  if (
    event.source ===
    "executive-memory"
  ) {
    return "system";
  }

  return event.source;
}

function getBusinessEventType(
  event: BusinessEvent,
): LiveIntelligenceEventType {
  if (
    event.source ===
      "missions" ||
    event.type ===
      "mission-priority-changed" ||
    event.type ===
      "mission-pressure-increased" ||
    event.type ===
      "mission-pressure-reduced"
  ) {
    return "mission";
  }

  if (
    event.tone ===
      "critical" ||
    event.tone ===
      "warning" ||
    event.type ===
      "source-degraded"
  ) {
    return "warning";
  }

  if (
    event.type ===
      "operational-improvement" ||
    event.type ===
      "operational-decline" ||
    event.type ===
      "inventory-health-changed" ||
    event.type ===
      "inventory-recovered" ||
    event.type ===
      "inventory-risk-increased" ||
    event.type ===
      "commercial-performance-changed" ||
    event.type ===
      "capital-position-changed" ||
    event.type ===
      "source-recovered"
  ) {
    return "change";
  }

  return "observation";
}

function findBusinessNarrative(
  event: BusinessEvent,
  narration:
    | BusinessNarration
    | undefined,
): BusinessNarrative | null {
  if (!narration) {
    return null;
  }

  return (
    narration.narratives.find(
      (narrative) =>
        narrative.id ===
        event.id,
    ) ?? null
  );
}

function createBusinessEvent(
  event: BusinessEvent,
  narration:
    | BusinessNarration
    | undefined,
): LiveIntelligenceEvent {
  const source =
    normaliseBusinessSource(
      event,
    );

  const narrative =
    findBusinessNarrative(
      event,
      narration,
    );

  const eventDate =
    new Date(
      event.occurredAt,
    );

  const safeEventDate =
    Number.isNaN(
      eventDate.getTime(),
    )
      ? new Date()
      : eventDate;

  return {
    id:
      `live-${event.id}`,

    source,

    sourceLabel:
      SOURCE_LABELS[source],

    type:
      getBusinessEventType(
        event,
      ),

    tone:
      event.tone,

    title:
      narrative?.title ??
      event.title,

    description:
      narrative?.sentence ??
      event.description,

    occurredAt:
      safeEventDate.toISOString(),

    displayTime:
      formatTime(
        safeEventDate,
      ),

    confidence:
      clampPercentage(
        narrative?.confidence ??
          event.confidence,
      ),

    priority:
      narrative?.priority ??
      event.priority,

    ...getEventAction(
      source,
    ),
  };
}

function sortEvents(
  events: LiveIntelligenceEvent[],
): LiveIntelligenceEvent[] {
  return [...events].sort(
    (
      first,
      second,
    ) => {
      const timeDifference =
        new Date(
          second.occurredAt,
        ).getTime() -
        new Date(
          first.occurredAt,
        ).getTime();

      if (
        timeDifference !== 0
      ) {
        return timeDifference;
      }

      return (
        second.priority -
        first.priority
      );
    },
  );
}

function limitEvents(
  events: LiveIntelligenceEvent[],
  maximumEvents: number,
): LiveIntelligenceEvent[] {
  return events.slice(
    0,
    Math.max(
      1,
      maximumEvents,
    ),
  );
}

/* ============================================================
   ENGINE
============================================================ */

export const LiveIntelligenceEngine = {
  /*
   * Existing NarratorEngine adapter.
   *
   * Preserved so current consumers continue to compile while
   * the live business-event pipeline is introduced.
   */
  buildFeed({
    story,
    maximumEvents = 7,
  }: BuildFeedInput): LiveIntelligenceFeed {
    const events =
      limitEvents(
        sortEvents(
          story.findings.map(
            (finding) =>
              createNarratorEvent(
                finding,
                story.generatedAt,
              ),
          ),
        ),
        maximumEvents,
      );

    return {
      generatedAt:
        story.generatedAt,

      events,

      highestPriorityEvent:
        getHighestPriorityEvent(
          events,
        ),

      confidence:
        calculateFeedConfidence(
          events,
        ),
    };
  },

  /*
   * Live Business Event adapter.
   *
   * Converts structured operational events and their optional
   * narrated language into the same feed contract consumed by
   * the existing animated LiveIntelligenceFeed component.
   */
  buildBusinessFeed({
    result,
    narration,
    maximumEvents = 7,
  }: BuildBusinessFeedInput): LiveIntelligenceFeed {
    const events =
      limitEvents(
        sortEvents(
          result.events.map(
            (event) =>
              createBusinessEvent(
                event,
                narration,
              ),
          ),
        ),
        maximumEvents,
      );

    return {
      generatedAt:
        result.generatedAt,

      events,

      highestPriorityEvent:
        getHighestPriorityEvent(
          events,
        ),

      confidence:
        events.length > 0
          ? calculateFeedConfidence(
              events,
            )
          : clampPercentage(
              result.confidence,
            ),
    };
  },
} as const;