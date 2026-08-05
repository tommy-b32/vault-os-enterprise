export type ExecutiveBriefingFocus =
  | {
    state: "available";
    source: "advisor" | "timeline" | "blocker";
    title: string;
    description: string | null;
    destination: string;
    blockerReasons: string[];
  }
  | { state: "unavailable" };

export type ExecutiveBriefing = {
  headline: string;
  summary: string;
  positives: string[];
  blockers: string[];
  todayFocus: ExecutiveBriefingFocus;
  unlocks: string[];
  supportingEvidence: string[];
};

export type ExecutiveIntelligenceDomain = {
  domain: string;
  state: "healthy" | "watch" | "attention" | "critical" | "unavailable" | "not_connected";
  detail: string;
};

export type ExecutiveIntelligenceInput = {
  businessPulse: { state: "healthy" | "watch" | "attention" | "critical" | "unavailable"; label: string };
  domains: ExecutiveIntelligenceDomain[];
  todayFocus: ExecutiveBriefingFocus;
  orderedBlockers: Array<{ title: string; description: string | null }>;
  supportingEvidence: string[];
};

const UNLOCK_BY_REASON: Record<string, string> = {
  inventory_stale: "Trusted inventory evidence becomes available for purchasing decisions.",
  inventory_unavailable: "Trusted inventory evidence becomes available for purchasing decisions.",
  supplier_minimum_unknown: "Supplier minimum policy becomes available for downstream evaluation.",
  target_stock_days_missing: "Trusted replenishment quantity becomes available for evaluation.",
  reorder_approval_missing: "The style becomes available for trusted buying qualification.",
  invalid_or_missing_commercial_cost: "Commercial qualification becomes available for evaluation.",
  wallet_freshness_policy_missing: "Wallet freshness becomes available for policy assessment.",
};

function firstLimitingDomain(domains: ExecutiveIntelligenceDomain[]): ExecutiveIntelligenceDomain | null {
  return domains.find((domain) => domain.state === "critical") ??
    domains.find((domain) => domain.state === "attention") ??
    domains.find((domain) => domain.state === "watch") ??
    domains.find((domain) => domain.state === "unavailable") ??
    null;
}

export function buildExecutiveBriefing(input: ExecutiveIntelligenceInput): ExecutiveBriefing {
  const limiting = firstLimitingDomain(input.domains);
  const headline = limiting
    ? `Business pulse is ${input.businessPulse.label.toLowerCase()}, while ${limiting.domain.toLowerCase()} requires ${limiting.state === "watch" ? "watching" : "attention"}.`
    : `Business pulse is ${input.businessPulse.label.toLowerCase()} with no limiting domain identified.`;
  const focusSentence = input.todayFocus.state === "available"
    ? `Today’s highest-priority action is ${input.todayFocus.title.toLowerCase()}.`
    : "No structured operator action is currently available.";
  const limitSentence = limiting
    ? `${limiting.domain} is limiting the business because ${limiting.detail.toLowerCase()}.`
    : "No structured business limitation is currently available.";
  const positives = input.domains
    .filter((domain) => domain.state === "healthy")
    .slice(0, 3)
    .map((domain) => `${domain.domain}: ${domain.detail}`);
  const blockers = input.orderedBlockers
    .slice(0, 3)
    .map((blocker) => blocker.description
      ? `${blocker.title} — ${blocker.description}`
      : blocker.title);
  const unlocks = input.todayFocus.state === "available"
    ? [...new Set(input.todayFocus.blockerReasons
      .map((reason) => UNLOCK_BY_REASON[reason])
      .filter((value): value is string => Boolean(value)))]
      .slice(0, 3)
    : [];

  return {
    headline,
    summary: `${limitSentence} ${focusSentence}`,
    positives,
    blockers,
    todayFocus: input.todayFocus,
    unlocks,
    supportingEvidence: input.supportingEvidence.slice(0, 4),
  };
}

export const ExecutiveIntelligenceEngine = {
  build: buildExecutiveBriefing,
} as const;
