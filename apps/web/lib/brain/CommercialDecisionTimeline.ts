import type { AdvisorEngineResult } from "@/lib/brain/AdvisorEngine";
import type {
  TrustedBuyingCandidateRejectionReason,
  TrustedBuyingCandidateResult,
} from "@/lib/brain/TrustedBuyingCandidateClassifier";
import type {
  PredictionEngineResult,
  VaultBrainPrediction,
} from "@/lib/brain/PredictionEngine";

export type CommercialDecisionTimelineItem = {
  id: string;
  source:
    | "advisor"
    | "classifier"
    | "inventory"
    | "supplier"
    | "commercial"
    | "wallet"
    | "prediction"
    | "business_event"
    | "executive_memory";
  category: "decision" | "risk" | "blocker" | "change" | "forecast" | "follow_up";
  status: "actionable" | "blocked" | "monitoring" | "resolved" | "unavailable";
  priority: "critical" | "high" | "medium" | "low" | "informational";
  title: string;
  description: string | null;
  effectiveAt: string | null;
  deadlineAt: string | null;
  predictedAt: string | null;
  confidence: number | null;
  confidenceMeaning: string | null;
  entityType: string | null;
  entityId: string | null;
  destination: string | null;
  evidence: Array<{ label: string; value: string }>;
  blockerReasons: string[];
};

export type CommercialDecisionTimelineGroup =
  | "Now"
  | "Today"
  | "Upcoming"
  | "Monitoring"
  | "Blocked"
  | "Recently resolved";

export type CommercialDecisionTimelineResult = {
  generatedAt: string;
  highestPriorityAction: CommercialDecisionTimelineItem | null;
  groups: Array<{
    label: CommercialDecisionTimelineGroup;
    items: CommercialDecisionTimelineItem[];
  }>;
  items: CommercialDecisionTimelineItem[];
};

export const COMMERCIAL_TIMELINE_DESTINATIONS = [
  "/inventory",
  "/catalogue",
  "/commercial",
  "/advisor",
  "/purchase-orders",
  "/supplier-catalogue",
  "/orders",
] as const;

const DESTINATIONS = new Set<string>(COMMERCIAL_TIMELINE_DESTINATIONS);

const BLOCKER_PRESENTATION: Partial<Record<
  TrustedBuyingCandidateRejectionReason,
  {
    source: CommercialDecisionTimelineItem["source"];
    priority: CommercialDecisionTimelineItem["priority"];
    title: string;
    description: string;
    destination: string;
  }
>> = {
  inventory_stale: {
    source: "inventory",
    priority: "critical",
    title: "Refresh inventory intelligence",
    description: "Canonical inventory freshness is blocking trusted buying evidence.",
    destination: "/inventory",
  },
  inventory_unavailable: {
    source: "inventory",
    priority: "critical",
    title: "Restore inventory intelligence",
    description: "Canonical inventory evidence is currently unavailable.",
    destination: "/inventory",
  },
  supplier_minimum_unknown: {
    source: "supplier",
    priority: "high",
    title: "Set supplier minimum-order rules",
    description: "Unknown supplier minimums cannot be treated as satisfied.",
    destination: "/commercial",
  },
  target_stock_days_missing: {
    source: "inventory",
    priority: "high",
    title: "Complete target stock days",
    description: "Trusted replenishment quantity needs canonical target stock days.",
    destination: "/catalogue",
  },
  reorder_approval_missing: {
    source: "classifier",
    priority: "high",
    title: "Review reorder approvals",
    description: "Explicit operator approval is required before a reorder can be trusted.",
    destination: "/catalogue",
  },
  invalid_or_missing_commercial_cost: {
    source: "commercial",
    priority: "high",
    title: "Complete canonical commercial costs",
    description: "A positive canonical GBP landed cost is required for buying decisions.",
    destination: "/catalogue",
  },
};

