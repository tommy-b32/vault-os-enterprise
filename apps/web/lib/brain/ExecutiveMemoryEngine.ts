import type {
  VaultBrainConnectionStatus,
  VaultBrainDataSource,
  VaultBrainOperationalSnapshot,
  VaultBrainSignalTone,
} from "@/lib/brain/types";

/* ============================================================
   EXECUTIVE MEMORY TYPES
============================================================ */

export type ExecutiveMemoryDirection =
  | "improved"
  | "declined"
  | "stable"
  | "unknown";

export type ExecutiveMemoryMetricId =
  | "inventory-health"
  | "healthy-products"
  | "low-stock-products"
  | "out-of-stock-products"
  | "monitored-products"
  | "actionable-missions"
  | "critical-missions"
  | "high-priority-missions"
  | "mission-confidence"
  | "orders"
  | "revenue"
  | "profit"
  | "cash"
  | "purchasing-power"
  | "source-health";

export type ExecutiveMemoryMetricChange = {
  id: ExecutiveMemoryMetricId;
  label: string;

  previousValue: number | null;
  currentValue: number | null;
  delta: number | null;

  direction: ExecutiveMemoryDirection;
  tone: VaultBrainSignalTone;

  description: string;
};

export type ExecutiveMemoryMissionChange = {
  changed: boolean;

  previousMissionId: string | null;
  previousMissionTitle: string | null;

  currentMissionId: string | null;
  currentMissionTitle: string | null;

  description: string;
};

export type ExecutiveMemorySourceChange = {
  source: VaultBrainDataSource;
  label: string;

  previousStatus: VaultBrainConnectionStatus;
  currentStatus: VaultBrainConnectionStatus;

  direction: ExecutiveMemoryDirection;
  tone: VaultBrainSignalTone;

  description: string;
};

export type ExecutiveMemoryInsight = {
  id: string;
  title: string;
  description: string;

  direction: ExecutiveMemoryDirection;
  tone: VaultBrainSignalTone;

  source:
    | VaultBrainDataSource
    | "executive-memory";

  priority: number;
};

export type ExecutiveMemoryResult = {
  generatedAt: string;

  previousGeneratedAt: string | null;
  currentGeneratedAt: string;

  hasPreviousSnapshot: boolean;

  direction: ExecutiveMemoryDirection;
  headline: string;
  summary: string;

  metricChanges: ExecutiveMemoryMetricChange[];
  sourceChanges: ExecutiveMemorySourceChange[];
  missionChange: ExecutiveMemoryMissionChange;

  insights: ExecutiveMemoryInsight[];

  improvedSignals: number;
  declinedSignals: number;
  stableSignals: number;

  confidence: number;
};

/* ============================================================
   INTERNAL HELPERS
============================================================ */

type MetricDirectionPreference =
  | "higher-is-better"
  | "lower-is-better"
  | "neutral";

type CreateMetricChangeInput = {
  id: ExecutiveMemoryMetricId;
  label: string;

  previousValue: number | null;
  currentValue: number | null;

  preference: MetricDirectionPreference;

  unit?: "number" | "percent" | "currency";
};

const SOURCE_STATUS_WEIGHT: Record<
  VaultBrainConnectionStatus,
  number
> = {
  healthy: 3,
  degraded: 2,
  unknown: 1,
  offline: 0,
};

function roundValue(
  value: number,
  decimalPlaces = 1,
): number {
  const multiplier =
    10 ** decimalPlaces;

  return (
    Math.round(
      value * multiplier,
    ) / multiplier
  );
}

function calculateDelta(
  previousValue: number | null,
  currentValue: number | null,
): number | null {
  if (
    previousValue === null ||
    currentValue === null
  ) {
    return null;
  }

  return roundValue(
    currentValue - previousValue,
  );
}

