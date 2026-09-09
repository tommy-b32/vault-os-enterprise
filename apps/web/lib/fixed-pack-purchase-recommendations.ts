import { loadModelSizeReplenishmentEvidence, type ModelSizeReplenishmentEvidence } from "./model-size-replenishment-evidence.ts";
import { loadSupplierStylePackCompositionIntelligence, type SupplierStylePackCompositionIntelligence } from "./supplier-style-pack-composition.ts";
import {
  calculateIdealSizeNeed,
  selectFixedPackPurchaseCandidate,
  simulateFixedPackCandidates,
  type FixedPackPurchaseRecommendation,
  type FixedPackPurchaseReasonCode,
} from "./brain/FixedPackPurchaseRecommendationEngine.ts";

export type FixedPackStyleCatalogueRow = { styleId: string; parentProductId: string; supplierId: string; targetStockDays: number | null; inventoryStrategy: string | null; restockEnabled: boolean | null };
export type FixedPackStyleReplenishmentRow = { styleId: string; parentProductId: string; sales7DayUnits: number | null; sales14DayUnits: number | null; sales30DayUnits: number | null; targetStockDays: number | null; supplierLeadTimeDays: number | null };
export type FixedPackPurchaseServiceReasonCode = FixedPackPurchaseReasonCode | "RESTOCK_DISABLED";
export type FixedPackPurchaseRecommendationServiceResult =
  | { kind: "recommendation"; recommendation: FixedPackPurchaseRecommendation }
  | { kind: "unavailable"; status: "unavailable"; supplierId: string | null; styleId: string; parentProductId: string | null; modelDesign: string | null; packDefinitionId: string | null; recommendedPackCount: null; recommendedTotalUnits: null; blockers: FixedPackPurchaseServiceReasonCode[]; warnings: FixedPackPurchaseServiceReasonCode[]; reasons: FixedPackPurchaseServiceReasonCode[] }
  | { kind: "not_applicable"; status: "not_applicable"; supplierId: string; styleId: string; parentProductId: string; modelDesign: string; packDefinitionId: null; recommendedPackCount: null; recommendedTotalUnits: null; blockers: ["RESTOCK_DISABLED"]; warnings: []; reasons: ["RESTOCK_DISABLED"] };
export type FixedPackPurchaseRecommendationDependencies = {
  loadModelSizeEvidence: () => Promise<ModelSizeReplenishmentEvidence[]>;
  loadPackComposition: () => Promise<SupplierStylePackCompositionIntelligence[]>;
  loadStyleCatalogue: () => Promise<FixedPackStyleCatalogueRow[]>;
  loadStyleReplenishment: () => Promise<FixedPackStyleReplenishmentRow[]>;
};

const unavailable = (styleId: string, parentProductId: string | null, modelDesign: string | null, supplierId: string | null, packDefinitionId: string | null, blockers: FixedPackPurchaseReasonCode[]): FixedPackPurchaseRecommendationServiceResult => ({ kind: "unavailable", status: "unavailable", supplierId, styleId, parentProductId, modelDesign, packDefinitionId, recommendedPackCount: null, recommendedTotalUnits: null, blockers, warnings: [], reasons: blockers });
const notApplicable = (styleId: string, parentProductId: string, modelDesign: string, supplierId: string): FixedPackPurchaseRecommendationServiceResult => ({ kind: "not_applicable", status: "not_applicable", supplierId, styleId, parentProductId, modelDesign, packDefinitionId: null, recommendedPackCount: null, recommendedTotalUnits: null, blockers: ["RESTOCK_DISABLED"], warnings: [], reasons: ["RESTOCK_DISABLED"] });
const key = (supplierId: string, styleId: string) => `${supplierId}\u0000${styleId}`;
const sizeOrder = ["S", "M", "L", "XL", "2XL", "3XL"];

