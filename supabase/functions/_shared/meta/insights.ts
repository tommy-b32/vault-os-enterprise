const META_GRAPH_API_VERSION = "v26.0";

type MetaAction = {
  action_type?: string;
  value?: string;
};

type MetaInsightRow = {
  date_start?: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  ctr?: string;
  cpc?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
  purchase_roas?: MetaAction[];
};

type MetaInsightsResponse = {
  data?: MetaInsightRow[];
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

export type MetaDailyInsight = {
  reportingDate: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  landingPageViews: number;
  ctr: number;
  cpc: number;
  purchases: number;
  purchaseValue: number;
  addToCarts: number;
  checkouts: number;
  roas: number;
};

export type MetaInsightsResult = {
  adAccountId: string;
  reportingTimezone: string;
  currency: string;
  days: MetaDailyInsight[];
};

function numberValue(value: string | undefined): number {
  if (!value) return 0;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function actionValue(
  actions: MetaAction[] | undefined,
  preferredTypes: string[],
): number {
  if (!actions?.length) return 0;

  for (const actionType of preferredTypes) {
    const match = actions.find((action) => action.action_type === actionType);

    if (match) {
      return numberValue(match.value);
    }
  }

  return 0;
}

function getDateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Unable to calculate Meta reporting date");
  }

  return `${year}-${month}-${day}`;
}
function getRequiredEnvironmentVariable(name: string): string {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`${name} is unavailable`);
  }

  return value;
}

async function fetchMetaAccountDetails(
  accessToken: string,
  adAccountId: string,
): Promise<{ currency: string; timezoneName: string }> {
  const url = new URL(
    `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${adAccountId}`,
  );

  url.searchParams.set("fields", "currency,timezone_name");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url);
  const payload = await response.json();

  if (!response.ok || payload?.error) {
    const message =
      payload?.error?.message ??
      `Meta account request failed with status ${response.status}`;

    throw new Error(`Meta API error: ${message}`);
  }

  if (!payload.currency || !payload.timezone_name) {
    throw new Error("Meta account response is missing currency or timezone");
  }

  return {
    currency: String(payload.currency),
    timezoneName: String(payload.timezone_name),
  };
}

export async function fetchMetaDailyInsights(
  days = 30,
): Promise<MetaInsightsResult> {
  const accessToken = getRequiredEnvironmentVariable("META_ACCESS_TOKEN");
  const adAccountId = getRequiredEnvironmentVariable("META_AD_ACCOUNT_ID");

  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new Error("Meta insight day range must be between 1 and 90 days");
  }

  const account = await fetchMetaAccountDetails(accessToken, adAccountId);

  const todayInAccountTimezone = getDateInTimezone(
    new Date(),
    account.timezoneName,
  );

  const until = new Date(`${todayInAccountTimezone}T00:00:00Z`);
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const url = new URL(
    `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${adAccountId}/insights`,
  );

  url.searchParams.set(
    "fields",
    [
      "spend",
      "impressions",
      "clicks",
      "inline_link_clicks",
      "ctr",
      "cpc",
      "actions",
      "action_values",
      "purchase_roas",
    ].join(","),
  );
  url.searchParams.set("time_increment", "1");
  url.searchParams.set(
    "time_range",
    JSON.stringify({
      since: since.toISOString().slice(0, 10),
      until: until.toISOString().slice(0, 10),
    }),
  );
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("limit", "100");

  const response = await fetch(url);
  const payload = await response.json() as MetaInsightsResponse;

  if (!response.ok || payload.error) {
    const message =
      payload.error?.message ??
      `Meta insights request failed with status ${response.status}`;

    throw new Error(`Meta API error: ${message}`);
  }

  if (!Array.isArray(payload.data)) {
    throw new Error("Meta insights response is invalid");
  }

  const daysResult = payload.data.map((row): MetaDailyInsight => ({
    reportingDate: row.date_start ?? "",
    spend: numberValue(row.spend),
    impressions: numberValue(row.impressions),
    clicks: numberValue(row.clicks),
    linkClicks: numberValue(row.inline_link_clicks),
    landingPageViews: actionValue(row.actions, [
      "landing_page_view",
    ]),
    ctr: numberValue(row.ctr),
    cpc: numberValue(row.cpc),
    purchases: actionValue(row.actions, [
      "omni_purchase",
      "purchase",
      "offsite_conversion.fb_pixel_purchase",
    ]),
    purchaseValue: actionValue(row.action_values, [
      "omni_purchase",
      "purchase",
      "offsite_conversion.fb_pixel_purchase",
    ]),
    addToCarts: actionValue(row.actions, [
      "omni_add_to_cart",
      "add_to_cart",
      "offsite_conversion.fb_pixel_add_to_cart",
    ]),
    checkouts: actionValue(row.actions, [
      "omni_initiated_checkout",
      "initiate_checkout",
      "offsite_conversion.fb_pixel_initiate_checkout",
    ]),
    roas: actionValue(row.purchase_roas, [
      "omni_purchase",
      "purchase",
      "offsite_conversion.fb_pixel_purchase",
    ]),
  }));

  if (daysResult.some((day) => !day.reportingDate)) {
    throw new Error("Meta insights response contains a row without a reporting date");
  }

  return {
    adAccountId,
    reportingTimezone: account.timezoneName,
    currency: account.currency,
    days: daysResult,
  };
}
