import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

const SEVEN_DAY_COUNT = 7;

export type WebsiteVisitorMetrics = {
  tracked: number | null;
  estimatedPrivacy: number | null;
  estimatedTotal: number | null;
  liveTracked: number | null;
  trackedPercentage: number | null;
};

export type WebsiteVisitorDay = {
  date: string;
  visitors: Omit<WebsiteVisitorMetrics, "liveTracked">;
};

export type WebsiteAnalyticsSnapshot = {
  visitors: WebsiteVisitorMetrics;
  latestAnalyticsAt: string;
  sevenDayVisitors: WebsiteVisitorDay[];
};

type VisitorRow = {
  traffic_date: string;
  tracked_visitors: number | string | null;
  estimated_privacy_visitors: number | string | null;
  estimated_total_visitors: number | string | null;
  live_tracked_visitors: number | string | null;
  tracked_visitor_percentage: number | string | null;
  latest_activity_at: string | null;
};

function nullableDatabaseNumber(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error("Canonical visitor intelligence contains an invalid count");
  }

  return parsed;
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getSevenDayDates(now: Date): string[] {
  const today = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));

  return Array.from({ length: SEVEN_DAY_COUNT }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - (SEVEN_DAY_COUNT - 1 - index));
    return formatUtcDate(date);
  });
}

function mapVisitors(row: VisitorRow | undefined): WebsiteVisitorMetrics {
  return {
    tracked: row ? nullableDatabaseNumber(row.tracked_visitors) : 0,
    estimatedPrivacy: nullableDatabaseNumber(
      row?.estimated_privacy_visitors,
    ),
    estimatedTotal: nullableDatabaseNumber(row?.estimated_total_visitors),
    liveTracked: nullableDatabaseNumber(row?.live_tracked_visitors),
    trackedPercentage: nullableDatabaseNumber(
      row?.tracked_visitor_percentage,
    ),
  };
}

export const WebsiteAnalyticsRepository = {
  async getSnapshot(now = new Date()): Promise<WebsiteAnalyticsSnapshot | null> {
    const dates = getSevenDayDates(now);
    const today = dates[dates.length - 1];
    const { data, error } = await supabaseAdmin
      .from("vault_traffic_daily")
      .select(`
        traffic_date,
        tracked_visitors,
        estimated_privacy_visitors,
        estimated_total_visitors,
        live_tracked_visitors,
        tracked_visitor_percentage,
        latest_activity_at
      `)
      .gte("traffic_date", dates[0])
      .lte("traffic_date", today)
      .order("traffic_date", { ascending: true });

    if (error) {
      throw new Error(
        `Unable to read canonical visitor intelligence: ${error.message}`,
      );
    }

    const rows = (data ?? []) as VisitorRow[];
    const rowsByDate = new Map(rows.map((row) => [row.traffic_date, row]));
    const latestAnalyticsAt = rows
      .map((row) => row.latest_activity_at)
      .filter((value): value is string => value !== null)
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0];

    if (!latestAnalyticsAt) {
      return null;
    }

    return {
      visitors: mapVisitors(rowsByDate.get(today)),
      latestAnalyticsAt,
      sevenDayVisitors: dates.map((date) => {
        const visitors = mapVisitors(rowsByDate.get(date));

        return {
          date,
          visitors: {
            tracked: visitors.tracked,
            estimatedPrivacy: visitors.estimatedPrivacy,
            estimatedTotal: visitors.estimatedTotal,
            trackedPercentage: visitors.trackedPercentage,
          },
        };
      }),
    };
  },
} as const;
