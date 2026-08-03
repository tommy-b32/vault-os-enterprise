import {
  BrainSignalsEngine,
  type BrainSignal,
  type BrainSignalSeverity,
} from "@/lib/brain/BrainSignalsEngine";

import {
  BrainSignalsRepository,
} from "@/lib/brain/BrainSignalsRepository";

import {
  BrainCopilotRepository,
} from "@/lib/brain/BrainCopilotRepository";

import type {
  BrainCopilotRecommendation,
} from "@/types/brain-copilot";

function getSignalSeverity(
  recommendation:
    BrainCopilotRecommendation,
): BrainSignalSeverity {
  switch (recommendation.priority) {
    case "critical":
      return "critical";

    case "high":
      return "warning";

    case "medium":
      return "info";

    case "low":
      return "success";
  }
}

function createSignalFromCopilot(
  recommendation:
    BrainCopilotRecommendation,
): BrainSignal {
  return BrainSignalsEngine.createSignal({
    type: "buying",

    severity:
      getSignalSeverity(
        recommendation,
      ),

    title:
      recommendation.title,

    message:
      recommendation.message,

    confidence:
      recommendation.confidence,

    productId:
      recommendation.productId,

    productName:
      recommendation.productName,

    supplierId:
      recommendation.supplierId,

    supplierName:
      recommendation.supplierName,

    value:
      recommendation.estimatedProfit,

    currency:
      recommendation.currency,

    actionHref:
      "/missions",

    actionLabel:
      "Review recommendation",
  });
}

function migrateLatestCopilotSignal():
  BrainSignal | null {
  const recommendation =
    BrainCopilotRepository.getLatest();

  if (!recommendation) {
    return null;
  }

  const signal =
    createSignalFromCopilot(
      recommendation,
    );

  BrainSignalsRepository.save(
    signal,
  );

  return signal;
}

function getStoredSignals():
  BrainSignal[] {
  const signals =
    BrainSignalsRepository.getAll();

  if (signals.length > 0) {
    return signals;
  }

  const migratedSignal =
    migrateLatestCopilotSignal();

  return migratedSignal
    ? [migratedSignal]
    : [];
}

export const BrainSignalsService = {
  publish(
    signal: BrainSignal,
  ): BrainSignal {
    BrainSignalsRepository.save(
      signal,
    );

    return signal;
  },

  publishMany(
    signals: BrainSignal[],
  ): BrainSignal[] {
    BrainSignalsRepository.saveMany(
      signals,
    );

    return signals;
  },

  getLatest():
    BrainSignal | null {
    const signals =
      getStoredSignals();

    return (
      signals[0] ??
      null
    );
  },

  getAll():
    BrainSignal[] {
    return getStoredSignals();
  },

  getHighestPriority():
    BrainSignal | null {
    return BrainSignalsEngine.getHighestPriority(
      getStoredSignals(),
    );
  },

  clear(): boolean {
    return BrainSignalsRepository.clear();
  },
} as const;