import type { BrainMemory } from "./MemoryEngine";
import type {
  MorningBriefingResult,
} from "./MorningBriefingEngine";

export type MissionControlTone =
  | "success"
  | "warning"
  | "danger"
  | "info";

export type MissionControlMetric = {
  id: string;
  label: string;
  value: string;
  helper: string;
  tone: MissionControlTone;
};

export type MissionControlResult = {
  status: string;
  mission: string;
  expectedGain: string;
  confidence: number;
  primaryBlocker: string;
  metrics: MissionControlMetric[];
};

type AnalyseInput = {
  briefing: MorningBriefingResult;
  memory: BrainMemory;
  productsMissingSuppliers: number;
  productsMissingCommercialData: number;
};

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(0, Math.round(value)),
  );
}

function getStatus(
  confidence: number,
): string {
  if (confidence >= 80) {
    return "Decision ready";
  }

  if (confidence >= 60) {
    return "Improving";
  }

  if (confidence >= 35) {
    return "Restricted";
  }

  return "Limited intelligence";
}

function getPrimaryBlocker({
  productsMissingSuppliers,
  productsMissingCommercialData,
}: {
  productsMissingSuppliers: number;
  productsMissingCommercialData: number;
}): string {
  if (
    productsMissingSuppliers >
    productsMissingCommercialData
  ) {
    return `${productsMissingSuppliers} products are missing supplier assignments.`;
  }

  if (productsMissingCommercialData > 0) {
    return `${productsMissingCommercialData} products are missing complete commercial data.`;
  }

  return "No critical configuration blocker detected.";
}

function getExpectedGain({
  productsMissingSuppliers,
  productsMissingCommercialData,
}: {
  productsMissingSuppliers: number;
  productsMissingCommercialData: number;
}): string {
  if (productsMissingSuppliers > 0) {
    return "Higher supplier and purchasing confidence";
  }

  if (productsMissingCommercialData > 0) {
    return "More trusted margin and return analysis";
  }

  return "Maintain current intelligence quality";
}

export const MissionControlEngine = {
  analyse({
    briefing,
    memory,
    productsMissingSuppliers,
    productsMissingCommercialData,
  }: AnalyseInput): MissionControlResult {
    const confidence = clampPercentage(
      briefing.readinessPercentage,
    );

    const latestConfidenceChange =
      memory.changes.find(
        (change) =>
          change.key === "confidence",
      );

    const confidenceHelper =
      latestConfidenceChange &&
      latestConfidenceChange.direction !==
        "unchanged"
        ? `${latestConfidenceChange.difference > 0 ? "+" : ""}${latestConfidenceChange.difference}% since the previous snapshot`
        : memory.previous
          ? "No confidence change detected"
          : "Baseline snapshot established";

    return {
      status: getStatus(confidence),
      mission: briefing.recommendation,
      expectedGain: getExpectedGain({
        productsMissingSuppliers,
        productsMissingCommercialData,
      }),
      confidence,
      primaryBlocker: getPrimaryBlocker({
        productsMissingSuppliers,
        productsMissingCommercialData,
      }),
      metrics: [
        {
          id: "confidence",
          label: "Brain confidence",
          value: `${confidence}%`,
          helper: confidenceHelper,
          tone:
            confidence >= 80
              ? "success"
              : confidence >= 35
                ? "warning"
                : "danger",
        },
        {
          id: "status",
          label: "System status",
          value: getStatus(confidence),
          helper:
            "Current ability to make trusted purchasing decisions",
          tone:
            confidence >= 80
              ? "success"
              : confidence >= 35
                ? "warning"
                : "danger",
        },
        {
          id: "memory",
          label: "Memory state",
          value: memory.previous
            ? "Comparing"
            : "Baseline",
          helper: memory.previous
            ? "Current state compared with a previous snapshot"
            : "First business snapshot recorded",
          tone: memory.previous
            ? "success"
            : "info",
        },
      ],
    };
  },
};