export async function loadFixedPackPurchaseRecommendationsFrom(deps: FixedPackPurchaseRecommendationDependencies): Promise<FixedPackPurchaseRecommendationServiceResult[]> {
  const [evidence, packs, catalogue, replenishment] = await Promise.all([deps.loadModelSizeEvidence(), deps.loadPackComposition(), deps.loadStyleCatalogue(), deps.loadStyleReplenishment()]);
  const groups = new Map<string, ModelSizeReplenishmentEvidence[]>();
  for (const row of evidence) groups.set(`${row.style_id}\u0000${row.parent_product_id}`, [...(groups.get(`${row.style_id}\u0000${row.parent_product_id}`) ?? []), row]);
  const results: FixedPackPurchaseRecommendationServiceResult[] = [];
  for (const [groupKey, rows] of groups) {
    const [styleId, parentProductId] = groupKey.split("\u0000");
    const modelDesigns = [...new Set(rows.map((row) => row.model_design))];
    if (modelDesigns.length !== 1) { results.push(unavailable(styleId, parentProductId, null, null, null, ["SEMANTIC_IDENTITY_UNRESOLVED"])); continue; }
    const owners = catalogue.filter((row) => row.styleId === styleId && row.parentProductId === parentProductId);
    if (owners.length === 0) { results.push(unavailable(styleId, parentProductId, modelDesigns[0], null, null, ["SUPPLIER_MISSING"])); continue; }
    if (owners.length !== 1) { results.push(unavailable(styleId, parentProductId, modelDesigns[0], null, null, ["SUPPLIER_STYLE_OWNERSHIP_AMBIGUOUS"])); continue; }
    const owner = owners[0];
    if (owner.inventoryStrategy === "do_not_restock" || owner.restockEnabled === false) { results.push(notApplicable(styleId, parentProductId, modelDesigns[0], owner.supplierId)); continue; }
    const packRows = packs.filter((row) => row.supplier_id === owner.supplierId && row.style_id === styleId);
    if (packRows.length === 0) { results.push(unavailable(styleId, parentProductId, modelDesigns[0], owner.supplierId, null, ["PACK_COMPOSITION_MISSING"])); continue; }
    const definition = packRows[0];
    if (packRows.some((row) => row.id !== definition.id || row.parent_product_id !== parentProductId || !row.active || !row.composition_complete || !row.composition_valid)) { results.push(unavailable(styleId, parentProductId, modelDesigns[0], owner.supplierId, definition.id, ["PACK_COMPOSITION_INVALID"])); continue; }
    if (definition.commercial_pack_consistent === false) { results.push(unavailable(styleId, parentProductId, modelDesigns[0], owner.supplierId, definition.id, ["COMMERCIAL_PACK_MISMATCH"])); continue; }
    const style = replenishment.find((row) => row.styleId === styleId && row.parentProductId === parentProductId);
    if (!style || owner.targetStockDays !== style.targetStockDays) { results.push(unavailable(styleId, parentProductId, modelDesigns[0], owner.supplierId, definition.id, ["TARGET_STOCK_POLICY_MISSING"])); continue; }
    const needs = rows.map((row) => calculateIdealSizeNeed({ evidence: { modelSizeId: row.model_size_id, normalizedSize: row.normalized_size, availableStock: row.available_stock, committedStock: row.committed_stock, incomingStock: row.incoming_stock, netAvailableStock: row.net_available_stock, sales7DayUnits: row.sales_7_day_units, sales14DayUnits: row.sales_14_day_units, sales30DayUnits: row.sales_30_day_units, averageDailySales: row.average_daily_sales, inventoryFreshness: row.inventory_freshness, orderHistoryFreshness: row.order_history_freshness, salesHistory30Complete: row.sales_history_30_complete, styleSalesMappingComplete: row.style_sales_mapping_complete, styleUnresolvedCleanSalesUnits: row.style_unresolved_clean_sales_units, globalSalesMappingComplete: row.global_sales_mapping_complete, globalUnresolvedCleanSalesUnits: row.global_unresolved_clean_sales_units, globalUnmatchedCleanSalesUnits: row.global_unmatched_clean_sales_units, trusted: row.trusted, missingRequirements: row.missing_requirements }, targetStockDays: owner.targetStockDays, supplierLeadTimeDays: style.supplierLeadTimeDays, styleSales7DayUnits: style.sales7DayUnits, styleSales14DayUnits: style.sales14DayUnits }));
    if (needs.some((need) => need.status === "unavailable")) { results.push(unavailable(styleId, parentProductId, modelDesigns[0], owner.supplierId, definition.id, needs.flatMap((need) => need.blockers))); continue; }
    try {
      const composition = packRows.filter((row) => row.normalized_size !== null && row.units_per_pack !== null).map((row) => ({ normalizedSize: row.normalized_size as string, unitsPerPack: row.units_per_pack as number }));
      if (composition.length === 0) throw new Error("empty");
      const base = Math.max(...composition.map((size) => Math.ceil((needs.find((need) => need.normalizedSize === size.normalizedSize)?.idealNeedUnits ?? 0) / size.unitsPerPack)));
      const fast = (style.sales7DayUnits ?? 0) >= 4;
      const allNeed = composition.every((size) => (needs.find((need) => need.normalizedSize === size.normalizedSize)?.idealNeedUnits ?? 0) > 0);
      const candidates = simulateFixedPackCandidates({ declaredUnitsPerPack: definition.declared_units_per_pack, composition, sizeEvidence: rows.map((row) => ({ modelSizeId: row.model_size_id, normalizedSize: row.normalized_size, availableStock: row.available_stock, committedStock: row.committed_stock, incomingStock: row.incoming_stock, netAvailableStock: row.net_available_stock, sales7DayUnits: row.sales_7_day_units, sales14DayUnits: row.sales_14_day_units, sales30DayUnits: row.sales_30_day_units, averageDailySales: row.average_daily_sales, inventoryFreshness: row.inventory_freshness, orderHistoryFreshness: row.order_history_freshness, salesHistory30Complete: row.sales_history_30_complete, styleSalesMappingComplete: row.style_sales_mapping_complete, styleUnresolvedCleanSalesUnits: row.style_unresolved_clean_sales_units, globalSalesMappingComplete: row.global_sales_mapping_complete, globalUnresolvedCleanSalesUnits: row.global_unresolved_clean_sales_units, globalUnmatchedCleanSalesUnits: row.global_unmatched_clean_sales_units, trusted: row.trusted, missingRequirements: row.missing_requirements })), idealSizeNeeds: needs, candidatePackCounts: Array.from({ length: base + (fast && allNeed ? 1 : 0) + 1 }, (_, index) => index) });
      const selection = selectFixedPackPurchaseCandidate({ candidates, styleSales7DayUnits: style.sales7DayUnits ?? 0, commercialPackConsistent: definition.commercial_pack_consistent, historyEligibility: needs[0].historyEligibility });
      if (selection.status === "unavailable" || !selection.selectedCandidate) { results.push(unavailable(styleId, parentProductId, modelDesigns[0], owner.supplierId, definition.id, selection.blockers)); continue; }
      const selected = selection.selectedCandidate;
      results.push({ kind: "recommendation", recommendation: { recommendationId: key(owner.supplierId, styleId), supplierId: owner.supplierId, styleId, parentProductId, modelDesign: modelDesigns[0], packDefinitionId: definition.id, declaredUnitsPerPack: definition.declared_units_per_pack, commercialUnitsPerPack: definition.commercial_units_per_pack, applicableMoqPacks: null, recommendedPackCount: selection.recommendedPackCount, recommendedTotalUnits: selection.recommendedTotalUnits, status: selection.status, trusted: selection.trusted, blockers: selection.blockers, warnings: selection.warnings, reasonCodes: selection.reasonCodes, totalIdealNeedUnits: selected.totalIdealNeedUnits, totalShortageRemainingUnits: selected.totalShortageRemainingUnits, totalProjectedExcessUnits: selected.totalProjectedExcessUnits, totalPackShapeExcessUnits: selected.totalPackShapeExcessUnits, sizes: [] } });
    } catch { results.push(unavailable(styleId, parentProductId, modelDesigns[0], owner.supplierId, definition.id, ["PACK_SIZE_EVIDENCE_MISSING"])); }
  }
  return results.sort((a, b) => {
    const left = a.kind === "recommendation" ? a.recommendation : a;
    const right = b.kind === "recommendation" ? b.recommendation : b;
    return `${left.supplierId ?? ""}\u0000${left.styleId}`.localeCompare(`${right.supplierId ?? ""}\u0000${right.styleId}`);
  });
}

