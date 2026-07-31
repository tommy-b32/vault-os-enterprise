import type {
  ExecutiveMemoryDirection,
  ExecutiveMemoryInsight,
  ExecutiveMemoryMetricId,
  ExecutiveMemoryResult,
} from "@/lib/brain/ExecutiveMemoryEngine";

import type {
  VaultBrainDataSource,
  VaultBrainSignalTone,
} from "@/lib/brain/types";

/* ============================================================
   BUSINESS EVENT CONTRACTS
============================================================ */

export type BusinessEventType =
  | "baseline-created"
  | "operational-improvement"
  | "operational-decline"
  | "operational-stability"
  | "inventory-recovered"
  | "inventory-risk-increased"
  | "inventory-health-changed"
  | "mission-pressure-reduced"
  | "mission-pressure-increased"
  | "mission-priority-changed"
  | "commercial-performance-changed"
  | "capital-position-changed"
  | "source-recovered"
  | "source-degraded"
  | "operational-change";

export type BusinessEvent = {
  id: string;
  type: BusinessEventType;

  occurredAt: string;

  title: string;
  description: string;

  source:
    | VaultBrainDataSource
    | "executive-memory";

  direction: ExecutiveMemoryDirection;
  tone: VaultBrainSignalTone;

  priority: number;
  confidence: number;

  previousValue?: number | null;
  currentValue?: number | null;
  delta?: number | null;

  metadata?: Record<
    string,
    string | number | boolean | null
  >;
};

export type BusinessEventResult = {
  generatedAt: string;

  hasPreviousSnapshot: boolean;

  direction: ExecutiveMemoryDirection;
  headline: string;
  summary: string;

  events: BusinessEvent[];

  criticalEvents: number;
  warningEvents: number;
  positiveEvents: number;
  neutralEvents: number;

  confidence: number;
};

