import "server-only";

import {
  getCommandCentreCockpit,
} from "@/lib/command-centre/getCommandCentreCockpit";
import type {
  CockpitAttentionItem,
  CommandCentreCockpitData,
  DomainPulse,
} from "@/lib/command-centre/CommandCentreCockpit";

export type VaultBrainEvidenceState = "proven" | "blocked" | "gathering_evidence" | "unknown";

export type VaultBrainConclusion = CockpitAttentionItem & {
  evidenceState: VaultBrainEvidenceState;
  freshness: string | null;
  actionable: boolean;
};

export type VaultBrainIntelligence = {
  generatedAt: string;
  conclusions: VaultBrainConclusion[];
  primaryConclusion: VaultBrainConclusion | null;
  domains: DomainPulse[];
  supportingEvidence: string[];
  noTrustedCandidate: boolean;
  historyAvailable: false;
  learningAvailable: false;
};

function evidenceState(data: CommandCentreCockpitData): VaultBrainEvidenceState {
  if (data.systemStatus === "live") return "proven";
  if (data.systemStatus === "stale" || data.systemStatus === "partial") return "gathering_evidence";
  return "unknown";
}

function toConclusion(
  item: CockpitAttentionItem,
  data: CommandCentreCockpitData,
): VaultBrainConclusion {
  const noTrustedCandidate = item.id === "advisor-no-trusted-candidate";
  return {
    ...item,
    evidenceState: noTrustedCandidate ? "blocked" : evidenceState(data),
    freshness: data.latestSourceAt,
    actionable: !noTrustedCandidate,
  };
}

/**
 * Read-only executive view-model. It intentionally composes the Command Centre
 * cockpit instead of recreating inventory, wallet, or buying-policy logic.
 */
export async function getVaultBrainIntelligence(): Promise<VaultBrainIntelligence> {
  const cockpit = await getCommandCentreCockpit();
  const conclusions = cockpit.attention
    .slice(0, 4)
    .map((item) => toConclusion(item, cockpit));
  const noTrustedCandidate = conclusions.some((item) => item.id === "advisor-no-trusted-candidate");

  return {
    generatedAt: cockpit.generatedAt,
    conclusions,
    primaryConclusion: conclusions[0] ?? null,
    domains: cockpit.domains.filter((domain) => domain.state !== "healthy").slice(0, 4),
    supportingEvidence: cockpit.executiveBriefing.supportingEvidence,
    noTrustedCandidate,
    historyAvailable: false,
    learningAvailable: false,
  };
}
