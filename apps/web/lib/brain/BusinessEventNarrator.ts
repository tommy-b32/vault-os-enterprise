import type {
  BusinessEvent,
  BusinessEventResult,
} from "@/lib/brain/BusinessEventEngine";

export type BusinessNarrative = {
  id: string;

  title: string;
  sentence: string;

  priority: number;
  confidence: number;
};

export type BusinessNarration = {
  headline: string;

  summary: string;

  narratives: BusinessNarrative[];

  confidence: number;
};

function describeEvent(
  event: BusinessEvent,
): string {
  switch (event.type) {
    case "baseline-created":
      return "Vault Brain has established its first operational baseline and will compare all future business activity against it.";

    case "operational-improvement":
      return "Overall operational performance has improved since the previous snapshot.";

    case "operational-decline":
      return "Operational performance has deteriorated since the previous snapshot and should be reviewed.";

    case "operational-stability":
      return "Operational performance has remained stable since the previous snapshot.";

    case "inventory-health-changed":
      if (
        event.delta !== null &&
        event.delta !== undefined
      ) {
        return `Inventory health changed by ${Math.abs(
          event.delta,
        )} points.`;
      }

      return event.description;

    case "inventory-recovered":
      return "Inventory risk has reduced across monitored products.";

    case "inventory-risk-increased":
      return "Additional inventory exposure has been detected.";

    case "mission-pressure-reduced":
      return "The active operational workload has reduced.";

    case "mission-pressure-increased":
      return "Additional operational work has been identified.";

    case "mission-priority-changed":
      return "Mission priorities have been recalculated.";

    case "commercial-performance-changed":
      return "Commercial performance has changed.";

    case "capital-position-changed":
      return "Available purchasing capital has changed.";

    case "source-recovered":
      return "A connected data source has recovered.";

    case "source-degraded":
      return "A connected data source requires attention.";

    default:
      return event.description;
  }
}

export function createBusinessNarration(
  result: BusinessEventResult,
): BusinessNarration {
  const narratives =
    result.events.map((event) => ({
      id: event.id,

      title: event.title,

      sentence:
        describeEvent(event),

      priority:
        event.priority,

      confidence:
        event.confidence,
    }));

  return {
    headline:
      result.headline,

    summary:
      result.summary,

    narratives,

    confidence:
      result.confidence,
  };
}