function getMetricDirection(
  delta: number | null,
  preference: MetricDirectionPreference,
): ExecutiveMemoryDirection {
  if (delta === null) {
    return "unknown";
  }

  if (delta === 0) {
    return "stable";
  }

  if (preference === "neutral") {
    return "stable";
  }

  if (preference === "higher-is-better") {
    return delta > 0
      ? "improved"
      : "declined";
  }

  return delta < 0
    ? "improved"
    : "declined";
}

function getToneForDirection(
  direction: ExecutiveMemoryDirection,
): VaultBrainSignalTone {
  if (direction === "improved") {
    return "positive";
  }

  if (direction === "declined") {
    return "warning";
  }

  if (direction === "unknown") {
    return "info";
  }

  return "neutral";
}

function formatNumber(
  value: number | null,
): string {
  if (value === null) {
    return "unavailable";
  }

  return new Intl.NumberFormat(
    "en-GB",
  ).format(value);
}

function formatPercent(
  value: number | null,
): string {
  if (value === null) {
    return "unavailable";
  }

  return `${roundValue(value)}%`;
}

function formatCurrency(
  value: number | null,
): string {
  if (value === null) {
    return "unavailable";
  }

  return new Intl.NumberFormat(
    "en-GB",
    {
      style: "currency",
      currency: "GBP",
      maximumFractionDigits: 0,
    },
  ).format(value);
}

function formatMetricValue(
  value: number | null,
  unit: CreateMetricChangeInput["unit"],
): string {
  if (unit === "percent") {
    return formatPercent(value);
  }

  if (unit === "currency") {
    return formatCurrency(value);
  }

  return formatNumber(value);
}

function formatDelta(
  delta: number | null,
  unit: CreateMetricChangeInput["unit"],
): string {
  if (delta === null) {
    return "an unavailable amount";
  }

  const absoluteDelta =
    Math.abs(delta);

  if (unit === "percent") {
    return `${formatNumber(
      absoluteDelta,
    )} percentage ${
      absoluteDelta === 1
        ? "point"
        : "points"
    }`;
  }

  if (unit === "currency") {
    return formatCurrency(
      absoluteDelta,
    );
  }

  return formatNumber(
    absoluteDelta,
  );
}

function createMetricDescription({
  label,
  previousValue,
  currentValue,
  delta,
  direction,
  unit,
}: {
  label: string;
  previousValue: number | null;
  currentValue: number | null;
  delta: number | null;
  direction: ExecutiveMemoryDirection;
  unit: CreateMetricChangeInput["unit"];
}): string {
  if (
    previousValue === null ||
    currentValue === null ||
    delta === null
  ) {
    return `${label} could not be compared because one or both snapshots do not contain a trusted value.`;
  }

  if (direction === "stable") {
    return `${label} remained stable at ${formatMetricValue(
      currentValue,
      unit,
    )}.`;
  }

  const movement =
    currentValue > previousValue
      ? "increased"
      : "decreased";

  return `${label} ${movement} by ${formatDelta(
    delta,
    unit,
  )}, moving from ${formatMetricValue(
    previousValue,
    unit,
  )} to ${formatMetricValue(
    currentValue,
    unit,
  )}.`;
}

function createMetricChange({
  id,
  label,
  previousValue,
  currentValue,
  preference,
  unit = "number",
}: CreateMetricChangeInput): ExecutiveMemoryMetricChange {
  const delta =
    calculateDelta(
      previousValue,
      currentValue,
    );

  const direction =
    getMetricDirection(
      delta,
      preference,
    );

  return {
    id,
    label,

    previousValue,
    currentValue,
    delta,

    direction,

    tone:
      getToneForDirection(
        direction,
      ),

    description:
      createMetricDescription({
        label,
        previousValue,
        currentValue,
        delta,
        direction,
        unit,
      }),
  };
}

