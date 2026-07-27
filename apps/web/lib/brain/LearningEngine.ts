import type {
  VaultBrainDataSource,
  VaultBrainSignalTone,
} from "@/lib/brain/types";

/* ============================================================
   LEARNING CONTRACTS
============================================================ */

export type LearningCategory =
  | "inventory"
  | "supplier"
  | "commercial"
  | "promotion"
  | "customer"
  | "capital"
  | "mission"
  | "operations";

export type LearningOutcome =
  | "positive"
  | "negative"
  | "mixed"
  | "unknown";

export type LearningStatus =
  | "observing"
  | "emerging"
  | "established"
  | "retired";

export type LearningEvidence = {
  id: string;
  occurredAt: string;

  source: VaultBrainDataSource;
  description: string;

  valueGbp?: number | null;
  percentage?: number | null;
  units?: number | null;

  outcome: LearningOutcome;
};

export type LearningRecommendation = {
  title: string;
  explanation: string;

  actionLabel?: string;
  actionHref?: string;
};

export type VaultBrainLearning = {
  id: string;

  category: LearningCategory;
  title: string;
  summary: string;

  pattern: string;
  consequence: string;

  recommendation:
    LearningRecommendation;

  tone: VaultBrainSignalTone;
  status: LearningStatus;

  confidence: number;
  timesObserved: number;

  firstObservedAt: string;
  lastObservedAt: string;

  evidence: LearningEvidence[];

  tags: string[];
};

export type LearningObservation = {
  id: string;

  learningKey: string;
  category: LearningCategory;

  title: string;
  pattern: string;
  consequence: string;

  recommendation:
    LearningRecommendation;

  source: VaultBrainDataSource;
  occurredAt: string;

  outcome: LearningOutcome;
  tone: VaultBrainSignalTone;

  confidence: number;

  valueGbp?: number | null;
  percentage?: number | null;
  units?: number | null;

  tags?: string[];
};

export type LearningEngineResult = {
  generatedAt: string;

  learnings: VaultBrainLearning[];

  established: VaultBrainLearning[];
  emerging: VaultBrainLearning[];
  observing: VaultBrainLearning[];

  highestConfidenceLearning:
    VaultBrainLearning | null;

  mostRecentlyUpdatedLearning:
    VaultBrainLearning | null;
};

/* ============================================================
   HELPERS
============================================================ */

function clampPercentage(
  value: number,
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(0, Math.round(value)),
  );
}

function getLearningStatus(
  timesObserved: number,
  confidence: number,
): LearningStatus {
  if (
    timesObserved >= 5 &&
    confidence >= 85
  ) {
    return "established";
  }

  if (
    timesObserved >= 3 &&
    confidence >= 65
  ) {
    return "emerging";
  }

  return "observing";
}

function calculateCombinedConfidence(
  observations: LearningObservation[],
): number {
  if (observations.length === 0) {
    return 0;
  }

  const averageConfidence =
    observations.reduce(
      (total, observation) =>
        total +
        clampPercentage(
          observation.confidence,
        ),
      0,
    ) / observations.length;

  const repetitionBonus =
    Math.min(
      12,
      Math.max(
        0,
        observations.length - 1,
      ) * 3,
    );

  const conflictingOutcomes =
    new Set(
      observations.map(
        (observation) =>
          observation.outcome,
      ),
    ).size > 1;

  const conflictPenalty =
    conflictingOutcomes ? 8 : 0;

  return clampPercentage(
    averageConfidence +
      repetitionBonus -
      conflictPenalty,
  );
}

function sortByDateAscending<
  T extends {
    occurredAt: string;
  },
>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      new Date(
        a.occurredAt,
      ).getTime() -
      new Date(
        b.occurredAt,
      ).getTime(),
  );
}

function createEvidence(
  observation: LearningObservation,
): LearningEvidence {
  return {
    id: observation.id,
    occurredAt:
      observation.occurredAt,

    source: observation.source,
    description:
      observation.consequence,

    valueGbp:
      observation.valueGbp ?? null,

    percentage:
      observation.percentage ?? null,

    units:
      observation.units ?? null,

    outcome: observation.outcome,
  };
}

function createLearning(
  observations: LearningObservation[],
): VaultBrainLearning {
  const orderedObservations =
    sortByDateAscending(
      observations,
    );

  const firstObservation =
    orderedObservations[0];

  const latestObservation =
    orderedObservations[
      orderedObservations.length - 1
    ];

  const confidence =
    calculateCombinedConfidence(
      orderedObservations,
    );

  const timesObserved =
    orderedObservations.length;

  const tags = Array.from(
    new Set(
      orderedObservations.flatMap(
        (observation) =>
          observation.tags ?? [],
      ),
    ),
  );

  return {
    id:
      firstObservation.learningKey,

    category:
      latestObservation.category,

    title:
      latestObservation.title,

    summary:
      `${latestObservation.pattern} ${latestObservation.consequence}`,

    pattern:
      latestObservation.pattern,

    consequence:
      latestObservation.consequence,

    recommendation:
      latestObservation.recommendation,

    tone:
      latestObservation.tone,

    status:
      getLearningStatus(
        timesObserved,
        confidence,
      ),

    confidence,
    timesObserved,

    firstObservedAt:
      firstObservation.occurredAt,

    lastObservedAt:
      latestObservation.occurredAt,

    evidence:
      orderedObservations.map(
        createEvidence,
      ),

    tags,
  };
}

function groupObservations(
  observations: LearningObservation[],
): Map<
  string,
  LearningObservation[]
> {
  const groups = new Map<
    string,
    LearningObservation[]
  >();

  observations.forEach(
    (observation) => {
      const currentGroup =
        groups.get(
          observation.learningKey,
        ) ?? [];

      currentGroup.push(
        observation,
      );

      groups.set(
        observation.learningKey,
        currentGroup,
      );
    },
  );

  return groups;
}

/* ============================================================
   ENGINE
============================================================ */

export const LearningEngine = {
  analyse(
    observations: LearningObservation[],
    generatedAt = new Date().toISOString(),
  ): LearningEngineResult {
    const groupedObservations =
      groupObservations(
        observations,
      );

    const learnings =
      Array.from(
        groupedObservations.values(),
      )
        .map(createLearning)
        .sort((a, b) => {
          if (
            b.confidence !==
            a.confidence
          ) {
            return (
              b.confidence -
              a.confidence
            );
          }

          if (
            b.timesObserved !==
            a.timesObserved
          ) {
            return (
              b.timesObserved -
              a.timesObserved
            );
          }

          return (
            new Date(
              b.lastObservedAt,
            ).getTime() -
            new Date(
              a.lastObservedAt,
            ).getTime()
          );
        });

    const established =
      learnings.filter(
        (learning) =>
          learning.status ===
          "established",
      );

    const emerging =
      learnings.filter(
        (learning) =>
          learning.status ===
          "emerging",
      );

    const observing =
      learnings.filter(
        (learning) =>
          learning.status ===
          "observing",
      );

    const mostRecentlyUpdatedLearning =
      [...learnings].sort(
        (a, b) =>
          new Date(
            b.lastObservedAt,
          ).getTime() -
          new Date(
            a.lastObservedAt,
          ).getTime(),
      )[0] ?? null;

    return {
      generatedAt,

      learnings,

      established,
      emerging,
      observing,

      highestConfidenceLearning:
        learnings[0] ?? null,

      mostRecentlyUpdatedLearning,
    };
  },
} as const;