/* ============================================================
   INTERNAL HELPERS
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

function getOverallEventType(
  direction: ExecutiveMemoryDirection,
): BusinessEventType {
  switch (direction) {
    case "improved":
      return "operational-improvement";

    case "declined":
      return "operational-decline";

    case "stable":
      return "operational-stability";

    case "unknown":
      return "baseline-created";
  }
}

function getOverallTone(
  direction: ExecutiveMemoryDirection,
): VaultBrainSignalTone {
  switch (direction) {
    case "improved":
      return "positive";

    case "declined":
      return "warning";

    case "stable":
      return "neutral";

    case "unknown":
      return "info";
  }
}

function getMetricEventType(
  metricId: ExecutiveMemoryMetricId,
  direction: ExecutiveMemoryDirection,
): BusinessEventType {
  switch (metricId) {
    case "inventory-health":
      return "inventory-health-changed";

    case "healthy-products":
    case "low-stock-products":
    case "out-of-stock-products":
      return direction === "improved"
        ? "inventory-recovered"
        : "inventory-risk-increased";

    case "actionable-missions":
    case "critical-missions":
    case "high-priority-missions":
      return direction === "improved"
        ? "mission-pressure-reduced"
        : "mission-pressure-increased";

    case "cash":
    case "purchasing-power":
      return "capital-position-changed";

    case "orders":
    case "revenue":
    case "profit":
      return "commercial-performance-changed";

    default:
      return "operational-change";
  }
}

function getInsightEventType(
  insight: ExecutiveMemoryInsight,
): BusinessEventType {
  if (
    insight.id ===
    "highest-priority-mission"
  ) {
    return "mission-priority-changed";
  }

  if (
    insight.id.startsWith(
      "source-",
    )
  ) {
    return insight.direction ===
      "improved"
      ? "source-recovered"
      : "source-degraded";
  }

  if (
    insight.id.startsWith(
      "metric-",
    )
  ) {
    const metricId =
      insight.id.replace(
        "metric-",
        "",
      ) as ExecutiveMemoryMetricId;

    return getMetricEventType(
      metricId,
      insight.direction,
    );
  }

  return "operational-change";
}

function createOverallEvent(
  memory: ExecutiveMemoryResult,
): BusinessEvent {
  return {
    id: `overall-${memory.currentGeneratedAt}`,

    type:
      getOverallEventType(
        memory.direction,
      ),

    occurredAt:
      memory.currentGeneratedAt,

    title:
      memory.headline,

    description:
      memory.summary,

    source:
      "executive-memory",

    direction:
      memory.direction,

    tone:
      getOverallTone(
        memory.direction,
      ),

    priority:
      memory.direction === "declined"
        ? 100
        : memory.direction === "improved"
          ? 94
          : 55,

    confidence:
      clampPercentage(
        memory.confidence,
      ),

    metadata: {
      improvedSignals:
        memory.improvedSignals,

      declinedSignals:
        memory.declinedSignals,

      stableSignals:
        memory.stableSignals,
    },
  };
}

function createInsightEvent(
  insight: ExecutiveMemoryInsight,
  memory: ExecutiveMemoryResult,
): BusinessEvent {
  const metricId =
    insight.id.startsWith(
      "metric-",
    )
      ? (
          insight.id.replace(
            "metric-",
            "",
          ) as ExecutiveMemoryMetricId
        )
      : null;

  const metricChange =
    metricId
      ? memory.metricChanges.find(
          (change) =>
            change.id === metricId,
        ) ?? null
      : null;

  return {
    id: `business-event-${insight.id}-${memory.currentGeneratedAt}`,

    type:
      getInsightEventType(
        insight,
      ),

    occurredAt:
      memory.currentGeneratedAt,

    title:
      insight.title,

    description:
      insight.description,

    source:
      insight.source,

    direction:
      insight.direction,

    tone:
      insight.tone,

    priority:
      insight.priority,

    confidence:
      clampPercentage(
        memory.confidence,
      ),

    previousValue:
      metricChange?.previousValue,

    currentValue:
      metricChange?.currentValue,

    delta:
      metricChange?.delta,

    metadata: {
      insightId:
        insight.id,

      metricId:
        metricId ?? null,
    },
  };
}

function createBaselineResult(
  memory: ExecutiveMemoryResult,
): BusinessEventResult {
  const baselineEvent =
    createOverallEvent(
      memory,
    );

  return {
    generatedAt:
      new Date().toISOString(),

    hasPreviousSnapshot:
      false,

    direction:
      memory.direction,

    headline:
      memory.headline,

    summary:
      memory.summary,

    events: [
      baselineEvent,
    ],

    criticalEvents: 0,
    warningEvents: 0,
    positiveEvents: 0,
    neutralEvents: 1,

    confidence:
      clampPercentage(
        memory.confidence,
      ),
  };
}

/* ============================================================
   PUBLIC ENGINE
============================================================ */

export function createBusinessEvents(
  memory: ExecutiveMemoryResult,
): BusinessEventResult {
  if (
    !memory.hasPreviousSnapshot
  ) {
    return createBaselineResult(
      memory,
    );
  }

  const events: BusinessEvent[] = [
    createOverallEvent(
      memory,
    ),

    ...memory.insights.map(
      (insight) =>
        createInsightEvent(
          insight,
          memory,
        ),
    ),
  ];

  const sortedEvents =
    events.sort(
      (first, second) =>
        second.priority -
        first.priority,
    );

  return {
    generatedAt:
      new Date().toISOString(),

    hasPreviousSnapshot:
      true,

    direction:
      memory.direction,

    headline:
      memory.headline,

    summary:
      memory.summary,

    events:
      sortedEvents,

    criticalEvents:
      sortedEvents.filter(
        (event) =>
          event.tone ===
          "critical",
      ).length,

    warningEvents:
      sortedEvents.filter(
        (event) =>
          event.tone ===
          "warning",
      ).length,

    positiveEvents:
      sortedEvents.filter(
        (event) =>
          event.tone ===
          "positive",
      ).length,

    neutralEvents:
      sortedEvents.filter(
        (event) =>
          event.tone ===
            "neutral" ||
          event.tone ===
            "info",
      ).length,

    confidence:
      clampPercentage(
        memory.confidence,
      ),
  };
}