function createMissionChange(
  previousSnapshot: VaultBrainOperationalSnapshot,
  currentSnapshot: VaultBrainOperationalSnapshot,
): ExecutiveMemoryMissionChange {
  const previousMissionId =
    previousSnapshot.missions
      .highestPriorityMissionId;

  const currentMissionId =
    currentSnapshot.missions
      .highestPriorityMissionId;

  const previousMissionTitle =
    previousSnapshot.missions
      .highestPriorityMissionTitle;

  const currentMissionTitle =
    currentSnapshot.missions
      .highestPriorityMissionTitle;

  const changed =
    previousMissionId !==
    currentMissionId;

  if (!changed) {
    if (currentMissionTitle) {
      return {
        changed: false,

        previousMissionId,
        previousMissionTitle,

        currentMissionId,
        currentMissionTitle,

        description:
          `"${currentMissionTitle}" remains the highest-priority mission.`,
      };
    }

    return {
      changed: false,

      previousMissionId,
      previousMissionTitle,

      currentMissionId,
      currentMissionTitle,

      description:
        "There is currently no highest-priority mission.",
    };
  }

  if (
    !previousMissionTitle &&
    currentMissionTitle
  ) {
    return {
      changed: true,

      previousMissionId,
      previousMissionTitle,

      currentMissionId,
      currentMissionTitle,

      description:
        `"${currentMissionTitle}" is now the highest-priority mission.`,
    };
  }

  if (
    previousMissionTitle &&
    !currentMissionTitle
  ) {
    return {
      changed: true,

      previousMissionId,
      previousMissionTitle,

      currentMissionId,
      currentMissionTitle,

      description:
        `"${previousMissionTitle}" is no longer active and no replacement priority mission was identified.`,
    };
  }

  return {
    changed: true,

    previousMissionId,
    previousMissionTitle,

    currentMissionId,
    currentMissionTitle,

    description:
      `The highest-priority mission changed from "${previousMissionTitle}" to "${currentMissionTitle}".`,
  };
}

function createSourceChanges(
  previousSnapshot: VaultBrainOperationalSnapshot,
  currentSnapshot: VaultBrainOperationalSnapshot,
): ExecutiveMemorySourceChange[] {
  const previousStatuses =
    new Map(
      previousSnapshot.sourceStatuses.map(
        (status) => [
          status.source,
          status,
        ],
      ),
    );

  return currentSnapshot.sourceStatuses
    .map((currentStatus) => {
      const previousStatus =
        previousStatuses.get(
          currentStatus.source,
        );

      if (!previousStatus) {
        return {
          source:
            currentStatus.source,

          label:
            currentStatus.label,

          previousStatus:
            "unknown" as const,

          currentStatus:
            currentStatus.status,

          direction:
            currentStatus.status ===
            "healthy"
              ? "improved" as const
              : "unknown" as const,

          tone:
            currentStatus.status ===
            "healthy"
              ? "positive" as const
              : "info" as const,

          description:
            `${currentStatus.label} is now being tracked with a ${currentStatus.status} connection status.`,
        };
      }

      const previousWeight =
        SOURCE_STATUS_WEIGHT[
          previousStatus.status
        ];

      const currentWeight =
        SOURCE_STATUS_WEIGHT[
          currentStatus.status
        ];

      let direction:
        ExecutiveMemoryDirection =
          "stable";

      if (
        currentWeight >
        previousWeight
      ) {
        direction = "improved";
      }

      if (
        currentWeight <
        previousWeight
      ) {
        direction = "declined";
      }

      return {
        source:
          currentStatus.source,

        label:
          currentStatus.label,

        previousStatus:
          previousStatus.status,

        currentStatus:
          currentStatus.status,

        direction,

        tone:
          getToneForDirection(
            direction,
          ),

        description:
          direction === "stable"
            ? `${currentStatus.label} remained ${currentStatus.status}.`
            : `${currentStatus.label} changed from ${previousStatus.status} to ${currentStatus.status}.`,
      };
    })
    .filter(
      (change) =>
        change.direction !==
        "stable",
    );
}

