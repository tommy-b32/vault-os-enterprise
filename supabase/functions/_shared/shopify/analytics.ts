import { shopifyGraphQL } from "./graphql.ts";

export const SHOPIFY_ANALYTICS_QUERY = `FROM sessions
SHOW sessions, online_store_visitors, sessions_with_cart_additions,
  sessions_that_reached_checkout, sessions_that_completed_checkout, conversion_rate
WHERE human_or_bot_session = 'human'
TIMESERIES day
SINCE -6d UNTIL today
ORDER BY day ASC`;

type Column = { name: string; dataType: string };
type Response = {
  shop: { id: string; ianaTimezone: string };
  shopifyqlQuery: { tableData: { columns: Column[]; rows: unknown } | null; parseErrors: string[] } | null;
};

export type ShopifyAnalyticsDay = {
  reportingDate: string;
  sessions: number;
  visitors: number | null;
  cartAdditions: number;
  reachedCheckout: number;
  completedCheckout: number;
  conversionRate: number;
};

const number = (value: unknown, nullable = false): number | null => {
  if (value === null && nullable) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Shopify Analytics returned an invalid aggregate");
  return parsed;
};

export function parseShopifyAnalyticsTable(table: { columns: Column[]; rows: unknown }): ShopifyAnalyticsDay[] {
  if (!Array.isArray(table.rows)) throw new Error("Shopify Analytics returned invalid rows");
  const names = table.columns.map((column) => column.name);
  const required = ["day", "sessions", "online_store_visitors", "sessions_with_cart_additions", "sessions_that_reached_checkout", "sessions_that_completed_checkout", "conversion_rate"];
  if (required.some((name) => !names.includes(name))) throw new Error("Shopify Analytics omitted a required aggregate");
  return table.rows.map((raw) => {
    const row = Array.isArray(raw)
      ? Object.fromEntries(names.map((name, index) => [name, raw[index]]))
      : raw as Record<string, unknown>;
    if (typeof row.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.day)) throw new Error("Shopify Analytics returned an invalid reporting date");
    return {
      reportingDate: row.day,
      sessions: number(row.sessions)!,
      visitors: number(row.online_store_visitors, true),
      cartAdditions: number(row.sessions_with_cart_additions)!,
      reachedCheckout: number(row.sessions_that_reached_checkout)!,
      completedCheckout: number(row.sessions_that_completed_checkout)!,
      conversionRate: number(row.conversion_rate)!,
    };
  });
}

export async function fetchShopifyAnalytics() {
  const access = await shopifyGraphQL<{
    shop: { id: string; ianaTimezone: string };
    currentAppInstallation: { accessScopes: Array<{ handle: string }> };
  }>(`query VaultShopifyAnalyticsAccess {
    shop { id ianaTimezone }
    currentAppInstallation { accessScopes { handle } }
  }`);
  if (!access.currentAppInstallation.accessScopes.some(({ handle }) => handle === "read_reports")) {
    return { availability: "pending_permission" as const, shopId: access.shop.id, reportingTimezone: access.shop.ianaTimezone, days: [] };
  }
  const data = await shopifyGraphQL<Response>(`query VaultShopifyAnalytics($query: String!) {
    shop { id ianaTimezone }
    shopifyqlQuery(query: $query) {
      tableData { columns { name dataType } rows }
      parseErrors
    }
  }`, { query: SHOPIFY_ANALYTICS_QUERY });
  if (!data.shopifyqlQuery) throw new Error("Shopify Analytics access was denied");
  if (data.shopifyqlQuery.parseErrors.length) throw new Error("ShopifyQL query was rejected");
  if (!data.shopifyqlQuery.tableData) throw new Error("Shopify Analytics returned no table data");
  return { availability: "live" as const, shopId: data.shop.id, reportingTimezone: data.shop.ianaTimezone, days: parseShopifyAnalyticsTable(data.shopifyqlQuery.tableData) };
}
