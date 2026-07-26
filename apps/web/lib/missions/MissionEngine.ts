import {
  calculateMissionScore,
  compareMissionScores,
} from "@/lib/missions/MissionPriority";

import type {
  Mission,
  MissionDraft,
  MissionPriorityBand,
  MissionQuery,
  MissionSource,
  MissionStatus,
  MissionSummary,
  MissionType,
} from "@/types/missions";

function normaliseDate(
  value: string | undefined,
  fallback: Date,
): string {
  if (!value) {
    return fallback.toISOString();
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return fallback.toISOString();
  }

  return parsedDate.toISOString();
}

function matchesValue<T>(
  value: T,
  queryValue: T | T[] | undefined,
): boolean {
  if (queryValue === undefined) {
    return true;
  }

  if (Array.isArray(queryValue)) {
    return queryValue.includes(value);
  }

  return value === queryValue;
}

function isActionableStatus(status: MissionStatus): boolean {
  return (
    status === "new" ||
    status === "active" ||
    status === "waiting"
  );
}

function createStableMissionId(draft: MissionDraft): string {
  const source = draft.source.replace(/[^a-z0-9]+/gi, "-");
  const type = draft.type.replace(/[^a-z0-9]+/gi, "-");
  const id = draft.id.replace(/[^a-z0-9]+/gi, "-");

  return `${source}:${type}:${id}`.toLowerCase();
}

export function createMission(
  draft: MissionDraft,
  generatedAt: Date = new Date(),
): Mission {
  const createdAt = normaliseDate(
    draft.createdAt,
    generatedAt,
  );

  const updatedAt = normaliseDate(
    draft.updatedAt,
    new Date(createdAt),
  );

  return {
    ...draft,
    id: createStableMissionId(draft),
    score: calculateMissionScore(draft.score),
    createdAt,
    updatedAt,
  };
}

export function createMissions(
  drafts: MissionDraft[],
  generatedAt: Date = new Date(),
): Mission[] {
  const missionsById = new Map<string, Mission>();

  drafts.forEach((draft) => {
    const mission = createMission(draft, generatedAt);
    const existingMission = missionsById.get(mission.id);

    if (!existingMission) {
      missionsById.set(mission.id, mission);
      return;
    }

    const preferredMission =
      compareMissionScores(
        mission.score,
        existingMission.score,
      ) < 0
        ? mission
        : existingMission;

    missionsById.set(mission.id, preferredMission);
  });

  return sortMissions(Array.from(missionsById.values()));
}

export function sortMissions(
  missions: Mission[],
): Mission[] {
  return [...missions].sort((first, second) => {
    const scoreComparison = compareMissionScores(
      first.score,
      second.score,
    );

    if (scoreComparison !== 0) {
      return scoreComparison;
    }

    const firstCreatedAt = new Date(
      first.createdAt,
    ).getTime();

    const secondCreatedAt = new Date(
      second.createdAt,
    ).getTime();

    return firstCreatedAt - secondCreatedAt;
  });
}

export function filterMissions(
  missions: Mission[],
  query: MissionQuery,
): Mission[] {
  return missions.filter((mission) => {
    return (
      matchesValue<MissionStatus>(
        mission.status,
        query.status,
      ) &&
      matchesValue<MissionSource>(
        mission.source,
        query.source,
      ) &&
      matchesValue<MissionType>(
        mission.type,
        query.type,
      ) &&
      matchesValue<MissionPriorityBand>(
        mission.score.priority,
        query.priority,
      )
    );
  });
}

export function getActionableMissions(
  missions: Mission[],
): Mission[] {
  return sortMissions(
    missions.filter((mission) =>
      isActionableStatus(mission.status),
    ),
  );
}

export function getHighestPriorityMission(
  missions: Mission[],
): Mission | undefined {
  return getActionableMissions(missions)[0];
}

export function createMissionSummary(
  missions: Mission[],
): MissionSummary {
  const actionableMissions = missions.filter((mission) =>
    isActionableStatus(mission.status),
  );

  const confidenceTotal = missions.reduce(
    (total, mission) =>
      total + mission.score.confidence,
    0,
  );

  return {
    total: missions.length,
    actionable: actionableMissions.length,
    critical: missions.filter(
      (mission) =>
        mission.score.priority === "critical",
    ).length,
    high: missions.filter(
      (mission) =>
        mission.score.priority === "high",
    ).length,
    averageConfidence:
      missions.length === 0
        ? 0
        : Math.round(
            (confidenceTotal / missions.length) * 10,
          ) / 10,
  };
}

export class MissionEngine {
  create(
    drafts: MissionDraft[],
    generatedAt: Date = new Date(),
  ): Mission[] {
    return createMissions(drafts, generatedAt);
  }

  sort(missions: Mission[]): Mission[] {
    return sortMissions(missions);
  }

  filter(
    missions: Mission[],
    query: MissionQuery,
  ): Mission[] {
    return filterMissions(missions, query);
  }

  actionable(missions: Mission[]): Mission[] {
    return getActionableMissions(missions);
  }

  highestPriority(
    missions: Mission[],
  ): Mission | undefined {
    return getHighestPriorityMission(missions);
  }

  summarise(
    missions: Mission[],
  ): MissionSummary {
    return createMissionSummary(missions);
  }
}

export const missionEngine = new MissionEngine();