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
  events: LiveIntelligenceEvent[];
  highestPriorityEvent: LiveIntelligenceEvent | null;
  confidence: number;
};

type BuildFeedInput = {
  story: NarratorStory;
  maximumEvents?: number;
};

/* ============================================================
   SOURCE METADATA
============================================================ */

const SOURCE_LABELS: Record<
  VaultBrainDataSource,
  string
> = {
  shopify: "Trading Intelligence",
  inventory: "Inventory Intelligence",
  commercial: "Commercial Intelligence",
  supplier: "Supplier Intelligence",
  catalogue: "Catalogue Intelligence",
  capital: "Capital Intelligence",
  missions: "Mission Engine",
  system: "Vault Systems",
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
   HELPERS
============================================================ */

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(0, Math.round(value)),
  );
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
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

  const eventDate = new Date(
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

function getEventType(
  finding: NarratorFinding,
): LiveIntelligenceEventType {
  if (
    finding.source === "missions"
  ) {
    return "mission";
  }

  if (
    finding.tone === "critical" ||
    finding.tone === "warning"
  ) {
    return "warning";
  }

  if (
    finding.source === "capital" ||
    finding.source === "commercial"
  ) {
    return "change";
  }

  return "observation";
}

function getEventTitle(
  finding: NarratorFinding,
): string {
  if (
    finding.source === "missions"
  ) {
    return "Today’s priority was recalculated";
  }

  if (
    finding.source === "inventory" &&
    (
      finding.tone === "critical" ||
      finding.tone === "warning"
    )
  ) {
    return "Stock risk detected";
  }

  if (
    finding.source === "commercial"
  ) {
    return "Commercial position updated";
  }

  if (
    finding.source === "capital"
  ) {
    return "Purchasing power recalculated";
  }

  if (
    finding.source === "supplier"
  ) {
    return "Supplier position reviewed";
  }

  if (
    finding.source === "catalogue"
  ) {
    return "Catalogue intelligence refreshed";
  }

  if (
    finding.source === "shopify"
  ) {
    return "Latest trading activity analysed";
  }

  return finding.label;
}

function getEventAction(
  finding: NarratorFinding,
): Pick<
  LiveIntelligenceEvent,
  "actionLabel" | "actionHref"
> {
  switch (finding.source) {
    case "inventory":
      return {
        actionLabel: "Review inventory",
        actionHref: "/inventory",
      };

    case "commercial":
      return {
        actionLabel: "Review commercial data",
        actionHref: "/commercial",
      };

    case "supplier":
      return {
        actionLabel: "Review suppliers",
        actionHref: "/partners",
      };

    case "catalogue":
      return {
        actionLabel: "Open catalogue",
        actionHref: "/catalogue",
      };

    case "missions":
      return {
        actionLabel: "Open missions",
        actionHref: "/missions",
      };

    case "capital":
      return {
        actionLabel: "Review capital",
        actionHref: "/commercial",
      };

    default:
      return {};
  }
}

function createEvent(
  finding: NarratorFinding,
  generatedAt: string,
): LiveIntelligenceEvent {
  const timing = createOccurredAt(
    generatedAt,
    finding.source,
  );

  return {
    id: `live-${finding.id}`,

    source: finding.source,
    sourceLabel:
      SOURCE_LABELS[
        finding.source
      ],

    type: getEventType(finding),
    tone: finding.tone,

    title:
      getEventTitle(finding),

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

    ...getEventAction(finding),
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
      (total, event) =>
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
      (total, event) =>
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

/* ============================================================
   ENGINE
============================================================ */

export const LiveIntelligenceEngine = {
  buildFeed({
    story,
    maximumEvents = 7,
  }: BuildFeedInput): LiveIntelligenceFeed {
    const events =
      story.findings
        .map((finding) =>
          createEvent(
            finding,
            story.generatedAt,
          ),
        )
        .sort((a, b) => {
          const timeDifference =
            new Date(
              b.occurredAt,
            ).getTime() -
            new Date(
              a.occurredAt,
            ).getTime();

          if (
            timeDifference !== 0
          ) {
            return timeDifference;
          }

          return (
            b.priority -
            a.priority
          );
        })
        .slice(
          0,
          Math.max(
            1,
            maximumEvents,
          ),
        );

    const highestPriorityEvent =
      [...events].sort(
        (a, b) => {
          if (
            b.priority !==
            a.priority
          ) {
            return (
              b.priority -
              a.priority
            );
          }

          return (
            b.confidence -
            a.confidence
          );
        },
      )[0] ?? null;

    return {
      generatedAt:
        story.generatedAt,

      events,

      highestPriorityEvent,

      confidence:
        calculateFeedConfidence(
          events,
        ),
    };
  },
} as const;