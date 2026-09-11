import "server-only";

import { getCatalogueData } from "@/lib/catalogue";
import { loadFixedPackPurchaseRecommendations } from "@/lib/fixed-pack-purchase-recommendations";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type AddFixedPackRecommendationInput = { styleId: string; parentProductId: string; idempotencyKey: string; targetDraftId?: string | null };
export type FixedPackDraftResult = { success: true; purchaseOrderId: string; purchaseOrderLineId: string; createdNewDraft: boolean; createdNewLine: boolean; idempotent: boolean } | { success: false; code: "request_invalid" | "recommendation_unavailable" | "refresh_required" | "canonical_data_incomplete" | "invalid_target_draft" | "multiple_eligible_drafts" | "changed_recommendation" | "operation_failed"; message: string };
type Variant = { id: string; product_id: string; model_design: string; normalized_size: string; source_variant_id: string | null; source_inventory_item_id: string | null };
export type FixedPackDraftDependencies = { loadRecommendations: typeof loadFixedPackPurchaseRecommendations; loadCatalogue: typeof getCatalogueData; client: typeof supabaseAdmin };
const productionDependencies: FixedPackDraftDependencies = { loadRecommendations: loadFixedPackPurchaseRecommendations, loadCatalogue: getCatalogueData, client: supabaseAdmin };

export class FixedPackDraftError extends Error { constructor(public readonly code: Exclude<FixedPackDraftResult, { success: true }> ["code"], message: string) { super(message); } }
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const fail = (code: FixedPackDraftError["code"], message: string): never => { throw new FixedPackDraftError(code, message); };

type AuthoritativeFixedPackDraftPayload = { operator_id: string; style_id: string; parent_product_id: string; supplier_id: string; currency: string; idempotency_key: string; target_draft_id?: string; product_name: string; recommended_packs: number; recommended_units: number; units_per_pack: number; product_moq_packs: number; pack_cost_gbp: number; line_cost_gbp: number; expected_profit_gbp: number; source_snapshot: Record<string, unknown>; allocations: Array<{ normalized_size: string; model_design: string; variant_id: string; shopify_variant_id_snapshot: string; shopify_inventory_item_id_snapshot: string; units_per_pack: number; ordered_units: number }> };
type FixedPackDraftMatch = { purchaseOrderId: string };

export function buildB4CanonicalSnapshot(payload: AuthoritativeFixedPackDraftPayload) {
  return {
    source_type: "fixed_pack_purchase_recommendation",
    supplier_id: payload.supplier_id,
    style_id: payload.style_id,
    parent_product_id: payload.parent_product_id,
    model_design: payload.style_id.split("::")[1] ?? "",
    product_name: payload.product_name,
    pack_definition_id: payload.source_snapshot.pack_definition_id,
    recommended_packs: payload.recommended_packs,
    recommended_units: payload.recommended_units,
    units_per_pack: payload.units_per_pack,
    allocations: payload.allocations.map((allocation) => ({ normalized_size: allocation.normalized_size, model_design: allocation.model_design, variant_id: allocation.variant_id, shopify_variant_id_snapshot: allocation.shopify_variant_id_snapshot, shopify_inventory_item_id_snapshot: allocation.shopify_inventory_item_id_snapshot, units_per_pack: allocation.units_per_pack, ordered_units: allocation.ordered_units })).sort((left, right) => left.normalized_size < right.normalized_size ? -1 : left.normalized_size > right.normalized_size ? 1 : 0),
    pack_cost_gbp: payload.pack_cost_gbp,
    line_cost_gbp: payload.line_cost_gbp,
    expected_profit_gbp: payload.expected_profit_gbp,
    product_moq_packs: payload.product_moq_packs,
    currency: payload.currency,
    supplier_purchasing_rule: payload.source_snapshot.supplier_purchasing_rule ?? {},
    recommendation_evidence: payload.source_snapshot.recommendation_evidence ?? {},
  };
}