function createInsights({
  metricChanges,
  sourceChanges,
  missionChange,
}: {
  metricChanges: ExecutiveMemoryMetricChange[];
  sourceChanges: ExecutiveMemorySourceChange[];
  missionChange: ExecutiveMemoryMissionChange;
}): ExecutiveMemoryInsight[] {
  const insights:
    ExecutiveMemoryInsight[] = [];

  for (
    const change of metricChanges
  ) {
    if (
      change.direction ===
        "stable" ||
      change.direction ===
        "unknown"
    ) {
      continue;
    }

    let priority = 50;

    if (
      change.id ===
      "inventory-health"
    ) {
      priority = 95;
    }

    if (
      change.id ===
        "out-of-stock-products" ||
      change.id ===
        "critical-missions"
    ) {
      priority = 100;
    }

    if (
      change.id ===
        "low-stock-products" ||
      change.id ===
        "actionable-missions"
    ) {
      priority = 90;
    }

    if (
      change.id === "cash" ||
      change.id ===
        "purchasing-power"
    ) {
      priority = 80;
    }

    insights.push({
      id:
        `metric-${change.id}`,

      title:
        change.label,

      description:
        change.description,

      direction:
        change.direction,

      tone:
        change.tone,

      source:
        change.id.startsWith(
          "inventory",
        ) ||
        change.id.includes(
          "stock",
        ) ||
        change.id ===
          "monitored-products"
          ? "inventory"
          : change.id.includes(
                "mission",
              )
            ? "missions"
            : change.id ===
                  "cash" ||
                change.id ===
                  "purchasing-power"
              ? "capital"
              : "commercial",

      priority,
    });
  }

  for (
    const change of sourceChanges
  ) {
    insights.push({
      id:
        `source-${change.source}`,

      title:
        `${change.label} connection`,

      description:
        change.description,

      direction:
        change.direction,

      tone:
        change.tone,

      source:
        change.source,

      priority:
        change.direction ===
        "declined"
          ? 98
          : 65,
    });
  }

  if (missionChange.changed) {
    insights.push({
      id:
        "highest-priority-mission",

      title:
        "Priority mission changed",

      description:
        missionChange.description,

      direction:
        "stable",

      tone:
        "info",

      source:
        "missions",

      priority: 92,
    });
  }

  return insights
    .sort(
      (first, second) =>
        second.priority -
        first.priority,
    )
    .slice(0, 8);
}

function calculateConfidence(
  previousSnapshot: VaultBrainOperationalSnapshot,
  currentSnapshot: VaultBrainOperationalSnapshot,
): number {
  const missionConfidence =
    currentSnapshot.missions
      .averageConfidence;

  const currentHealthySources =
    currentSnapshot.sourceStatuses.filter(
      (source) =>
        source.status ===
        "healthy",
    ).length;

  const totalSources =
    currentSnapshot.sourceStatuses
      .length;

  const sourceConfidence =
    totalSources > 0
      ? (
          currentHealthySources /
          totalSources
        ) * 100
      : 0;

  const snapshotAgeMs =
    new Date(
      currentSnapshot.generatedAt,
    ).getTime() -
    new Date(
      previousSnapshot.generatedAt,
    ).getTime();

  const chronologyConfidence =
    snapshotAgeMs >= 0
      ? 100
      : 60;

  return roundValue(
    (
      missionConfidence +
      sourceConfidence +
      chronologyConfidence
    ) / 3,
  );
}

