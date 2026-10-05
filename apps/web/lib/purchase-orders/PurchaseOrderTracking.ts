import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type PurchaseOrderTracking = {
  status: string;
  detail: string | null;
  location: string | null;
  updatedAt: string | null;
  deliveredAt: string | null;
  lastCheckedAt: string | null;
};

export type PurchaseOrderTrackingRefreshResult =
  | { outcome: "refreshed"; tracking: PurchaseOrderTracking }
  | { outcome: "unsupported_provider"; message: string; tracking: PurchaseOrderTracking | null }
  | { outcome: "not_trackable"; message: string; tracking: PurchaseOrderTracking | null };

type Carrier = "ups" | "fedex" | "royal_mail" | "dhl" | "dpd";
type CarrierTrackingAdapter = {
  carrier: Carrier;
  refresh: (trackingReference: string) => Promise<Omit<PurchaseOrderTracking, "lastCheckedAt">>;
};

type FedExTrackResult = {
  latestStatusDetail?: { code?: string; derivedCode?: string; statusByLocale?: string; scanLocation?: ScanLocation; scanDateAndTime?: string };
  dateAndTimes?: Array<{ type?: string; dateTime?: string }>;
  scanEvents?: Array<{ eventType?: string; eventDescription?: string; date?: string; scanLocation?: ScanLocation }>;
};
type ScanLocation = { city?: string; stateOrProvinceCode?: string; countryCode?: string };

export class CarrierTrackingError extends Error {
  constructor(message: string) { super(message); this.name = "CarrierTrackingError"; }
}

export function normalizeCarrier(carrier: string | null | undefined): Carrier | null {
  const normalized = carrier?.trim().toLowerCase().replace(/[\s_-]+/g, " ") ?? "";
  if (["fedex", "fed ex", "federal express"].includes(normalized)) return "fedex";
  if (normalized === "ups") return "ups";
  if (normalized === "royal mail") return "royal_mail";
  if (normalized === "dhl") return "dhl";
  if (normalized === "dpd") return "dpd";
  return null;
}

function conciseFedExStatus(code: string | undefined, wording: string | undefined): string {
  const value = `${code ?? ""} ${wording ?? ""}`.toLowerCase();
  if (/delivered/.test(value)) return "Delivered";
  if (/out for delivery|on fedex vehicle/.test(value)) return "Out for delivery";
  if (/clearance|customs|international shipment release/.test(value)) return "Customs / clearance";
  if (/exception|delay|hold|weather|delivery exception/.test(value)) return "Exception / delayed";
  if (/local facility|at fedex facility|arrived at fedex location/.test(value)) return "At local facility";
  if (/picked up|shipment information sent|tendered/.test(value)) return "Picked up";
  if (/label created|shipping label has been created/.test(value)) return "Label created";
  return "In transit";
}

function locationText(location: ScanLocation | undefined): string | null {
  const parts = [location?.city, location?.stateOrProvinceCode, location?.countryCode].filter((value): value is string => Boolean(value?.trim()));
  return parts.length ? parts.join(", ") : null;
}

function validTimestamp(value: string | undefined): string | null {
  return value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toISOString() : null;
}

/** Maps the official Track API payload without retaining provider credentials or raw responses. */
export function mapFedExTrackingResponse(payload: unknown): Omit<PurchaseOrderTracking, "lastCheckedAt"> {
  const result = (payload as { output?: { completeTrackResults?: Array<{ trackResults?: FedExTrackResult[] }> } })?.output?.completeTrackResults?.[0]?.trackResults?.[0];
  if (!result) throw new CarrierTrackingError("FedEx returned no tracking result for this reference.");
  const latest = result.latestStatusDetail;
  const newestScan = result.scanEvents?.[0];
  const wording = latest?.statusByLocale ?? newestScan?.eventDescription ?? null;
  const updatedAt = validTimestamp(latest?.scanDateAndTime ?? newestScan?.date);
  const status = conciseFedExStatus(latest?.derivedCode ?? latest?.code ?? newestScan?.eventType, wording ?? undefined);
  const deliveredAt = result.dateAndTimes?.find((entry) => entry.type === "ACTUAL_DELIVERY")?.dateTime ?? (status === "Delivered" ? latest?.scanDateAndTime : undefined);
  return { status, detail: wording?.trim() || null, location: locationText(latest?.scanLocation ?? newestScan?.scanLocation), updatedAt, deliveredAt: validTimestamp(deliveredAt) };
}

