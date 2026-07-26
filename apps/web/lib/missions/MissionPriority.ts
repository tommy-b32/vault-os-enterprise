import type {
  MissionPriorityBand,
  MissionScore,
  MissionScoreInput,
} from "@/types/missions";

const SCORE_MIN = 0;
const SCORE_MAX = 100;

const SCORE_WEIGHTS = {
  impact: 0.45,
  urgency: 0.35,
  confidence: 0.2,
} as const;

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return SCORE_MIN;
  }

  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, value));
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

export function getMissionPriorityBand(
  totalScore: number,
): MissionPriorityBand {
  const score = clampScore(totalScore);

  if (score >= 85) {
    return "critical";
  }

  if (score >= 70) {
    return "high";
  }

  if (score >= 45) {
    return "medium";
  }

  return "low";
}

export function calculateMissionScore(
  input: MissionScoreInput,
): MissionScore {
  const impact = clampScore(input.impact);
  const urgency = clampScore(input.urgency);
  const confidence = clampScore(input.confidence);

  const total = roundScore(
    impact * SCORE_WEIGHTS.impact +
      urgency * SCORE_WEIGHTS.urgency +
      confidence * SCORE_WEIGHTS.confidence,
  );

  return {
    impact,
    urgency,
    confidence,
    total,
    priority: getMissionPriorityBand(total),
  };
}

export function compareMissionScores(
  first: MissionScore,
  second: MissionScore,
): number {
  if (first.total !== second.total) {
    return second.total - first.total;
  }

  if (first.urgency !== second.urgency) {
    return second.urgency - first.urgency;
  }

  if (first.impact !== second.impact) {
    return second.impact - first.impact;
  }

  return second.confidence - first.confidence;
}