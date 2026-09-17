import "server-only";

import { getCommercialDecisionTimeline } from "@/lib/brain/getCommercialDecisionTimeline";
import { getCommandCentreCockpit } from "@/lib/command-centre/getCommandCentreCockpit";
import type { CommandCentreCockpitData, DomainPulse } from "@/lib/command-centre/CommandCentreCockpit";
import type { CommercialDecisionTimelineItem, CommercialDecisionTimelineResult } from "@/lib/brain/CommercialDecisionTimeline";
import type { BuyingDecisionOutcome, BuyingDecisionReasonSummary } from "@/lib/brain/BuyingDecisionReasonSummary";

export type VaultBrainEvidenceState = "proven" | "watch" | "gathering_evidence" | "blocked" | "unavailable" | "unknown" | "no_action_required" | "no_trusted_action";
export type VaultBrainSeverity = "critical" | "high" | "medium" | "low" | "informational";
export type VaultBrainConclusion = { id: string; headline: string; interpretation: string; severity: VaultBrainSeverity; evidenceState: VaultBrainEvidenceState; freshness: string | null; destination: string };
export type VaultBrainTraceStage = { id: "inventory" | "trading-evidence" | "commercial-trust" | "supplier-readiness" | "purchasing-capacity" | "trusted-buying-decision"; label: string; state: VaultBrainEvidenceState; explanation: string; source: string; freshness: string | null; destination: string };
export type VaultBrainIntelligence = { generatedAt: string; conclusions: VaultBrainConclusion[]; decisionTrace: VaultBrainTraceStage[]; blockerExplanations: string[]; noTrustedCandidate: boolean; historyAvailable: false; learningAvailable: false };