export function matchesB4CanonicalSnapshot(payload: AuthoritativeFixedPackDraftPayload, persistedSnapshot: unknown): boolean {
  if (!persistedSnapshot || typeof persistedSnapshot !== "object" || Array.isArray(persistedSnapshot)) return false;
  const { fingerprint: _fingerprint, ...persisted } = persistedSnapshot as Record<string, unknown>;
  return sameCanonicalJson(persisted, buildB4CanonicalSnapshot(payload));
}

function sameCanonicalJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => sameCanonicalJson(value, right[index]));
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && sameCanonicalJson(leftRecord[key], rightRecord[key]));
}

export async function buildAuthoritativeFixedPackDraftPayloadFrom(operatorId: string, input: AddFixedPackRecommendationInput, dependencies: FixedPackDraftDependencies): Promise<AuthoritativeFixedPackDraftPayload> {
  try {
    const recommendations = await dependencies.loadRecommendations();
    const matches = recommendations.filter((result) => result.kind === "recommendation").filter((result) => result.recommendation.styleId === input.styleId && result.recommendation.parentProductId === input.parentProductId);
    if (matches.length !== 1) fail("recommendation_unavailable", "The current fixed-pack recommendation is unavailable. Refresh and try again.");
    const recommendation = matches[0].recommendation;
    if (recommendation.status !== "recommended" || !recommendation.trusted || !Number.isInteger(recommendation.recommendedPackCount) || (recommendation.recommendedPackCount ?? 0) <= 0 || !Number.isInteger(recommendation.recommendedTotalUnits) || (recommendation.recommendedTotalUnits ?? 0) <= 0 || recommendation.blockers.length > 0 || recommendation.sizes.length === 0) fail("recommendation_unavailable", "The current fixed-pack recommendation is no longer available.");
    if (recommendation.declaredUnitsPerPack <= 0 || recommendation.commercialUnitsPerPack !== null && recommendation.commercialUnitsPerPack !== recommendation.declaredUnitsPerPack) fail("canonical_data_incomplete", "Canonical pack data is incomplete.");
    const [catalogue, supplierResult, ruleResult, variantResult] = await Promise.all([
      dependencies.loadCatalogue(),
      dependencies.client.from("vault_suppliers").select("id,currency_code,is_active").eq("id", recommendation.supplierId).maybeSingle(),
      dependencies.client.from("vault_supplier_purchasing_rules").select("supplier_id,minimum_order_packs").eq("supplier_id", recommendation.supplierId).maybeSingle(),
      dependencies.client.from("vault_variants").select("id,product_id,model_design,normalized_size,source_variant_id,source_inventory_item_id").eq("product_id", input.parentProductId).eq("source", "shopify").eq("source_active", true).eq("identity_resolution_status", "resolved"),
    ]);
    if (supplierResult.error || ruleResult.error || variantResult.error) throw supplierResult.error ?? ruleResult.error ?? variantResult.error;
    const product = catalogue.products.filter((item) => item.style_id === input.styleId && item.parent_product_id === input.parentProductId && item.supplier_id === recommendation.supplierId);
    const supplier = supplierResult.data;
    const rule = ruleResult.data;
    const packCost = product.length === 1 ? product[0].commercial_cost.landed_cost_per_pack_gbp : null;
    const profitPerUnit = product.length === 1 ? product[0].commercial_cost.estimated_gross_profit_per_unit : null;
    if (!supplier?.is_active || !supplier.currency_code || !rule || product.length !== 1 || !product[0].product_name || packCost === null || packCost <= 0 || profitPerUnit === null || !Number.isFinite(profitPerUnit) || product[0].supplier_moq_packs === null || product[0].supplier_moq_packs < 0) fail("canonical_data_incomplete", "Canonical commercial data is incomplete.");
    const canonicalSupplier = supplier!;
    const canonicalRule = rule!;
    const canonicalPackCost = packCost!;
    const canonicalProfitPerUnit = profitPerUnit!;
    const variants = (variantResult.data ?? []) as Variant[];
    const allocations = recommendation.sizes.map((size) => {
      if (!Number.isInteger(size.unitsPerPack) || size.unitsPerPack <= 0 || !Number.isInteger(size.purchasedUnits) || size.purchasedUnits <= 0 || size.purchasedUnits !== recommendation.recommendedPackCount! * size.unitsPerPack) fail("canonical_data_incomplete", "Canonical pack composition is incomplete.");
      const matching = variants.filter((variant) => variant.model_design === recommendation.modelDesign && variant.normalized_size === size.normalizedSize && variant.source_variant_id && variant.source_inventory_item_id);
      if (matching.length !== 1) fail("canonical_data_incomplete", "Canonical Shopify variant identity is incomplete.");
      const variant = matching[0];
      return { normalized_size: size.normalizedSize, model_design: recommendation.modelDesign, variant_id: variant.id, shopify_variant_id_snapshot: variant.source_variant_id!, shopify_inventory_item_id_snapshot: variant.source_inventory_item_id!, units_per_pack: size.unitsPerPack, ordered_units: size.purchasedUnits };
    });
    if (allocations.reduce((sum, allocation) => sum + allocation.ordered_units, 0) !== recommendation.recommendedTotalUnits || allocations.reduce((sum, allocation) => sum + allocation.units_per_pack, 0) !== recommendation.declaredUnitsPerPack) fail("canonical_data_incomplete", "Canonical pack quantities do not conserve.");
    const payload: AuthoritativeFixedPackDraftPayload = { operator_id: operatorId, style_id: recommendation.styleId, parent_product_id: recommendation.parentProductId, supplier_id: recommendation.supplierId, currency: canonicalSupplier.currency_code!, idempotency_key: input.idempotencyKey, ...(input.targetDraftId ? { target_draft_id: input.targetDraftId } : {}), product_name: product[0].product_name, recommended_packs: recommendation.recommendedPackCount!, recommended_units: recommendation.recommendedTotalUnits!, units_per_pack: recommendation.declaredUnitsPerPack, product_moq_packs: product[0].supplier_moq_packs!, pack_cost_gbp: money(canonicalPackCost), line_cost_gbp: money(canonicalPackCost * recommendation.recommendedPackCount!), expected_profit_gbp: money(canonicalProfitPerUnit * recommendation.recommendedTotalUnits!), source_snapshot: { pack_definition_id: recommendation.packDefinitionId, supplier_purchasing_rule: { minimum_order_packs: canonicalRule.minimum_order_packs }, recommendation_evidence: { trusted: recommendation.trusted, reason_codes: recommendation.reasonCodes, warnings: recommendation.warnings, total_ideal_need_units: recommendation.totalIdealNeedUnits, total_shortage_remaining_units: recommendation.totalShortageRemainingUnits } }, allocations };
    return payload;
  } catch (error) {
    if (error instanceof FixedPackDraftError) throw error;
    throw error;
  }
}

