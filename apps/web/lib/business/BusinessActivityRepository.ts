import "server-only";

import { ShopifyTradingRepository } from "@/lib/business/ShopifyTradingRepository";
import { supabaseAdmin } from "@/lib/supabase-admin";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;
const SHOPIFY_STALE_AFTER_MS = 30 * 60 * 1000;

export type BusinessActivitySeverity =
  | "info"
  | "success"
  | "warning"
  | "critical";

export type BusinessActivitySource =
  | "shopify"
  | "inventory"
  | "website"
  | "finance"
  | "trustpilot"
  | "vault-brain";

export type BusinessActivityEvent = {
  id: string;
  type: string;
  timestamp: string;
  title: string;
  description: string | null;
  severity: BusinessActivitySeverity;
  source: BusinessActivitySource;
  metadata: Record<string, string | number | boolean | null>;
};

export type BusinessActivityRepositoryStatus =
  | "live"
  | "stale"
  | "unavailable"
  | "error";

export type BusinessActivitySourceStatus = {
  source: BusinessActivitySource;
  status: BusinessActivityRepositoryStatus;
  timestamp: string | null;
  message: string;
};

export type BusinessActivityResult = {
  data: BusinessActivityEvent[];
  status: BusinessActivityRepositoryStatus;
  timestamp: string | null;
  message: string | null;
  sourceStatuses: BusinessActivitySourceStatus[];
};

type BusinessEventRow = {
  id: string;
  occurred_at: string;
  event_type: string;
  severity: BusinessActivitySeverity;
  source: BusinessActivitySource;
  title: string;
  description: string | null;
  metadata: unknown;
};

function getSafeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit)));
}

function isMetadata(
  value: unknown,
): value is Record<string, string | number | boolean | null> {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) =>
      entry === null ||
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
    );
}

function isStale(timestamp: string | null, now: Date): boolean {
  if (!timestamp) return true;
  const value = Date.parse(timestamp);

  return !Number.isFinite(value) ||
    now.getTime() - value > SHOPIFY_STALE_AFTER_MS;
}

function mapEvent(row: BusinessEventRow): BusinessActivityEvent {
  if (!isMetadata(row.metadata)) {
    throw new Error("Canonical business activity contains invalid metadata");
  }

  return {
    id: row.id,
    type: row.event_type,
    timestamp: row.occurred_at,
    title: row.title,
    description: row.description,
    severity: row.severity,
    source: row.source,
    metadata: row.metadata,
  };
}

export async function getRecentBusinessActivity(
  limit = DEFAULT_LIMIT,
): Promise<BusinessActivityResult> {
  const safeLimit = getSafeLimit(limit);
  const now = new Date();

  try {
    const [latestSyncAt, eventsResult] = await Promise.all([
      ShopifyTradingRepository.getLatestSyncAt(),
      supabaseAdmin
        .from("vault_business_events")
        .select(`
          id,
          occurred_at,
          event_type,
          severity,
          source,
          title,
          description,
          metadata
        `)
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(safeLimit),
    ]);

    if (eventsResult.error) {
      throw new Error("Canonical business activity could not be loaded");
    }

    const events = ((eventsResult.data ?? []) as BusinessEventRow[])
      .map(mapEvent);
    const stale = isStale(latestSyncAt, now);
    const sourceStatus: BusinessActivitySourceStatus = {
      source: "shopify",
      status: latestSyncAt ? stale ? "stale" : "live" : "unavailable",
      timestamp: latestSyncAt,
      message: latestSyncAt
        ? stale
          ? "Canonical Shopify business activity is available but stale."
          : "Canonical Shopify business activity is live."
        : "Canonical Shopify business activity has no completed synchronization.",
    };

    if (events.length === 0) {
      return {
        data: [],
        status: "unavailable",
        timestamp: null,
        message: "No canonical business events have been recorded.",
        sourceStatuses: [sourceStatus],
      };
    }

    return {
      data: events,
      status: sourceStatus.status === "live" ? "live" : "stale",
      timestamp: events[0].timestamp,
      message: sourceStatus.status === "live"
        ? null
        : "Business activity is available but Shopify freshness is unavailable or stale.",
      sourceStatuses: [sourceStatus],
    };
  } catch {
    return {
      data: [],
      status: "error",
      timestamp: null,
      message: "Business activity could not be loaded from the canonical event store.",
      sourceStatuses: [{
        source: "shopify",
        status: "error",
        timestamp: null,
        message: "Canonical Shopify business activity could not be loaded.",
      }],
    };
  }
}

export const BusinessActivityRepository = {
  getRecentBusinessActivity,
} as const;
