import type {
  VaultBrainDataSource,
  VaultBrainSignalTone,
} from "@/lib/brain/types";

/* ============================================================
   PREDICTION CONTRACTS
============================================================ */

export type PredictionCategory =
  | "inventory"
  | "revenue"
  | "orders"
  | "profit"
  | "capital"
  | "supplier"
  | "mission"
  | "operations";

export type PredictionStatus =
  | "watching"
  | "likely"
  | "highly_likely"
  | "resolved";

export type PredictionDirection =
  | "increase"
  | "decrease"
  | "stable"
  | "risk"
  | "unknown";

export type PredictionWindow = {
  label: string;
  startsAt: string;
  endsAt: string;
  days: number;
};

export type PredictionRange = {
  minimum: number;
  maximum: number;
  unit:
    | "gbp"
    | "orders"
    | "units"
    | "percentage"
    | "days";
};

export type PredictionRecommendation = {
  title: string;
  explanation: string;

  actionLabel?: string;
  actionHref?: string;
};

export type PredictionEvidence = {
  id: string;

  source: VaultBrainDataSource;
  label: string;
  explanation: string;

  confidence: number;

  value?: number | null;
  unit?:
    | "gbp"
    | "orders"
    | "units"
    | "percentage"
    | "days"
    | null;
};

export type PredictionInput = {
  id: string;

  category: PredictionCategory;
  title: string;
  summary: string;

  source: VaultBrainDataSource;

  direction: PredictionDirection;
  tone: VaultBrainSignalTone;

  window: PredictionWindow;

  predictedRange?: PredictionRange | null;
  predictedValue?: number | null;

  currentValue?: number | null;
  thresholdValue?: number | null;

  potentialRevenueAtRiskGbp?: number | null;
  potentialProfitImpactGbp?: number | null;

  baseConfidence: number;
  historicalAccuracy?: number | null;
  observationCount?: number;

  recommendation:
    PredictionRecommendation;

  evidence: PredictionEvidence[];

  tags?: string[];
};

export type VaultBrainPrediction = {
  id: string;

  category: PredictionCategory;
  title: string;
  summary: string;

  source: VaultBrainDataSource;

  direction: PredictionDirection;
  tone: VaultBrainSignalTone;
  status: PredictionStatus;

  window: PredictionWindow;

  predictedRange: PredictionRange | null;
  predictedValue: number | null;

  currentValue: number | null;
  thresholdValue: number | null;

  potentialRevenueAtRiskGbp: number | null;
  potentialProfitImpactGbp: number | null;

  confidence: number;
  evidenceStrength: number;

  recommendation:
    PredictionRecommendation;

  evidence: PredictionEvidence[];

  tags: string[];
};