export async function addFixedPackRecommendationToDraftFrom(operatorId: string, input: AddFixedPackRecommendationInput, dependencies: FixedPackDraftDependencies): Promise<FixedPackDraftResult> {
  try {
    const payload = await buildAuthoritativeFixedPackDraftPayloadFrom(operatorId, input, dependencies);
    const { data, error } = await dependencies.client.rpc("add_fixed_pack_recommendation_to_draft", { authoritative_payload: payload });
    if (error) {
      const message = error.message;
      if (message === "Multiple eligible fixed-pack drafts require an explicit target") fail("multiple_eligible_drafts", "Choose the draft to use before adding this recommendation.");
      if (message === "Explicit fixed-pack draft target is not eligible" || message === "Explicit fixed-pack draft target contains incompatible lines") fail("invalid_target_draft", "The selected draft is no longer available.");
      if (message === "Fixed-pack idempotency key was reused for a different recommendation") fail("refresh_required", "The request is stale. Refresh and try again.");
      if (message === "Fixed-pack recommendation changed; refresh before adding to draft") fail("changed_recommendation", "The recommendation changed. Refresh and try again.");
      if (["Fixed-pack authoritative payload is invalid", "Fixed-pack authoritative payload has invalid field types", "Fixed-pack authoritative payload is incomplete", "Fixed-pack recommended units do not conserve whole packs", "Fixed-pack allocations do not conserve the authoritative recommendation", "Fixed-pack allocation variant is not a current resolved canonical style variant", "Fixed-pack supplier was not found"].includes(message)) fail("canonical_data_incomplete", "Canonical fixed-pack data is incomplete. Refresh and try again.");
      throw error;
    }
    const row = data?.[0];
    if (!row) fail("operation_failed", "The draft operation did not return a result.");
    return { success: true, purchaseOrderId: row.purchase_order_id, purchaseOrderLineId: row.purchase_order_line_id, createdNewDraft: row.created_new_draft, createdNewLine: row.created_new_line, idempotent: row.idempotent };
  } catch (error) {
    if (error instanceof FixedPackDraftError) return { success: false, code: error.code, message: error.message };
    console.error("Unable to add fixed-pack recommendation to draft", error);
    return { success: false, code: "operation_failed", message: "The recommendation could not be added to a draft." };
  }
}

