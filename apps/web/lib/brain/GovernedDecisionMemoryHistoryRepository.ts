import "server-only";

import { GOVERNED_DECISION_MEMORY_STORE_SCOPE } from "@/lib/brain/GovernedDecisionMemory";
import { supabaseAdmin } from "@/lib/supabase-admin";

const TABLE = "vault_governed_decision_memory";
const DEFAULT_RECENT_DAYS = 30;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 50;

const SELECT_FIELDS = [
  "id", "store_scope", "observed_at", "recorded_at", "capture_kind", "local_observed_date", "semantic_hash",
  "memory_schema_version", "evaluator_version", "summary_semantics_version", "classifier_policy_version",
  "executive_outcome", "outcome_signals", "summary_counts", "style_states", "supplier_qualifications", "wallet_state", "source_provenance",
].join(", ");

export type GovernedDecisionMemoryHistoryRecord = {
  id: string;
  store_scope: string;
  observed_at: string;
  recorded_at: string;
  capture_kind: "change" | "daily_baseline";
  local_observed_date: string;
  semantic_hash: string;
  memory_schema_version: number;
  evaluator_version: string;
  summary_semantics_version: string;
  classifier_policy_version: string;
  executive_outcome: string;
  outcome_signals: unknown;
  summary_counts: unknown;
  style_states: unknown;
  supplier_qualifications: unknown;
  wallet_state: unknown;
  source_provenance: unknown;
};

type QueryResult = { data: GovernedDecisionMemoryHistoryRecord[] | null; error: { message: string } | null };
type HistoryQuery = { select(fields: string): HistoryQuery; eq(field: string, value: string): HistoryQuery; gte(field: string, value: string): HistoryQuery; order(field: string, options: { ascending: boolean }): HistoryQuery; limit(count: number): PromiseLike<QueryResult> };
type HistoryClient = { from(table: typeof TABLE): HistoryQuery };

function normalizedLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

function orderedQuery(client: HistoryClient): HistoryQuery {
  return client.from(TABLE).select(SELECT_FIELDS)
    .eq("store_scope", GOVERNED_DECISION_MEMORY_STORE_SCOPE)
    .order("observed_at", { ascending: false })
    .order("recorded_at", { ascending: false })
    .order("id", { ascending: false });
}

async function records(query: PromiseLike<QueryResult>): Promise<GovernedDecisionMemoryHistoryRecord[]> {
  const { data, error } = await query;
  if (error) throw new Error("Governed decision memory history is unavailable");
  return data ?? [];
}

export function createGovernedDecisionMemoryHistoryRepository(
  client: HistoryClient,
  now: () => Date = () => new Date(),
) {
  return {
    async getLatest(): Promise<GovernedDecisionMemoryHistoryRecord | null> {
      return (await records(orderedQuery(client).limit(1)))[0] ?? null;
    },
    async getLatestTwo(): Promise<GovernedDecisionMemoryHistoryRecord[]> {
      return records(orderedQuery(client).limit(2));
    },
    async listRecent(options: { limit?: number } = {}): Promise<GovernedDecisionMemoryHistoryRecord[]> {
      const since = new Date(now().getTime() - DEFAULT_RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
      return records(orderedQuery(client).gte("observed_at", since).limit(normalizedLimit(options.limit)));
    },
  };
}

/** Read-only, bounded history access for governed-memory interpretation. */
export const GovernedDecisionMemoryHistoryRepository = createGovernedDecisionMemoryHistoryRepository(
  supabaseAdmin as unknown as HistoryClient,
);