export type PredictionEngineResult = {
  generatedAt: string;

  predictions: VaultBrainPrediction[];

  highestPriorityPrediction:
    VaultBrainPrediction | null;

  highestConfidencePrediction:
    VaultBrainPrediction | null;

  inventoryPredictions:
    VaultBrainPrediction[];

  commercialPredictions:
    VaultBrainPrediction[];

  capitalPredictions:
    VaultBrainPrediction[];

  warningCount: number;
  criticalCount: number;

  confidence: number;
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

function calculateEvidenceStrength(
  evidence: PredictionEvidence[],
): number {
  if (evidence.length === 0) {
    return 0;
  }

  const averageConfidence =
    evidence.reduce(
      (total, item) =>
        total +
        clampPercentage(
          item.confidence,
        ),
      0,
    ) / evidence.length;

  const evidenceVolumeBonus =
    Math.min(
      10,
      Math.max(
        0,
        evidence.length - 1,
      ) * 2,
    );

  return clampPercentage(
    averageConfidence +
      evidenceVolumeBonus,
  );
}

function calculatePredictionConfidence(
  input: PredictionInput,
  evidenceStrength: number,
): number {
  const historicalAccuracy =
    input.historicalAccuracy ??
    input.baseConfidence;

  const observationCount =
    Math.max(
      0,
      input.observationCount ?? 0,
    );

  const observationBonus =
    Math.min(
      8,
      observationCount * 1.5,
    );

  return clampPercentage(
    input.baseConfidence * 0.45 +
      historicalAccuracy * 0.3 +
      evidenceStrength * 0.25 +
      observationBonus,
  );
}

function getPredictionStatus(
  confidence: number,
): PredictionStatus {
  if (confidence >= 88) {
    return "highly_likely";
  }

  if (confidence >= 68) {
    return "likely";
  }

  return "watching";
}

function getTonePriority(
  tone: VaultBrainSignalTone,
): number {
  switch (tone) {
    case "critical":
      return 100;

    case "warning":
      return 82;

    case "positive":
      return 60;

    case "info":
      return 48;

    case "neutral":
      return 35;
  }
}

function getCategoryPriority(
  category: PredictionCategory,
): number {
  switch (category) {
    case "inventory":
      return 90;

    case "capital":
      return 86;

    case "profit":
      return 84;

    case "supplier":
      return 82;

    case "revenue":
      return 78;

    case "orders":
      return 72;

    case "mission":
      return 68;

    case "operations":
      return 62;
  }
}

function calculatePredictionPriority(
  prediction: VaultBrainPrediction,
): number {
  const revenueRiskWeight =
    Math.min(
      25,
      Math.max(
        0,
        (
          prediction
            .potentialRevenueAtRiskGbp ??
          0
        ) / 500,
      ),
    );

  return (
    getTonePriority(
      prediction.tone,
    ) *
      0.4 +
    getCategoryPriority(
      prediction.category,
    ) *
      0.3 +
    prediction.confidence *
      0.3 +
    revenueRiskWeight
  );
}

function createPrediction(
  input: PredictionInput,
): VaultBrainPrediction {
  const evidenceStrength =
    calculateEvidenceStrength(
      input.evidence,
    );

  const confidence =
    calculatePredictionConfidence(
      input,
      evidenceStrength,
    );

  return {
    id: input.id,

    category: input.category,
    title: input.title,
    summary: input.summary,

    source: input.source,

    direction: input.direction,
    tone: input.tone,
    status:
      getPredictionStatus(
        confidence,
      ),

    window: input.window,

    predictedRange:
      input.predictedRange ?? null,

    predictedValue:
      input.predictedValue ?? null,

    currentValue:
      input.currentValue ?? null,

    thresholdValue:
      input.thresholdValue ?? null,

    potentialRevenueAtRiskGbp:
      input.potentialRevenueAtRiskGbp ??
      null,

    potentialProfitImpactGbp:
      input.potentialProfitImpactGbp ??
      null,

    confidence,
    evidenceStrength,

    recommendation:
      input.recommendation,

    evidence: input.evidence,

    tags: input.tags ?? [],
  };
}

function calculateResultConfidence(
  predictions: VaultBrainPrediction[],
): number {
  if (predictions.length === 0) {
    return 0;
  }

  const weightedTotal =
    predictions.reduce(
      (total, prediction) =>
        total +
        prediction.confidence *
          Math.max(
            calculatePredictionPriority(
              prediction,
            ),
            1,
          ),
      0,
    );

  const totalWeight =
    predictions.reduce(
      (total, prediction) =>
        total +
        Math.max(
          calculatePredictionPriority(
            prediction,
          ),
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

export const PredictionEngine = {
  analyse(
    inputs: PredictionInput[],
    generatedAt = new Date().toISOString(),
  ): PredictionEngineResult {
    const predictions =
      inputs
        .map(createPrediction)
        .sort((a, b) => {
          const priorityDifference =
            calculatePredictionPriority(
              b,
            ) -
            calculatePredictionPriority(
              a,
            );

          if (
            priorityDifference !== 0
          ) {
            return priorityDifference;
          }

          return (
            b.confidence -
            a.confidence
          );
        });

    const highestPriorityPrediction =
      predictions[0] ?? null;

    const highestConfidencePrediction =
      [...predictions].sort(
        (a, b) =>
          b.confidence -
          a.confidence,
      )[0] ?? null;

    const inventoryPredictions =
      predictions.filter(
        (prediction) =>
          prediction.category ===
          "inventory",
      );

    const commercialPredictions =
      predictions.filter(
        (prediction) =>
          prediction.category ===
            "revenue" ||
          prediction.category ===
            "orders" ||
          prediction.category ===
            "profit",
      );

    const capitalPredictions =
      predictions.filter(
        (prediction) =>
          prediction.category ===
          "capital",
      );

    return {
      generatedAt,

      predictions,

      highestPriorityPrediction,

      highestConfidencePrediction,

      inventoryPredictions,

      commercialPredictions,

      capitalPredictions,

      warningCount:
        predictions.filter(
          (prediction) =>
            prediction.tone ===
            "warning",
        ).length,

      criticalCount:
        predictions.filter(
          (prediction) =>
            prediction.tone ===
            "critical",
        ).length,

      confidence:
        calculateResultConfidence(
          predictions,
        ),
    };
  },
} as const;