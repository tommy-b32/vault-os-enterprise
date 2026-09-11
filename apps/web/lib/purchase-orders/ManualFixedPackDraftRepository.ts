import "server-only";
import { createHash } from "node:crypto";
import { getCatalogueData } from "@/lib/catalogue";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type AddManualFixedPackInput = { purchaseOrderId: string; parentProductId: string; styleId: string; packCount: number; idempotencyKey: string };
export type ManualFixedPackDraftResult = { success: true; purchaseOrderId: string; purchaseOrderLineId: string; idempotent: boolean } | { success: false; code: "request_invalid" | "po_not_found" | "po_not_draft" | "po_not_fixed_pack_compatible" | "supplier_mismatch" | "currency_not_gbp" | "style_not_found" | "style_already_in_draft" | "restock_disabled" | "pack_composition_missing" | "pack_composition_invalid" | "variant_identity_invalid" | "commercial_cost_missing" | "product_moq_not_met" | "idempotency_conflict" | "operation_failed"; message: string };
type PurchaseOrderLine = { style_id: string; source_recommendation_type: string };
type PurchaseOrder = { id: string; status: string; supplier_id: string; currency: string; created_by_operator_id: string | null; vault_purchase_order_lines: PurchaseOrderLine[] | null };
type Supplier = { id: string; is_active: boolean; currency_code: string | null };
type SupplierRule = { supplier_id: string; minimum_order_packs: number | null };
type PackComponent = { id: string; supplier_id: string; style_id: string; parent_product_id: string; normalized_size: string | null; units_per_pack: number | null; declared_units_per_pack: number | null; composition_complete: boolean; composition_valid: boolean; commercial_pack_consistent: boolean | null; active: boolean; updated_at: string };
type Variant = { id: string; product_id: string; model_design: string | null; normalized_size: string | null; source_variant_id: string | null; source_inventory_item_id: string | null };
type Allocation = { normalized_size: string; model_design: string; variant_id: string; shopify_variant_id_snapshot: string; shopify_inventory_item_id_snapshot: string; units_per_pack: number; ordered_units: number };
type ManualSnapshot = { source_type: "manual_fixed_pack_purchase"; purchase_order_id: string; supplier_id: string; currency: "GBP"; style_id: string; parent_product_id: string; model_design: string; product_name: string; pack_definition_id: string; pack_definition_updated_at: string; recommended_packs: number; units_per_pack: number; recommended_units: number; allocations: Allocation[]; pack_cost_gbp: number; line_cost_gbp: number; product_moq_packs: number | null; supplier_purchasing_rule: { minimum_order_packs: number | null }; fingerprint?: string };
type RpcRow = { purchase_order_id: string; purchase_order_line_id: string; idempotent: boolean };
type Dependencies = { client: typeof supabaseAdmin; loadCatalogue: typeof getCatalogueData };
const productionDependencies: Dependencies = { client: supabaseAdmin, loadCatalogue: getCatalogueData };
class ManualError extends Error { constructor(readonly code: Exclude<ManualFixedPackDraftResult, { success: true }> ["code"], message: string) { super(message); } }
const fail = (code: ManualError["code"], message: string): never => { throw new ManualError(code, message); };
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export async function buildManualFixedPackPayloadFrom(operatorId: string, input: AddManualFixedPackInput, dependencies: Dependencies): Promise<Record<string, unknown>> {
  const [poResult, catalogue, compositionResult, variantResult] = await Promise.all([
    dependencies.client.from("vault_purchase_orders").select("id,status,supplier_id,currency,created_by_operator_id,vault_purchase_order_lines(style_id,source_recommendation_type)").eq("id", input.purchaseOrderId).maybeSingle(),
    dependencies.loadCatalogue(),
    dependencies.client.from("vault_supplier_style_pack_composition_intelligence").select("id,supplier_id,style_id,parent_product_id,normalized_size,units_per_pack,declared_units_per_pack,composition_complete,composition_valid,commercial_pack_consistent,active,updated_at").eq("style_id", input.styleId),
    dependencies.client.from("vault_variants").select("id,product_id,model_design,normalized_size,source_variant_id,source_inventory_item_id").eq("product_id", input.parentProductId).eq("source", "shopify").eq("source_active", true).eq("identity_resolution_status", "resolved"),
  ]);
  if (poResult.error || compositionResult.error || variantResult.error) throw poResult.error ?? compositionResult.error ?? variantResult.error;
  const po = (poResult.data as PurchaseOrder | null) ?? fail("po_not_found", "The draft purchase order was not found.");
  const [supplierResult, ruleResult] = await Promise.all([
    dependencies.client.from("vault_suppliers").select("id,is_active,currency_code").eq("id", po.supplier_id).maybeSingle(),
    dependencies.client.from("vault_supplier_purchasing_rules").select("supplier_id,minimum_order_packs").eq("supplier_id", po.supplier_id).maybeSingle(),
  ]);
  if (supplierResult.error || ruleResult.error) throw supplierResult.error ?? ruleResult.error;
  if (po.created_by_operator_id !== operatorId) fail("po_not_found", "The draft purchase order was not found.");
  if (po.status !== "draft") fail("po_not_draft", "The purchase order is no longer a draft.");
  if (po.currency !== "GBP") fail("currency_not_gbp", "The purchase order currency must be GBP.");
  if ((po.vault_purchase_order_lines ?? []).some((line) => !["fixed_pack_purchase_recommendation", "manual_fixed_pack_purchase"].includes(line.source_recommendation_type))) fail("po_not_fixed_pack_compatible", "This draft is not compatible with fixed-pack additions.");
  if ((po.vault_purchase_order_lines ?? []).some((line) => line.style_id === input.styleId)) fail("style_already_in_draft", "This style is already in the draft.");
  const product = catalogue.products.filter((item) => item.style_id === input.styleId && item.parent_product_id === input.parentProductId && item.supplier_id === po.supplier_id);
  if (product.length !== 1) fail("style_not_found", "The selected supplier style is unavailable.");
  const item = product[0];
  if (!item.restock_enabled || item.inventory_strategy === "do_not_restock") fail("restock_disabled", "This style is not enabled for restocking.");
  const supplier = (supplierResult.data as Supplier | null) ?? fail("supplier_mismatch", "The selected style supplier does not match this draft.");
  if (!supplier.is_active || supplier.id !== po.supplier_id) fail("supplier_mismatch", "The selected style supplier does not match this draft.");
  if (supplier.currency_code !== "GBP") fail("currency_not_gbp", "The supplier currency must be GBP.");
  if (!Number.isSafeInteger(input.packCount) || input.packCount <= 0) fail("request_invalid", "The pack count must be a positive whole number.");
  if (item.supplier_moq_packs !== null && input.packCount < item.supplier_moq_packs) fail("product_moq_not_met", "The selected pack count does not meet the product minimum.");
  const rows = ((compositionResult.data ?? []) as PackComponent[]).filter((row) => row.supplier_id === po.supplier_id && row.parent_product_id === input.parentProductId && row.active && row.composition_complete && row.composition_valid && row.commercial_pack_consistent === true);
  if (!rows.length) fail("pack_composition_missing", "A valid pack composition is unavailable.");
  const definitionIds = new Set(rows.map((row) => row.id));
  if (definitionIds.size !== 1 || rows.some((row) => !row.normalized_size || row.units_per_pack === null || !Number.isInteger(row.units_per_pack) || row.units_per_pack <= 0)) fail("pack_composition_invalid", "The pack composition is invalid.");
  const modelDesign = input.styleId.split("::")[1] ?? "";
  if (!modelDesign) fail("style_not_found", "The selected style is unavailable.");
  const allocations: Allocation[] = rows.map((row) => { const normalizedSize = row.normalized_size ?? fail("pack_composition_invalid", "The pack composition is invalid."); const unitsPerPack = row.units_per_pack ?? fail("pack_composition_invalid", "The pack composition is invalid."); if (!Number.isInteger(unitsPerPack) || unitsPerPack <= 0) fail("pack_composition_invalid", "The pack composition is invalid."); const matches = ((variantResult.data ?? []) as Variant[]).filter((variant) => variant.model_design === modelDesign && variant.normalized_size === normalizedSize && variant.source_variant_id && variant.source_inventory_item_id); if (matches.length !== 1) fail("variant_identity_invalid", "Canonical variant identity is incomplete."); const variant = matches[0]!; return { normalized_size: normalizedSize, model_design: modelDesign, variant_id: variant.id, shopify_variant_id_snapshot: variant.source_variant_id!, shopify_inventory_item_id_snapshot: variant.source_inventory_item_id!, units_per_pack: unitsPerPack, ordered_units: input.packCount * unitsPerPack }; }).sort((a, b) => a.normalized_size.localeCompare(b.normalized_size));
  const unitsPerPack = allocations.reduce((sum, allocation) => sum + allocation.units_per_pack, 0);
  if (unitsPerPack !== rows[0].declared_units_per_pack) fail("pack_composition_invalid", "The pack composition does not conserve units.");
  const packCost = item.commercial_cost.landed_cost_per_pack_gbp;
  if (packCost === null || !Number.isFinite(packCost) || packCost <= 0) fail("commercial_cost_missing", "Current commercial cost is unavailable.");
  const canonicalPackCost = packCost as number;
  const rule = ruleResult.data as SupplierRule | null;
  const snapshot: ManualSnapshot = { source_type: "manual_fixed_pack_purchase", purchase_order_id: po.id, supplier_id: po.supplier_id, currency: "GBP", style_id: input.styleId, parent_product_id: input.parentProductId, model_design: modelDesign, product_name: item.product_name, pack_definition_id: rows[0].id, pack_definition_updated_at: rows[0].updated_at, recommended_packs: input.packCount, units_per_pack: unitsPerPack, recommended_units: input.packCount * unitsPerPack, allocations, pack_cost_gbp: money(canonicalPackCost), line_cost_gbp: money(canonicalPackCost * input.packCount), product_moq_packs: item.supplier_moq_packs, supplier_purchasing_rule: { minimum_order_packs: rule?.minimum_order_packs ?? null } };
  snapshot.fingerprint = createHash("md5").update(JSON.stringify(snapshot)).digest("hex");
  return { operator_id: operatorId, idempotency_key: input.idempotencyKey, ...snapshot };
}