type PersistedDraftLine = { style_id: string; source_recommendation_type: string; source_snapshot: unknown };
type PersistedDraft = { id: string; supplier_id: string; currency: string; status: string; created_by_operator_id: string; vault_purchase_order_lines: PersistedDraftLine[] | null };

export async function loadCurrentFixedPackDraftMatchesFrom(operatorId: string, recommendations: Awaited<ReturnType<typeof loadFixedPackPurchaseRecommendations>>, dependencies: FixedPackDraftDependencies): Promise<Map<string, FixedPackDraftMatch>> {
  const orders = await dependencies.client.from("vault_purchase_orders").select("id,supplier_id,currency,status,created_by_operator_id,vault_purchase_order_lines(style_id,source_recommendation_type,source_snapshot)").eq("created_by_operator_id", operatorId).eq("status", "draft");
  if (orders.error) throw orders.error;
  const drafts = (orders.data ?? []) as PersistedDraft[];
  const matches = new Map<string, FixedPackDraftMatch>();
  for (const result of recommendations) {
    if (result.kind !== "recommendation") continue;
    try {
      const payload = await buildAuthoritativeFixedPackDraftPayloadFrom(operatorId, { styleId: result.recommendation.styleId, parentProductId: result.recommendation.parentProductId, idempotencyKey: "draft-match-read" }, { ...dependencies, loadRecommendations: async () => recommendations });
      const exactMatches = drafts.filter((draft) => draft.created_by_operator_id === operatorId && draft.status === "draft" && draft.supplier_id === payload.supplier_id && draft.currency === payload.currency && (draft.vault_purchase_order_lines ?? []).every((line) => line.source_recommendation_type === "fixed_pack_purchase_recommendation")).flatMap((draft) => (draft.vault_purchase_order_lines ?? []).filter((line) => line.style_id === payload.style_id && line.source_recommendation_type === "fixed_pack_purchase_recommendation" && matchesB4CanonicalSnapshot(payload, line.source_snapshot)).map(() => ({ purchaseOrderId: draft.id })));
      if (exactMatches.length === 1) matches.set(result.recommendation.recommendationId, exactMatches[0]);
    } catch {
      // A missing or ambiguous current canonical record must never suppress the add action.
    }
  }
  return matches;
}

export function loadCurrentFixedPackDraftMatches(operatorId: string, recommendations: Awaited<ReturnType<typeof loadFixedPackPurchaseRecommendations>>): Promise<Map<string, FixedPackDraftMatch>> {
  return loadCurrentFixedPackDraftMatchesFrom(operatorId, recommendations, productionDependencies);
}

export function addFixedPackRecommendationToDraft(operatorId: string, input: AddFixedPackRecommendationInput): Promise<FixedPackDraftResult> {
  return addFixedPackRecommendationToDraftFrom(operatorId, input, productionDependencies);
}
