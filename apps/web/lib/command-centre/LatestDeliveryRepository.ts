import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type LatestDelivery = { purchaseOrderId: string; supplierName: string | null; carrier: string | null; trackingReference: string; trackingStatus: string | null; trackingStatusDetail: string | null; trackingLocation: string | null; trackingUpdatedAt: string | null; trackingLastCheckedAt: string | null; deliveredAt: string | null };

export const LatestDeliveryRepository = { async getCurrent(): Promise<LatestDelivery | null> {
  const { data, error } = await supabaseAdmin.from("vault_purchase_orders").select("id,status,carrier,tracking_reference,tracking_status,tracking_status_detail,tracking_location,tracking_updated_at,tracking_last_checked_at,tracking_delivered_at,updated_at,vault_suppliers(supplier_name)").neq("status", "cancelled").not("tracking_reference", "is", null).is("tracking_delivered_at", null).order("updated_at", { ascending: false }).order("tracking_updated_at", { ascending: false, nullsFirst: false }).limit(5);
  if (error) throw new Error("Latest delivery unavailable");
  const rows = (data ?? []).filter((row) => typeof row.tracking_reference === "string" && row.tracking_reference.trim());
  const row = rows[0] ?? null;
  if (!row) return null;
  const supplier = Array.isArray(row.vault_suppliers) ? row.vault_suppliers[0] : row.vault_suppliers;
  return { purchaseOrderId: row.id, supplierName: supplier?.supplier_name ?? null, carrier: row.carrier ?? null, trackingReference: row.tracking_reference.trim(), trackingStatus: row.tracking_status ?? null, trackingStatusDetail: row.tracking_status_detail ?? null, trackingLocation: row.tracking_location ?? null, trackingUpdatedAt: row.tracking_updated_at ?? null, trackingLastCheckedAt: row.tracking_last_checked_at ?? null, deliveredAt: row.tracking_delivered_at ?? null };
} };