export async function addManualFixedPackToDraftFrom(operatorId: string, input: AddManualFixedPackInput, dependencies: Dependencies): Promise<ManualFixedPackDraftResult> { try { const payload = await buildManualFixedPackPayloadFrom(operatorId, input, dependencies); const { data, error } = await dependencies.client.rpc("add_manual_fixed_pack_to_draft", { authoritative_payload: payload }); if (error) { const codes: Record<string, ManualError["code"]> = { "Manual fixed-pack style already exists in draft": "style_already_in_draft", "Manual fixed-pack idempotency conflict": "idempotency_conflict" }; fail(codes[error.message] ?? "operation_failed", codes[error.message] ? "The request conflicts with the current draft." : "The manual fixed-pack addition could not be completed."); } const row = (data?.[0] as RpcRow | undefined) ?? fail("operation_failed", "The draft operation did not return a result."); return { success: true, purchaseOrderId: row.purchase_order_id, purchaseOrderLineId: row.purchase_order_line_id, idempotent: row.idempotent }; } catch (error) { if (error instanceof ManualError) return { success: false, code: error.code, message: error.message }; console.error("Unable to add manual fixed-pack to draft", error); return { success: false, code: "operation_failed", message: "The manual fixed-pack addition could not be completed." }; } }
export function addManualFixedPackToDraft(operatorId: string, input: AddManualFixedPackInput) { return addManualFixedPackToDraftFrom(operatorId, input, productionDependencies); }