function createOverallSummary({
  improvedSignals,
  declinedSignals,
  stableSignals,
}: {
  improvedSignals: number;
  declinedSignals: number;
  stableSignals: number;
}): {
  direction: ExecutiveMemoryDirection;
  headline: string;
  summary: string;
} {
  if (
    improvedSignals === 0 &&
    declinedSignals === 0
  ) {
    return {
      direction: "stable",

      headline:
        "Operational position remains stable",

      summary:
        `${stableSignals} monitored signals remained unchanged since the previous operational snapshot.`,
    };
  }

  if (
    improvedSignals >
    declinedSignals
  ) {
    return {
      direction: "improved",

      headline:
        "Operational position has improved",

      summary:
        `${improvedSignals} signals improved, ${declinedSignals} declined and ${stableSignals} remained stable since the previous snapshot.`,
    };
  }

  if (
    declinedSignals >
    improvedSignals
  ) {
    return {
      direction: "declined",

      headline:
        "Operational pressure has increased",

      summary:
        `${declinedSignals} signals declined, ${improvedSignals} improved and ${stableSignals} remained stable since the previous snapshot.`,
    };
  }

  return {
    direction: "stable",

    headline:
      "Operational movement is balanced",

    summary:
      `${improvedSignals} signals improved, ${declinedSignals} declined and ${stableSignals} remained stable since the previous snapshot.`,
  };
}

/* ============================================================
   PUBLIC ENGINE
============================================================ */

