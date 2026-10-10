import { sourceContentFingerprint } from './financial-evidence.ts';

export const HISTORICAL_C2_CONTRACT_VERSION = 'historical-c2-reconciliation-v1';
export type HistoricalC2PlanItem = { id: string; payload: Record<string, unknown> };
export type HistoricalC2PersistedPlanItem = {
  id: string; order_number: string; kind: string; source_observation_id: string | null;
  canonical_order_id: string; canonical_order_line_id: string | null; completeness_observation_id: string | null;
  payload: Record<string, unknown>; required_hash: boolean; expected_source_fingerprint: string;
};

/** PostgREST renders timestamptz as +00:00; the approved historical writer hashed Shopify's Z text. */
export function historicalShopifyTimestamp(value: string): string {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) throw new Error('C2_SOURCE_TIMESTAMP_MISMATCH');
  const instant = new Date(value); if (!Number.isFinite(instant.valueOf())) throw new Error('C2_SOURCE_TIMESTAMP_MISMATCH');
  return value.endsWith('+00:00') ? `${value.slice(0, -6)}Z` : value;
}
export function applicationSource(row: Record<string, unknown>) {
  return { source: row.source, shopify_order_id: row.shopify_order_id, application_index: row.application_index,
    order_source_updated_at: historicalShopifyTimestamp(String(row.order_source_updated_at)), application_type: row.application_type,
    code: row.code ?? null, title: row.title ?? null, description: row.description ?? null, allocation_method: row.allocation_method,
    target_selection: row.target_selection, target_type: row.target_type, pricing_value_type: row.pricing_value_type,
    pricing_value: row.pricing_value, pricing_currency: row.pricing_currency };
}
export function allocationSource(row: Record<string, unknown>) {
  return { source: row.source, shopify_order_id: row.shopify_order_id, shopify_line_item_id: row.shopify_line_item_id,
    application_index: row.application_index, order_source_updated_at: historicalShopifyTimestamp(String(row.order_source_updated_at)),
    allocated_shop_amount: row.allocated_shop_amount, allocated_shop_currency: row.allocated_shop_currency,
    allocated_presentment_amount: row.allocated_presentment_amount, allocated_presentment_currency: row.allocated_presentment_currency };
}
export function reproduceHistoricalFingerprint(kind: 'application'|'allocation', row: Record<string, unknown>): string {
  return sourceContentFingerprint(kind === 'application' ? applicationSource(row) : allocationSource(row));
}
/** The database owns every payload. This function deliberately receives it unchanged. */
export function hashPreparedHistoricalC2Items(items: HistoricalC2PlanItem[]) {
  return items.map(({ id, payload }) => ({ id, fingerprint: sourceContentFingerprint(payload) }));
}
/** Map persisted database-owned plan rows for the HTTP dry-run contract without re-hashing or deriving evidence. */
export function mapHistoricalC2DryRunResponse(prepared: Record<string, unknown>, planItems: HistoricalC2PersistedPlanItem[]) {
  const hashAttestationItems = Array.isArray(prepared.items) ? prepared.items : [];
  return {
    ...prepared,
    items: planItems.map((item) => ({
      id: item.id, order_number: item.order_number, evidence_kind: item.kind,
      source_observation_id: item.source_observation_id, canonical_order_id: item.canonical_order_id,
      canonical_order_line_id: item.canonical_order_line_id, completeness_observation_id: item.completeness_observation_id,
      payload: item.payload, fingerprint: item.expected_source_fingerprint, requires_hash: item.required_hash,
      hash_classification: item.required_hash ? 'NEW_HASH_REQUIRED' : 'REUSABLE',
    })),
    hash_attestation_items: hashAttestationItems,
  };
}
export function assertReproduction(kind: 'application'|'allocation', row: Record<string, unknown>) {
  const actual = reproduceHistoricalFingerprint(kind, row); const expected = String(row.source_content_fingerprint ?? row.payload_fingerprint ?? '');
  if (!expected || actual !== expected) throw new Error('C2_SOURCE_FINGERPRINT_REPRODUCTION_FAILED');
  return actual;
}