function validDate(value: string | null | undefined): value is string {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

function priorityWeight(priority: CommercialDecisionTimelineItem["priority"]): number {
  return { critical: 5, high: 4, medium: 3, low: 2, informational: 1 }[priority];
}

function advisorItem(
  advisor: AdvisorEngineResult,
  generatedAt: string,
): CommercialDecisionTimelineItem | null {
  const opportunity = advisor.analysis.highestPriority;
  if (!opportunity) return null;
  const candidate = advisor.candidates.find((entry) => entry.styleId === opportunity.id);
  if (!candidate?.eligible) return null;

  return {
    id: `advisor-${opportunity.id}`,
    source: "advisor",
    category: "decision",
    status: "actionable",
    priority: opportunity.priority,
    title: opportunity.title,
    description: opportunity.description,
    effectiveAt: generatedAt,
    deadlineAt: null,
    predictedAt: null,
    confidence: opportunity.confidence,
    confidenceMeaning: "Advisor opportunity ranking confidence.",
    entityType: "catalogue_style",
    entityId: candidate.styleId,
    destination: "/advisor",
    evidence: [
      { label: "Expected gain", value: `£${opportunity.estimatedProfit.toFixed(2)}` },
      { label: "Suggested quantity", value: `${candidate.suggestedQuantity ?? "Unavailable"} packs` },
    ],
    blockerReasons: [],
  };
}

function classifierBlockers(
  candidates: TrustedBuyingCandidateResult[],
): CommercialDecisionTimelineItem[] {
  const counts = new Map<TrustedBuyingCandidateRejectionReason, number>();
  for (const candidate of candidates) {
    for (const reason of candidate.rejectionReasons) {
      if (BLOCKER_PRESENTATION[reason]) counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }

  return [...counts.entries()].map(([reason, count]) => {
    const presentation = BLOCKER_PRESENTATION[reason]!;
    return {
      id: `classifier-${reason}`,
      source: presentation.source,
      category: "blocker",
      status: "blocked",
      priority: presentation.priority,
      title: presentation.title,
      description: presentation.description,
      effectiveAt: null,
      deadlineAt: null,
      predictedAt: null,
      confidence: null,
      confidenceMeaning: null,
      entityType: "catalogue_style_set",
      entityId: null,
      destination: presentation.destination,
      evidence: [{ label: "Affected styles", value: String(count) }],
      blockerReasons: [reason],
    } satisfies CommercialDecisionTimelineItem;
  });
}

function monitoringItems(
  candidates: TrustedBuyingCandidateResult[],
): CommercialDecisionTimelineItem[] {
  const items: CommercialDecisionTimelineItem[] = [];
  const walletPolicyCount = candidates.filter((candidate) =>
    candidate.rejectionReasons.includes("wallet_freshness_policy_missing")).length;
  const walletTimestamp = candidates.map((candidate) =>
    candidate.capitalEvaluation.walletLastUpdated).find(validDate) ?? null;

  if (walletPolicyCount > 0) {
    items.push({
      id: "wallet-freshness-policy",
      source: "wallet",
      category: "follow_up",
      status: "monitoring",
      priority: "medium",
      title: "Wallet provenance available; freshness policy unresolved",
      description: "Capital affordability cannot be called current until a finance freshness policy exists.",
      effectiveAt: walletTimestamp,
      deadlineAt: null,
      predictedAt: null,
      confidence: null,
      confidenceMeaning: null,
      entityType: "purchasing_wallet",
      entityId: null,
      destination: "/commercial",
      evidence: [
        { label: "Affected styles", value: String(walletPolicyCount) },
        { label: "Wallet last updated", value: walletTimestamp ?? "Unavailable" },
      ],
      blockerReasons: ["wallet_freshness_policy_missing"],
    });
  }

  if (!candidates.some((candidate) => candidate.eligible)) {
    items.push({
      id: "advisor-no-trusted-candidate",
      source: "advisor",
      category: "risk",
      status: "monitoring",
      priority: "informational",
      title: "No trusted buying candidate yet",
      description: "Advisor is preserving current evidence and policy blockers without generating a recommendation.",
      effectiveAt: null,
      deadlineAt: null,
      predictedAt: null,
      confidence: null,
      confidenceMeaning: null,
      entityType: null,
      entityId: null,
      destination: "/advisor",
      evidence: [{ label: "Eligible styles", value: "0" }],
      blockerReasons: [],
    });
  }
  return items;
}

function predictionItem(
  prediction: VaultBrainPrediction,
  predictedAt: string,
): CommercialDecisionTimelineItem | null {
  const destination = prediction.recommendation.actionHref ?? null;
  if (
    prediction.evidence.length === 0 ||
    !validDate(predictedAt) ||
    !validDate(prediction.window.startsAt) ||
    !validDate(prediction.window.endsAt) ||
    !destination ||
    !DESTINATIONS.has(destination)
  ) return null;

  return {
    id: `prediction-${prediction.id}`,
    source: "prediction",
    category: "forecast",
    status: "monitoring",
    priority: prediction.tone === "critical" ? "critical" : prediction.tone === "warning" ? "high" : "medium",
    title: prediction.title,
    description: prediction.summary,
    effectiveAt: prediction.window.startsAt,
    deadlineAt: prediction.window.endsAt,
    predictedAt,
    confidence: prediction.confidence,
    confidenceMeaning: "Prediction confidence derived from base confidence, historical accuracy, evidence strength and observation count.",
    entityType: prediction.category,
    entityId: prediction.id,
    destination,
    evidence: prediction.evidence.map((entry) => ({ label: entry.label, value: entry.explanation })),
    blockerReasons: [],
  };
}

function groupFor(
  item: CommercialDecisionTimelineItem,
  generatedAt: string,
): CommercialDecisionTimelineGroup {
  if (item.status === "blocked" || item.status === "unavailable") return "Blocked";
  if (item.status === "resolved") return "Recently resolved";
  if (item.status === "actionable") return "Now";
  if (!validDate(item.effectiveAt)) return "Monitoring";
  const start = new Date(item.effectiveAt);
  const now = new Date(generatedAt);
  if (start.toDateString() === now.toDateString()) return "Today";
  return start > now ? "Upcoming" : "Monitoring";
}

export function buildCommercialDecisionTimeline({
  advisor,
  candidates,
  predictions = null,
  generatedAt,
}: {
  advisor: AdvisorEngineResult;
  candidates: TrustedBuyingCandidateResult[];
  predictions?: PredictionEngineResult | null;
  generatedAt: string;
}): CommercialDecisionTimelineResult {
  const action = advisorItem(advisor, generatedAt);
  const blockers = classifierBlockers(candidates)
    .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority))
    .slice(0, 3);
  const monitoring = monitoringItems(candidates).slice(0, 3);
  const forecasts = predictions
    ? predictions.predictions.map((prediction) => predictionItem(prediction, predictions.generatedAt))
        .filter((item): item is CommercialDecisionTimelineItem => item !== null)
        .slice(0, 3)
    : [];
  const items = [action, ...blockers, ...forecasts, ...monitoring]
    .filter((item): item is CommercialDecisionTimelineItem => item !== null)
    .filter((item) => item.destination === null || DESTINATIONS.has(item.destination));
  const order: CommercialDecisionTimelineGroup[] = [
    "Now", "Today", "Upcoming", "Monitoring", "Blocked", "Recently resolved",
  ];
  const groups = order.map((label) => ({
    label,
    items: items.filter((item) => groupFor(item, generatedAt) === label),
  })).filter((group) => group.items.length > 0);

  return { generatedAt, highestPriorityAction: action, groups, items };
}

export const CommercialDecisionTimeline = {
  build: buildCommercialDecisionTimeline,
} as const;