export function createExecutiveMemory(
  previousSnapshot:
    | VaultBrainOperationalSnapshot
    | null,
  currentSnapshot: VaultBrainOperationalSnapshot,
): ExecutiveMemoryResult {
  if (!previousSnapshot) {
    return {
      generatedAt:
        new Date().toISOString(),

      previousGeneratedAt:
        null,

      currentGeneratedAt:
        currentSnapshot.generatedAt,

      hasPreviousSnapshot:
        false,

      direction:
        "unknown",

      headline:
        "Executive Memory baseline created",

      summary:
        "Vault Brain has stored the first trusted operational state. Changes will be available after the next snapshot.",

      metricChanges: [],
      sourceChanges: [],

      missionChange: {
        changed: false,

        previousMissionId:
          null,

        previousMissionTitle:
          null,

        currentMissionId:
          currentSnapshot.missions
            .highestPriorityMissionId,

        currentMissionTitle:
          currentSnapshot.missions
            .highestPriorityMissionTitle,

        description:
          "A previous operational snapshot is not yet available for mission comparison.",
      },

      insights: [],

      improvedSignals: 0,
      declinedSignals: 0,
      stableSignals: 0,

      confidence: 100,
    };
  }

  const metricChanges:
    ExecutiveMemoryMetricChange[] = [
    createMetricChange({
      id: "inventory-health",
      label: "Inventory health",
      previousValue:
        previousSnapshot.inventory
          .score,
      currentValue:
        currentSnapshot.inventory
          .score,
      preference:
        "higher-is-better",
      unit: "percent",
    }),

    createMetricChange({
      id: "healthy-products",
      label: "Healthy products",
      previousValue:
        previousSnapshot.inventory
          .healthyProducts,
      currentValue:
        currentSnapshot.inventory
          .healthyProducts,
      preference:
        "higher-is-better",
    }),

    createMetricChange({
      id: "low-stock-products",
      label: "Low-stock products",
      previousValue:
        previousSnapshot.inventory
          .lowStockProducts,
      currentValue:
        currentSnapshot.inventory
          .lowStockProducts,
      preference:
        "lower-is-better",
    }),

    createMetricChange({
      id: "out-of-stock-products",
      label:
        "Unavailable products",
      previousValue:
        previousSnapshot.inventory
          .outOfStockProducts,
      currentValue:
        currentSnapshot.inventory
          .outOfStockProducts,
      preference:
        "lower-is-better",
    }),

    createMetricChange({
      id: "monitored-products",
      label:
        "Monitored products",
      previousValue:
        previousSnapshot.inventory
          .totalProducts,
      currentValue:
        currentSnapshot.inventory
          .totalProducts,
      preference: "neutral",
    }),

    createMetricChange({
      id: "actionable-missions",
      label:
        "Actionable missions",
      previousValue:
        previousSnapshot.missions
          .actionable,
      currentValue:
        currentSnapshot.missions
          .actionable,
      preference:
        "lower-is-better",
    }),

    createMetricChange({
      id: "critical-missions",
      label:
        "Critical missions",
      previousValue:
        previousSnapshot.missions
          .critical,
      currentValue:
        currentSnapshot.missions
          .critical,
      preference:
        "lower-is-better",
    }),

    createMetricChange({
      id: "high-priority-missions",
      label:
        "High-priority missions",
      previousValue:
        previousSnapshot.missions
          .high,
      currentValue:
        currentSnapshot.missions
          .high,
      preference:
        "lower-is-better",
    }),

    createMetricChange({
      id: "mission-confidence",
      label:
        "Mission confidence",
      previousValue:
        previousSnapshot.missions
          .averageConfidence,
      currentValue:
        currentSnapshot.missions
          .averageConfidence,
      preference:
        "higher-is-better",
      unit: "percent",
    }),

    createMetricChange({
      id: "orders",
      label: "Orders",
      previousValue:
        previousSnapshot.trading
          .orderCount,
      currentValue:
        currentSnapshot.trading
          .orderCount,
      preference:
        "higher-is-better",
    }),

    createMetricChange({
      id: "revenue",
      label: "Revenue",
      previousValue:
        previousSnapshot.trading
          .grossRevenueGbp,
      currentValue:
        currentSnapshot.trading
          .grossRevenueGbp,
      preference:
        "higher-is-better",
      unit: "currency",
    }),

    createMetricChange({
      id: "profit",
      label: "Profit",
      previousValue:
        previousSnapshot.trading
          .profitGbp,
      currentValue:
        currentSnapshot.trading
          .profitGbp,
      preference:
        "higher-is-better",
      unit: "currency",
    }),

    createMetricChange({
      id: "cash",
      label:
        "Available cash",
      previousValue:
        previousSnapshot.cash
          .availableCashGbp,
      currentValue:
        currentSnapshot.cash
          .availableCashGbp,
      preference:
        "higher-is-better",
      unit: "currency",
    }),

    createMetricChange({
      id: "purchasing-power",
      label:
        "Purchasing power",
      previousValue:
        previousSnapshot.cash
          .availablePurchasingPowerGbp,
      currentValue:
        currentSnapshot.cash
          .availablePurchasingPowerGbp,
      preference:
        "higher-is-better",
      unit: "currency",
    }),
  ];

  const sourceChanges =
    createSourceChanges(
      previousSnapshot,
      currentSnapshot,
    );

  const missionChange =
    createMissionChange(
      previousSnapshot,
      currentSnapshot,
    );

  const improvedSignals =
    metricChanges.filter(
      (change) =>
        change.direction ===
        "improved",
    ).length +
    sourceChanges.filter(
      (change) =>
        change.direction ===
        "improved",
    ).length;

  const declinedSignals =
    metricChanges.filter(
      (change) =>
        change.direction ===
        "declined",
    ).length +
    sourceChanges.filter(
      (change) =>
        change.direction ===
        "declined",
    ).length;

  const stableSignals =
    metricChanges.filter(
      (change) =>
        change.direction ===
        "stable",
    ).length;

  const overall =
    createOverallSummary({
      improvedSignals,
      declinedSignals,
      stableSignals,
    });

  const insights =
    createInsights({
      metricChanges,
      sourceChanges,
      missionChange,
    });

  return {
    generatedAt:
      new Date().toISOString(),

    previousGeneratedAt:
      previousSnapshot.generatedAt,

    currentGeneratedAt:
      currentSnapshot.generatedAt,

    hasPreviousSnapshot:
      true,

    direction:
      overall.direction,

    headline:
      overall.headline,

    summary:
      overall.summary,

    metricChanges,
    sourceChanges,
    missionChange,

    insights,

    improvedSignals,
    declinedSignals,
    stableSignals,

    confidence:
      calculateConfidence(
        previousSnapshot,
        currentSnapshot,
      ),
  };
}