function fedExBaseUrl(): string {
  const configured = process.env.FEDEX_API_BASE_URL?.trim() || "https://apis.fedex.com";
  const url = new URL(configured);
  if (!["apis.fedex.com", "apis-sandbox.fedex.com"].includes(url.hostname) || url.pathname !== "/") throw new CarrierTrackingError("FEDEX_API_BASE_URL must be an official FedEx API base URL.");
  return url.toString().replace(/\/$/, "");
}

async function fedExAccessToken(): Promise<{ token: string; baseUrl: string }> {
  const clientId = process.env.FEDEX_CLIENT_ID?.trim();
  const clientSecret = process.env.FEDEX_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new CarrierTrackingError("FedEx tracking requires FEDEX_CLIENT_ID and FEDEX_CLIENT_SECRET server environment variables.");
  const baseUrl = fedExBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }), cache: "no-store" });
  } catch { throw new CarrierTrackingError("FedEx authentication could not be reached. Existing tracking data was left unchanged."); }
  if (!response.ok) throw new CarrierTrackingError("FedEx authentication was rejected. Check the server-side FedEx credentials and project access.");
  const body = await response.json() as { access_token?: unknown };
  if (typeof body.access_token !== "string" || !body.access_token) throw new CarrierTrackingError("FedEx authentication returned no usable access token.");
  return { token: body.access_token, baseUrl };
}

const fedExTrackingAdapter: CarrierTrackingAdapter = {
  carrier: "fedex",
  async refresh(trackingReference) {
    const { token, baseUrl } = await fedExAccessToken();
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/track/v1/trackingnumbers`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-locale": "en_US", "x-customer-transaction-id": crypto.randomUUID() }, body: JSON.stringify({ includeDetailedScans: true, trackingInfo: [{ trackingNumberInfo: { trackingNumber: trackingReference } }] }), cache: "no-store" });
    } catch { throw new CarrierTrackingError("FedEx tracking could not be reached. Existing tracking data was left unchanged."); }
    if (!response.ok) throw new CarrierTrackingError("FedEx tracking is currently unavailable or rate-limited. Existing tracking data was left unchanged.");
    return mapFedExTrackingResponse(await response.json());
  },
};

// Future official adapters (UPS, Royal Mail, DHL, and DPD) plug into this same seam.
const carrierTrackingAdapters: Partial<Record<Carrier, CarrierTrackingAdapter>> = { fedex: fedExTrackingAdapter };

export async function getLatestPurchaseOrderTracking(purchaseOrderId: string): Promise<PurchaseOrderTracking | null> {
  const { data, error } = await supabaseAdmin.from("vault_purchase_orders").select("tracking_status, tracking_status_detail, tracking_location, tracking_updated_at, tracking_delivered_at, tracking_last_checked_at").eq("id", purchaseOrderId).maybeSingle();
  if (error) throw error;
  if (!data?.tracking_status) return null;
  return { status: data.tracking_status, detail: data.tracking_status_detail, location: data.tracking_location, updatedAt: data.tracking_updated_at, deliveredAt: data.tracking_delivered_at, lastCheckedAt: data.tracking_last_checked_at };
}

export async function refreshPurchaseOrderTracking(purchaseOrderId: string): Promise<PurchaseOrderTrackingRefreshResult> {
  const { data, error } = await supabaseAdmin.from("vault_purchase_orders").select("carrier, tracking_reference").eq("id", purchaseOrderId).maybeSingle();
  if (error) throw error;
  const existing = await getLatestPurchaseOrderTracking(purchaseOrderId);
  if (!data?.carrier?.trim() || !data.tracking_reference?.trim()) return { outcome: "not_trackable", message: "A carrier and tracking reference are required before tracking can be refreshed.", tracking: existing };
  const carrier = normalizeCarrier(data.carrier);
  const adapter = carrier ? carrierTrackingAdapters[carrier] : undefined;
  if (!adapter) return { outcome: "unsupported_provider", message: `${data.carrier.trim()} live tracking is not supported yet. The official tracking link remains available.`, tracking: existing };
  const refreshed = await adapter.refresh(data.tracking_reference.trim());
  const lastCheckedAt = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin.from("vault_purchase_orders").update({ tracking_status: refreshed.status, tracking_status_detail: refreshed.detail, tracking_location: refreshed.location, tracking_updated_at: refreshed.updatedAt, tracking_delivered_at: refreshed.deliveredAt, tracking_last_checked_at: lastCheckedAt }).eq("id", purchaseOrderId);
  if (updateError) throw updateError;
  return { outcome: "refreshed", tracking: { ...refreshed, lastCheckedAt } };
}
