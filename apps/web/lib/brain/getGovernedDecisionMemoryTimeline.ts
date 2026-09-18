import "server-only";

import { compareGovernedDecisionMemoryRecords } from "@/lib/brain/GovernedDecisionMemoryComparator";
import { interpretGovernedDecisionMemoryChange } from "@/lib/brain/GovernedDecisionMemoryChangeInterpreter";
import { GovernedDecisionMemoryHistoryRepository, type GovernedDecisionMemoryHistoryRecord } from "@/lib/brain/GovernedDecisionMemoryHistoryRepository";

const HISTORY_LIMIT = 20;
const VISIBLE_LIMIT = 8;
export type GovernedMemoryTimelineEntry = { observedAt: string; label: "Daily baseline" | "Change"; summary: string; deltas: string[]; supportingStoredChanges: string[]; causeMessage: string | null };
export type GovernedMemoryTimeline = { state: "available" | "unavailable"; latest: { observedAt: string; captureKind: "daily_baseline" | "change" } | null; latestSummary: string; lastMeaningfulChange: string; entries: GovernedMemoryTimelineEntry[] };
type HistoryReader = { listRecent(options: { limit: number }): Promise<GovernedDecisionMemoryHistoryRecord[]> };

function buildEntry(record: GovernedDecisionMemoryHistoryRecord, previous: GovernedDecisionMemoryHistoryRecord | null): { entry: GovernedMemoryTimelineEntry; meaningful: string | null } {
  const label: GovernedMemoryTimelineEntry["label"] = record.capture_kind === "daily_baseline" ? "Daily baseline" : "Change";
  if (!previous) return { entry: { observedAt: record.observed_at, label, summary: "No earlier governed record is available for comparison.", deltas: [], supportingStoredChanges: [], causeMessage: null }, meaningful: null };
  const comparison = compareGovernedDecisionMemoryRecords(previous, record);
  if (comparison.status === "version_incompatible") return { entry: { observedAt: record.observed_at, label, summary: "Governed evaluation version changed — detailed comparison unavailable.", deltas: [], supportingStoredChanges: [], causeMessage: null }, meaningful: null };
  if (comparison.status === "malformed") return { entry: { observedAt: record.observed_at, label, summary: "Comparison unavailable for this record.", deltas: [], supportingStoredChanges: [], causeMessage: null }, meaningful: null };
  const interpreted = interpretGovernedDecisionMemoryChange(comparison);
  if (!interpreted.observedChanges.length) return { entry: { observedAt: record.observed_at, label, summary: record.capture_kind === "daily_baseline" ? "Daily baseline captured" : "Governed evidence refreshed", deltas: [], supportingStoredChanges: [], causeMessage: null }, meaningful: null };
  return { entry: { observedAt: record.observed_at, label, summary: record.capture_kind === "daily_baseline" ? "Baseline checkpoint with changes" : "Governed change recorded", deltas: interpreted.observedChanges.slice(0, 2), supportingStoredChanges: interpreted.supportingStoredChanges.slice(0, 2), causeMessage: interpreted.causeStatus?.message ?? null }, meaningful: interpreted.observedChanges[0] ?? null };
}

/** Read-only bounded interpretation of stored governed-memory records. */
export async function getGovernedDecisionMemoryTimeline(reader: HistoryReader = GovernedDecisionMemoryHistoryRepository): Promise<GovernedMemoryTimeline> {
  try { const newestFirst = await reader.listRecent({ limit: HISTORY_LIMIT }); if (!newestFirst.length) return { state: "available", latest: null, latestSummary: "No governed memory has been recorded yet.", lastMeaningfulChange: "No meaningful governed change recorded in recent history.", entries: [] }; const chronological = [...newestFirst].reverse(); const newestEntries = chronological.map((record, index) => buildEntry(record, chronological[index - 1] ?? null)).reverse(); const latest = newestFirst[0]; return { state: "available", latest: { observedAt: latest.observed_at, captureKind: latest.capture_kind }, latestSummary: newestEntries[0].entry.summary, lastMeaningfulChange: newestEntries.map((item) => item.meaningful).find((item): item is string => Boolean(item)) ?? "No meaningful governed change recorded in recent history.", entries: newestEntries.slice(0, VISIBLE_LIMIT).map((item) => item.entry) }; } catch { return { state: "unavailable", latest: null, latestSummary: "Governed memory history is currently unavailable.", lastMeaningfulChange: "Governed memory history is currently unavailable.", entries: [] }; }
}
