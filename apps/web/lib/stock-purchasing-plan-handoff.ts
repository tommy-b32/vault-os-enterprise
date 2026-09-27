import "server-only";

import { getCatalogueData } from "@/lib/catalogue";
import { loadFixedPackPurchaseRecommendations, type FixedPackPurchaseRecommendationServiceResult } from "@/lib/fixed-pack-purchase-recommendations";
import { addFixedPackRecommendationToDraftUsingRecommendationsFrom, type AddFixedPackRecommendationInput, type FixedPackDraftDependencies, type FixedPackDraftResult } from "@/lib/purchase-orders/FixedPackDraftRepository";
import { stage3CurrentDaysCover, stage3PackFit, stage3StockState } from "@/lib/stock-reorder-presentation";
import { buildStockPurchasingPlan, type StockPurchasingPlanCandidate } from "@/lib/stock-purchasing-plan";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type Stage4HandoffResult = FixedPackDraftResult | { success: false; code: "stage4_plan_not_allocated"; message: string };
export type Stage4HandoffDependencies = Pick<FixedPackDraftDependencies, "loadRecommendations" | "loadCatalogue" | "client"> & { loadBudget: () => Promise<number | null>; loadWalletCapacity: () => Promise<number | null> };

function candidates(results: Awaited<ReturnType<typeof loadFixedPackPurchaseRecommendations>>, catalogue: Awaited<ReturnType<typeof getCatalogueData>>): StockPurchasingPlanCandidate[] {
  return results.flatMap((result) => {
    if (result.kind !== "recommendation") return [];
    const recommendation = result.recommendation;
    const products = catalogue.products.filter((product) => product.style_id === recommendation.styleId && product.parent_product_id === recommendation.parentProductId && product.supplier_id === recommendation.supplierId);
    const product = products.length === 1 ? products[0] : null;
    const cover = recommendation.sizes.map(stage3CurrentDaysCover).filter((value): value is number => value !== null);
    const fit = stage3PackFit(recommendation);
    const cost = product?.commercial_cost?.landed_cost_per_pack_gbp;
    return [{ recommendationId: recommendation.recommendationId, supplierId: recommendation.supplierId, supplierName: null, styleId: recommendation.styleId, parentProductId: recommendation.parentProductId, productName: product?.product_name ?? null, modelDesign: recommendation.modelDesign, trusted: recommendation.trusted, recommendedPackCount: recommendation.recommendedPackCount, recommendedTotalUnits: recommendation.recommendedTotalUnits, landedCostPerPackGbp: typeof cost === "number" && Number.isFinite(cost) ? cost : null, stockState: stage3StockState(recommendation), packFit: fit === "DO NOT REORDER" ? null : fit, currentCoverDays: cover.length ? Math.min(...cover) : null, demandPressure: recommendation.totalIdealNeedUnits ?? 0, leadTimeDays: recommendation.governedLeadTimeDays, totalShortageRemainingUnits: recommendation.totalShortageRemainingUnits ?? 0, totalProjectedExcessUnits: recommendation.totalProjectedExcessUnits ?? 0, reasonCodes: recommendation.reasonCodes }];
  });
}

export async function addAllocatedStockPurchasingPlanRecommendationFrom(operatorId: string, input: AddFixedPackRecommendationInput, dependencies: Stage4HandoffDependencies): Promise<Stage4HandoffResult> {
  try {
    const [recommendations, catalogue, budgetGbp, walletCapacityGbp] = await Promise.all([dependencies.loadRecommendations(), dependencies.loadCatalogue(), dependencies.loadBudget(), dependencies.loadWalletCapacity()]);
    const plan = buildStockPurchasingPlan(candidates(recommendations, catalogue), budgetGbp, walletCapacityGbp);
    const allocated = plan.items.find((item) => item.styleId === input.styleId && item.parentProductId === input.parentProductId && item.planningState === "ALLOCATED");
    if (!allocated) return { success: false, code: "stage4_plan_not_allocated", message: "This recommendation is no longer allocated by the current Stock Purchasing Budget and wallet plan. Refresh and review the plan." };
    return addFixedPackRecommendationToDraftUsingRecommendationsFrom(operatorId, input, recommendations, { loadRecommendations: dependencies.loadRecommendations, loadCatalogue: async () => catalogue, client: dependencies.client });
  } catch {
    return { success: false, code: "stage4_plan_not_allocated", message: "Current planning evidence is unavailable. Refresh and review the purchasing plan." };
  }
}

export function addAllocatedStockPurchasingPlanRecommendation(operatorId: string, input: AddFixedPackRecommendationInput): Promise<Stage4HandoffResult> {
  return addAllocatedStockPurchasingPlanRecommendationFrom(operatorId, input, {
    loadRecommendations: loadFixedPackPurchaseRecommendations,
    loadCatalogue: getCatalogueData,
    client: supabaseAdmin,
    loadBudget: async () => { const result = await supabaseAdmin.from("vault_stock_purchasing_budget").select("budget_gbp").eq("id", true).maybeSingle(); if (result.error) throw result.error; return result.data?.budget_gbp ?? null; },
    loadWalletCapacity: async () => { const result = await supabaseAdmin.from("vault_purchasing_wallet").select("available_purchasing_power_gbp").single(); if (result.error) throw result.error; return result.data.available_purchasing_power_gbp; },
  });
}