export async function loadFixedPackPurchaseRecommendations(): Promise<FixedPackPurchaseRecommendationServiceResult[]> {
  const { supabaseAdmin } = await import("./supabase-admin.ts");
  return loadFixedPackPurchaseRecommendationsFrom({
    loadModelSizeEvidence: loadModelSizeReplenishmentEvidence,
    loadPackComposition: loadSupplierStylePackCompositionIntelligence,
    loadStyleCatalogue: async () => { const r = await supabaseAdmin.from("vault_style_catalogue_intelligence").select("style_id,parent_product_id,supplier_id,target_stock_days,inventory_strategy,restock_enabled"); if (r.error) throw r.error; return (r.data ?? []).map((x) => ({ styleId: x.style_id, parentProductId: x.parent_product_id, supplierId: x.supplier_id, targetStockDays: x.target_stock_days, inventoryStrategy: x.inventory_strategy, restockEnabled: x.restock_enabled })); },
    loadStyleReplenishment: async () => { const r = await supabaseAdmin.from("vault_style_replenishment_intelligence").select("style_id,parent_product_id,sales_7_day_units,sales_14_day_units,sales_30_day_units,target_stock_days,supplier_lead_time_days"); if (r.error) throw r.error; return (r.data ?? []).map((x) => ({ styleId: x.style_id, parentProductId: x.parent_product_id, sales7DayUnits: x.sales_7_day_units, sales14DayUnits: x.sales_14_day_units, sales30DayUnits: x.sales_30_day_units, targetStockDays: x.target_stock_days, supplierLeadTimeDays: x.supplier_lead_time_days })); },
  });
}
