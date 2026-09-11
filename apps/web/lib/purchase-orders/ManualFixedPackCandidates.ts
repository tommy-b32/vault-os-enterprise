import "server-only";
import { getCatalogueData } from "@/lib/catalogue";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadSupplierStylePackCompositionIntelligence } from "@/lib/supplier-style-pack-composition";

export type ManualFixedPackCandidate = Readonly<{ parentProductId: string; styleId: string; productName: string; modelDesign: string; supplierId: string; supplierName: string; unitsPerPack: number; packCostGbp: number | null; productMoqPacks: number | null; composition: readonly Readonly<{ normalizedSize: string; unitsPerPack: number }>[] }>;
export type ManualFixedPackCandidatesResult = Readonly<{ status: "compatible"; purchaseOrderId: string; supplierId: string; supplierName: string; supplierMinimumOrderPacks: number | null; currentBasketPacks: number; remainingPacksToMinimum: number | null; candidates: readonly ManualFixedPackCandidate[] }> | Readonly<{ status: "incompatible"; reason: "po_not_found" | "po_not_draft" | "po_not_fixed_pack_compatible" | "currency_not_gbp" | "supplier_inactive" }>;
type Dependencies = { client: typeof supabaseAdmin; loadCatalogue: typeof getCatalogueData; loadComposition: typeof loadSupplierStylePackCompositionIntelligence };
const production: Dependencies = { client: supabaseAdmin, loadCatalogue: getCatalogueData, loadComposition: loadSupplierStylePackCompositionIntelligence };
const fixedSources = new Set(["fixed_pack_purchase_recommendation", "manual_fixed_pack_purchase"]);

export async function loadManualFixedPackCandidatesFrom(purchaseOrderId: string, dependencies: Dependencies): Promise<ManualFixedPackCandidatesResult> {
  try {
    const [poResponse, catalogue, composition] = await Promise.all([
      dependencies.client.from("vault_purchase_orders").select("id,status,currency,supplier_id,vault_purchase_order_lines(style_id,recommended_packs,source_recommendation_type)").eq("id", purchaseOrderId).maybeSingle(),
      dependencies.loadCatalogue(), dependencies.loadComposition(),
    ]);
    if (poResponse.error || !poResponse.data) return { status: "incompatible", reason: "po_not_found" };
    const po = poResponse.data as { id: string; status: string; currency: string; supplier_id: string; vault_purchase_order_lines: Array<{ style_id: string; recommended_packs: number; source_recommendation_type: string }> | null };
    if (po.status !== "draft") return { status: "incompatible", reason: "po_not_draft" };
    if (po.currency !== "GBP") return { status: "incompatible", reason: "currency_not_gbp" };
    if ((po.vault_purchase_order_lines ?? []).some((line) => !fixedSources.has(line.source_recommendation_type))) return { status: "incompatible", reason: "po_not_fixed_pack_compatible" };
    const [supplierResponse, ruleResponse, variantsResponse] = await Promise.all([
      dependencies.client.from("vault_suppliers").select("id,supplier_name,is_active,currency_code").eq("id", po.supplier_id).maybeSingle(),
      dependencies.client.from("vault_supplier_purchasing_rules").select("minimum_order_packs").eq("supplier_id", po.supplier_id).maybeSingle(),
      dependencies.client.from("vault_variants").select("id,product_id,model_design,normalized_size,source_variant_id,source_inventory_item_id").eq("source", "shopify").eq("source_active", true).eq("identity_resolution_status", "resolved"),
    ]);
    const supplier = supplierResponse.data as { id: string; supplier_name: string; is_active: boolean; currency_code: string | null } | null;
    if (!supplier?.is_active) return { status: "incompatible", reason: "supplier_inactive" };
    if (supplier.currency_code !== "GBP") return { status: "incompatible", reason: "currency_not_gbp" };
    const existing = new Set((po.vault_purchase_order_lines ?? []).map((line) => line.style_id));
    const variants = (variantsResponse.data ?? []) as Array<{ id: string; product_id: string; model_design: string | null; normalized_size: string | null; source_variant_id: string | null; source_inventory_item_id: string | null }>;
    const candidates = catalogue.products.flatMap((product) => {
      const modelDesign = product.style_id?.split("::")[1] ?? "";
      if (product.supplier_id !== supplier.id || !product.parent_product_id || !product.style_id || !product.product_name || !modelDesign || !product.restock_enabled || product.inventory_strategy === "do_not_restock" || existing.has(product.style_id)) return [];
      const rows = composition.filter((row) => row.supplier_id === supplier.id && row.style_id === product.style_id && row.parent_product_id === product.parent_product_id && row.active && row.composition_complete && row.composition_valid && row.commercial_pack_consistent === true);
      if (!rows.length || new Set(rows.map((row) => row.id)).size !== 1) return [];
      const seen = new Set<string>(); const shape = rows.map((row) => { const unitsPerPack = row.units_per_pack; if (!row.normalized_size || unitsPerPack === null || !Number.isSafeInteger(unitsPerPack) || unitsPerPack <= 0 || seen.has(row.normalized_size)) return null; seen.add(row.normalized_size); return { normalizedSize: row.normalized_size, unitsPerPack }; });
      const declaredUnitsPerPack = rows[0]?.declared_units_per_pack; if (shape.some((row) => !row) || shape.length !== rows.length || declaredUnitsPerPack === undefined || shape.reduce((sum, row) => sum + row!.unitsPerPack, 0) !== declaredUnitsPerPack) return [];
      const packCost = product.commercial_cost.landed_cost_per_pack_gbp; if (packCost === null || !Number.isFinite(packCost) || packCost <= 0) return [];
      if (shape.some((row) => variants.filter((variant) => variant.product_id === product.parent_product_id && variant.model_design === modelDesign && variant.normalized_size === row!.normalizedSize && variant.source_variant_id && variant.source_inventory_item_id).length !== 1)) return [];
      return [{ parentProductId: product.parent_product_id, styleId: product.style_id, productName: product.product_name, modelDesign, supplierId: supplier.id, supplierName: supplier.supplier_name, unitsPerPack: declaredUnitsPerPack, packCostGbp: packCost, productMoqPacks: product.supplier_moq_packs, composition: shape as Array<{ normalizedSize: string; unitsPerPack: number }> }];
    }).sort((a, b) => a.productName.localeCompare(b.productName, undefined, { sensitivity: "accent", numeric: true }) || a.modelDesign.localeCompare(b.modelDesign, undefined, { sensitivity: "accent", numeric: true }));
    const currentBasketPacks = (po.vault_purchase_order_lines ?? []).reduce((sum, line) => sum + line.recommended_packs, 0); const minimum = (ruleResponse.data as { minimum_order_packs: number | null } | null)?.minimum_order_packs ?? null;
    return { status: "compatible", purchaseOrderId: po.id, supplierId: supplier.id, supplierName: supplier.supplier_name, supplierMinimumOrderPacks: minimum, currentBasketPacks, remainingPacksToMinimum: minimum === null ? null : Math.max(0, minimum - currentBasketPacks), candidates };
  } catch { return { status: "incompatible", reason: "po_not_found" }; }
}
export function loadManualFixedPackCandidates(purchaseOrderId: string) { return loadManualFixedPackCandidatesFrom(purchaseOrderId, production); }