function domainState(domain: DomainPulse | undefined): VaultBrainEvidenceState {
  if (!domain) return "unknown";
  if (domain.state === "healthy") return "proven";
  if (domain.state === "watch") return "watch";
  if (domain.state === "attention" || domain.state === "critical") return "blocked";
  if (domain.state === "unavailable" || domain.state === "not_connected") return "unavailable";
  return "unknown";
}
function timelineItem(timeline: CommercialDecisionTimelineResult | null, predicate: (item: CommercialDecisionTimelineItem) => boolean): CommercialDecisionTimelineItem | null { return timeline?.items.find(predicate) ?? null; }
function timelineState(item: CommercialDecisionTimelineItem | null): VaultBrainEvidenceState {
  if (!item) return "unknown";
  if (item.status === "blocked") return "blocked";
  if (item.status === "monitoring") return "gathering_evidence";
  if (item.status === "actionable" || item.status === "resolved") return "proven";
  return "unavailable";
}
function stageFromDomain(id: VaultBrainTraceStage["id"], label: string, domain: DomainPulse | undefined, destination: string, freshness: string | null): VaultBrainTraceStage {
  return { id, label, state: domainState(domain), explanation: domain?.detail ?? "The current governed output does not expose this evidence.", source: domain?.domain ?? "Governed output", freshness, destination };
}
function decisionBoundary(summary: BuyingDecisionReasonSummary | null): Pick<VaultBrainTraceStage, "state" | "explanation" | "source" | "freshness" | "destination"> {
  const outcome: BuyingDecisionOutcome = summary?.outcome ?? "UNKNOWN";
  const explanation = outcome === "NO_ACTION_REQUIRED" ? "No trusted buying action is currently required by the governed demand outcome."
    : outcome === "GATHERING_EVIDENCE" ? "No trusted buying action is available while governed evidence continues to develop."
      : outcome === "BLOCKED" ? "An otherwise relevant governed buying path is prevented from progressing by an existing gate."
        : outcome === "ACTION_AVAILABLE" ? "A trusted actionable buying candidate is available through the governed Advisor output."
          : outcome === "MIXED" ? "No trusted buying action is currently available; evaluated styles include no-action, evidence, unavailable, or governed-constraint outcomes."
            : "The current governed output cannot establish a trusted buying outcome.";
  return { state: outcome === "NO_ACTION_REQUIRED" ? "no_action_required" : outcome === "GATHERING_EVIDENCE" ? "gathering_evidence" : outcome === "BLOCKED" ? "blocked" : outcome === "ACTION_AVAILABLE" ? "proven" : outcome === "MIXED" ? "no_trusted_action" : "unknown", explanation, source: "Buying decision reason summary", freshness: summary?.generatedAt ?? null, destination: "/advisor" };
}
function buildTrace(cockpit: CommandCentreCockpitData, timeline: CommercialDecisionTimelineResult | null): VaultBrainTraceStage[] {
  const inventory = cockpit.domains.find((domain) => domain.domain === "Inventory");
  const suppliers = cockpit.domains.find((domain) => domain.domain === "Suppliers");
  const trading = timelineItem(timeline, (item) => item.blockerReasons.includes("target_stock_days_missing"));
  const commercial = timelineItem(timeline, (item) => item.blockerReasons.includes("invalid_or_missing_commercial_cost"));
  const wallet = cockpit.finance.purchasingPower;
  const walletState: VaultBrainEvidenceState = wallet.state === "available" ? "proven" : wallet.state === "stale" ? "watch" : "unavailable";
  return [
    stageFromDomain("inventory", "Inventory state", inventory, "/inventory", cockpit.inventory.freshness.updatedAt),
    { id: "trading-evidence", label: "Trading evidence", state: timelineState(trading), explanation: trading?.description ?? "No governed trading-evidence presentation currently applies.", source: trading?.source ?? "Commercial Decision Timeline", freshness: trading?.effectiveAt ?? cockpit.latestSourceAt, destination: trading?.destination ?? "/catalogue" },
    { id: "commercial-trust", label: "Commercial trust", state: commercial ? timelineState(commercial) : "unknown", explanation: commercial?.description ?? "No governed aggregate commercial-trust result is exposed by current outputs.", source: commercial?.source ?? "Commercial Decision Timeline", freshness: commercial?.effectiveAt ?? null, destination: commercial?.destination ?? "/commercial" },
    stageFromDomain("supplier-readiness", "Supplier readiness", suppliers, "/purchase-intelligence", cockpit.latestSourceAt),
    { id: "purchasing-capacity", label: "Purchasing capacity", state: walletState, explanation: wallet.state === "available" ? "Governed purchasing capacity is available; this alone does not approve a purchase." : wallet.state === "stale" ? "Governed purchasing capacity is stale and cannot be treated as current." : "Governed purchasing capacity is unavailable.", source: "Purchasing wallet", freshness: wallet.updatedAt, destination: "/commercial" },
    { id: "trusted-buying-decision", label: "Trusted buying decision", ...decisionBoundary(timeline?.reasonSummary ?? null) },
  ];
}
function buildConclusions(trace: VaultBrainTraceStage[]): VaultBrainConclusion[] {
  const decision = trace.find((stage) => stage.id === "trusted-buying-decision");
  const conclusions: VaultBrainConclusion[] = [];
  if (decision) conclusions.push({ id: "governed-decision-state", headline: decision.state === "no_action_required" ? "No trusted buying action is currently required" : decision.state === "gathering_evidence" ? "Buying evidence is still developing" : decision.state === "blocked" ? "A governed buying path is currently blocked" : decision.state === "proven" ? "A trusted buying action is available" : decision.state === "no_trusted_action" ? "No trusted buying action is currently available" : "Trusted buying outcome is unavailable", interpretation: decision.explanation, severity: decision.state === "blocked" ? "medium" : "informational", evidenceState: decision.state, freshness: decision.freshness, destination: decision.destination });
  for (const stage of trace) {
    if (conclusions.length >= 3 || stage.id === "inventory" || stage.id === "trusted-buying-decision" || !["blocked", "watch", "gathering_evidence", "unavailable"].includes(stage.state)) continue;
    conclusions.push({ id: `trace-${stage.id}`, headline: stage.label, interpretation: stage.explanation, severity: stage.state === "blocked" || stage.state === "unavailable" ? "high" : "medium", evidenceState: stage.state, freshness: stage.freshness, destination: stage.destination });
  }
  return conclusions;
}

/** Read-only explanation model composed from existing governed outputs only. */
export async function getVaultBrainIntelligence(): Promise<VaultBrainIntelligence> {
  const cockpit = await getCommandCentreCockpit();
  // The cockpit deliberately does not expose candidate-level timeline blockers.
  // Reuse the existing governed loader; do not reconstruct its policy here.
  const timeline = await getCommercialDecisionTimeline(cockpit.generatedAt);
  const decisionTrace = buildTrace(cockpit, timeline);
  const noTrustedCandidate = timeline?.reasonSummary?.outcome !== "ACTION_AVAILABLE";
  const blockerExplanations = timeline?.reasonSummary
    ? timeline.reasonSummary.primaryReasons.map((reason) => `${reason.affectedStyleIds.length} style${reason.affectedStyleIds.length === 1 ? "" : "s"}: ${reason.explanation}`).slice(0, 6)
    : (timeline?.items ?? []).filter((item) => item.source === "classifier" && (item.status === "blocked" || item.status === "monitoring")).map((item) => item.description ?? item.title).slice(0, 3);
  const limitations = timeline?.reasonSummary?.limitations ?? [];
  return { generatedAt: cockpit.generatedAt, conclusions: buildConclusions(decisionTrace), decisionTrace, blockerExplanations: [...blockerExplanations, ...limitations], noTrustedCandidate, historyAvailable: false, learningAvailable: false };
}
