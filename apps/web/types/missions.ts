export const MISSION_TYPES = [
  "restock",
  "pricing",
  "supplier-review",
  "margin-improvement",
  "dead-stock",
  "catalogue-update",
  "purchase-order",
  "data-quality",
] as const;

export type MissionType = (typeof MISSION_TYPES)[number];

export const MISSION_SOURCES = [
  "inventory",
  "commercial",
  "supplier",
  "catalogue",
  "purchasing",
  "vault-brain",
] as const;

export type MissionSource = (typeof MISSION_SOURCES)[number];

export type MissionStatus =
  | "new"
  | "active"
  | "waiting"
  | "completed"
  | "dismissed";

export type MissionPriorityBand =
  | "critical"
  | "high"
  | "medium"
  | "low";

export type MissionAction = {
  id: string;
  label: string;
  href?: string;
  kind: "primary" | "secondary";
};

export type MissionEvidence = {
  label: string;
  value: string;
};

export type MissionScoreInput = {
  impact: number;
  urgency: number;
  confidence: number;
};

export type MissionScore = MissionScoreInput & {
  total: number;
  priority: MissionPriorityBand;
};

export type MissionMetadata = Record<
  string,
  string | number | boolean | null | undefined
>;

export type Mission = {
  id: string;
  type: MissionType;
  source: MissionSource;
  title: string;
  summary: string;
  outcome: string;
  status: MissionStatus;
  score: MissionScore;
  actions: MissionAction[];
  evidence: MissionEvidence[];
  metadata: MissionMetadata;
  createdAt: string;
  updatedAt: string;
  dueAt?: string;
};

export type MissionDraft = Omit<
  Mission,
  "score" | "createdAt" | "updatedAt"
> & {
  score: MissionScoreInput;
  createdAt?: string;
  updatedAt?: string;
};

export type MissionQuery = {
  status?: MissionStatus | MissionStatus[];
  source?: MissionSource | MissionSource[];
  type?: MissionType | MissionType[];
  priority?: MissionPriorityBand | MissionPriorityBand[];
};

export type MissionSummary = {
  total: number;
  actionable: number;
  critical: number;
  high: number;
  averageConfidence: number;
};