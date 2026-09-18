import "server-only";

import { compareGovernedDecisionMemoryRecords, type GovernedDecisionMemoryChange } from "@/lib/brain/GovernedDecisionMemoryComparator";
import { GovernedDecisionMemoryHistoryRepository, type GovernedDecisionMemoryHistoryRecord } from "@/lib/brain/GovernedDecisionMemoryHistoryRepository";

const HISTORY_LIMIT = 20;
const VISIBLE_LIMIT = 8;
export type GovernedMemoryTimelineEntry = { observedAt: string; label: "Daily baseline" | "Change"; summary: string; deltas: string[] };
export type GovernedMemoryTimeline = { state: "available" | "unavailable"; latest: { observedAt: string; captureKind: "daily_baseline" | "change" } | null; latestSummary: string; lastMeaningfulChange: string; entries: GovernedMemoryTimelineEntry[] };
type HistoryReader = { listRecent(options: { limit: number }): Promise<GovernedDecisionMemoryHistoryRecord[]> };

function formatGbp(value: unknown): string | null { return typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value) : null; }
function outcome(value: unknown): string { return typeof value === "string" ? value.replaceAll("_", " ").toLowerCase() : "the recorded outcome"; }
function signal(value: string | null): string { return value === "hasActionAvailable" ? "Action availability" : value === "hasBlocked" ? "Blocked outcome signal" : value === "hasGatheringEvidence" ? "Evidence-gathering signal" : value === "hasNoAction" ? "No-action signal" : value === "hasUnavailable" ? "Unavailable-evidence signal" : "Governed outcome signal"; }
function object(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }

/** Converts deterministic comparator changes into compact, presentation-safe operator language. */
export function humanizeGovernedMemoryChange(change: GovernedDecisionMemoryChange): string {
  if (change.category === "EXECUTIVE_OUTCOME_CHANGED") return `Executive outcome changed from ${outcome(change.before)} to ${outcome(change.after)}`;
  if (change.category === "OUTCOME_SIGNAL_CHANGED") return `${signal(change.subjectId)} changed`;
  if (change.category === "SUMMARY_COUNT_CHANGED") { if (change.subjectId === "total_evaluated") return `Evaluated styles changed from ${change.before} to ${change.after}`; if (change.subjectId === "trusted_candidate_count") return `Trusted buying candidates changed from ${change.before} to ${change.after}`; const before = object(change.before); const after = object(change.after); return before && after && typeof before.affected_count === "number" && typeof after.affected_count === "number" ? `Governed reason count changed from ${before.affected_count} to ${after.affected_count}` : "Governed reason coverage changed"; }
  if (change.category === "STYLE_STATE_ADDED") return "A style entered governed evaluation";
  if (change.category === "STYLE_STATE_REMOVED") return "A style left governed evaluation";
  if (change.category === "STYLE_STATE_CHANGED") return "A style changed governed state";
  if (change.category === "SUPPLIER_QUALIFICATION_ADDED") return "A supplier entered governed qualification";
  if (change.category === "SUPPLIER_QUALIFICATION_REMOVED") return "A supplier left governed qualification";
  if (change.category === "SUPPLIER_QUALIFICATION_CHANGED") return "A supplier qualification changed";
  if (change.category === "WALLET_STATE_CHANGED") { const before = object(change.before); const after = object(change.after); if (change.changedFields.includes("available_purchasing_power_gbp")) { const left = formatGbp(before?.available_purchasing_power_gbp); const right = formatGbp(after?.available_purchasing_power_gbp); if (left && right) return `Available purchasing power changed from ${left} to ${right}`; } if (change.changedFields.includes("availability")) return "Purchasing wallet availability changed"; if (change.changedFields.includes("purchasing_power_state")) return "Purchasing power state changed"; if (change.changedFields.includes("freshness_state")) return "Purchasing wallet freshness changed"; return "Purchasing wallet state changed"; }
  return "Comparison unavailable for this record.";
}
function buildEntry(record: GovernedDecisionMemoryHistoryRecord, previous: GovernedDecisionMemoryHistoryRecord | null): { entry: GovernedMemoryTimelineEntry; meaningful: string | null } {
  const label: GovernedMemoryTimelineEntry["label"] = record.capture_kind === "daily_baseline" ? "Daily baseline" : "Change";
  if (!previous) return { entry: { observedAt: record.observed_at, label, summary: "No earlier governed record is available for comparison.", deltas: [] }, meaningful: null };
  const comparison = compareGovernedDecisionMemoryRecords(previous, record);
  if (comparison.status === "version_incompatible") return { entry: { observedAt: record.observed_at, label, summary: "Governed evaluation version changed — detailed comparison unavailable.", deltas: [] }, meaningful: null };
  if (comparison.status === "malformed") return { entry: { observedAt: record.observed_at, label, summary: "Comparison unavailable for this record.", deltas: [] }, meaningful: null };
  const deltas = comparison.changes.map(humanizeGovernedMemoryChange);
  if (!deltas.length) return { entry: { observedAt: record.observed_at, label, summary: record.capture_kind === "daily_baseline" ? "Daily baseline captured" : "Governed evidence refreshed", deltas: [] }, meaningful: null };
  return { entry: { observedAt: record.observed_at, label, summary: record.capture_kind === "daily_baseline" ? "Baseline checkpoint with changes" : "Governed change recorded", deltas: deltas.slice(0, 2) }, meaningful: deltas[0] ?? null };
}

/** Read-only bounded interpretation of stored governed-memory records. */
export async function getGovernedDecisionMemoryTimeline(reader: HistoryReader = GovernedDecisionMemoryHistoryRepository): Promise<GovernedMemoryTimeline> {
  try { const newestFirst = await reader.listRecent({ limit: HISTORY_LIMIT }); if (!newestFirst.length) return { state: "available", latest: null, latestSummary: "No governed memory has been recorded yet.", lastMeaningfulChange: "No meaningful governed change recorded in recent history.", entries: [] }; const chronological = [...newestFirst].reverse(); const newestEntries = chronological.map((record, index) => buildEntry(record, chronological[index - 1] ?? null)).reverse(); const latest = newestFirst[0]; return { state: "available", latest: { observedAt: latest.observed_at, captureKind: latest.capture_kind }, latestSummary: newestEntries[0].entry.summary, lastMeaningfulChange: newestEntries.map((item) => item.meaningful).find((item): item is string => Boolean(item)) ?? "No meaningful governed change recorded in recent history.", entries: newestEntries.slice(0, VISIBLE_LIMIT).map((item) => item.entry) }; } catch { return { state: "unavailable", latest: null, latestSummary: "Governed memory history is currently unavailable.", lastMeaningfulChange: "Governed memory history is currently unavailable.", entries: [] }; }
}
