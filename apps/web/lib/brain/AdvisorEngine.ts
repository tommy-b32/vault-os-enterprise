import { OpportunityCollector } from "@/lib/brain/OpportunityCollector";
import type { CommercialOpportunityInput } from "@/lib/brain/CommercialOpportunityEngine";
import type { Opportunity, OpportunityEngineResult } from "@/lib/brain/OpportunityEngine";
import { OpportunityEngine } from "@/lib/brain/OpportunityEngine";
import type {
  TrustedBuyingCandidateRejectionReason,
  TrustedBuyingCandidateResult,
} from "@/lib/brain/TrustedBuyingCandidateClassifier";
import type { CatalogueProduct } from "@/types/catalogue";

export type AdvisorDiagnostics = {
  productsScanned: number;
  stylesEvaluated: number;
  eligible: number;
  ineligible: number;
  blockedByPolicy: number;
  unavailable: number;
  topRejectionReasons: Array<{
    reason: TrustedBuyingCandidateRejectionReason;
    count: number;
  }>;
  supplierMinimumPolicyBlockers: number;
  walletFreshnessPolicyBlockers: number;
  stockedProducts: number;
  restockEnabled: number;
  supplierAssigned: number;
  configurationTrusted: number;
  trustedForReorder: number;
  reorderApprovalMissing: number;
  commercialCostTrusted: number;
  invalidOrMissingCommercialCost: number;
  mappedToSalesHistory: number;
  validSalesVelocity: number;
  validStockInputs: number;
  validCommittedIncomingInputs: number;
  validLeadTime: number;
  validTargetDays: number;
  validPackSize: number;
  validMoq: number;
  trustedReplenishmentInputs: number;
  trustedQuantityProduced: number;
  noReorderNeeded: number;
  insufficientQuantityData: number;
  staleInventory: number;
  supplierMinimumUnknown: number;
  targetStockDaysMissing: number;
  supplierLeadTimeMissing: number;
  supplierMoqMissing: number;
  commercialDataComplete: number;
  commercialDataMissing: number;
  lowStock: number;
  marginThresholdPassed: number;
  returnThresholdPassed: number;
  productsQualifying: number;
};

export type AdvisorExclusionReason = TrustedBuyingCandidateRejectionReason;

export type AdvisorExcludedProduct = {
  productId: string;
  productName: string;
  reasons: AdvisorExclusionReason[];
};

export type AdvisorEngineInput = {
  products: CatalogueProduct[];
  candidates: TrustedBuyingCandidateResult[];
};

export type AdvisorEngineResult = {
  diagnostics: AdvisorDiagnostics;
  candidates: TrustedBuyingCandidateResult[];
  commercialInputs: CommercialOpportunityInput[];
  opportunities: Opportunity[];
  analysis: OpportunityEngineResult;
  excludedProducts: AdvisorExcludedProduct[];
};

function hasReason(
  candidate: TrustedBuyingCandidateResult,
  reason: TrustedBuyingCandidateRejectionReason,
): boolean {
  return candidate.rejectionReasons.includes(reason);
}

function countWithoutReason(
  candidates: TrustedBuyingCandidateResult[],
  reason: TrustedBuyingCandidateRejectionReason,
): number {
  return candidates.filter((candidate) => !hasReason(candidate, reason)).length;
}

function buildCommercialInput(
  candidate: TrustedBuyingCandidateResult,
): CommercialOpportunityInput | null {
  if (
    !candidate.eligible ||
    !candidate.supplierId ||
    candidate.suggestedQuantity === null ||
    candidate.canonicalPackCostGbp === null ||
    candidate.estimatedGrossProfitGbp === null ||
    candidate.stockRemaining === null
  ) return null;

  return {
    productId: candidate.styleId,
    supplierId: candidate.supplierId,
    productName: candidate.productName,
    supplierName: candidate.supplierName ?? "Supplier not named",
    marginPercent: candidate.marginPercent,
    returnOnCapital: candidate.returnOnCapitalPercent,
    grossProfitPerUnit: candidate.grossProfitPerUnitGbp,
    estimatedGrossProfit: candidate.estimatedGrossProfitGbp,
    stockRemaining: candidate.stockRemaining,
    recommendedOrderQuantity: candidate.suggestedQuantity,
    purchaseCost: candidate.canonicalPackCostGbp,
  };
}

function buildDiagnostics(
  products: CatalogueProduct[],
  candidates: TrustedBuyingCandidateResult[],
): AdvisorDiagnostics {
  const reasonCounts = new Map<TrustedBuyingCandidateRejectionReason, number>();
  for (const candidate of candidates) {
    for (const reason of candidate.rejectionReasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }
  const countReason = (reason: TrustedBuyingCandidateRejectionReason) =>
    reasonCounts.get(reason) ?? 0;
  const topRejectionReasons = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, 10);

  return {
    productsScanned: products.length,
    stylesEvaluated: candidates.length,
    eligible: candidates.filter((candidate) => candidate.status === "eligible").length,
    ineligible: candidates.filter((candidate) => candidate.status === "ineligible").length,
    blockedByPolicy: candidates.filter((candidate) => candidate.status === "blocked_by_policy").length,
    unavailable: candidates.filter((candidate) => candidate.status === "unavailable").length,
    topRejectionReasons,
    supplierMinimumPolicyBlockers:
      countReason("supplier_minimum_unknown") + countReason("supplier_minimum_not_evaluated"),
    walletFreshnessPolicyBlockers:
      countReason("wallet_freshness_unknown") + countReason("wallet_stale"),
    stockedProducts: countWithoutReason(candidates, "inventory_strategy_not_stocked"),
    restockEnabled: countWithoutReason(candidates, "restock_disabled"),
    supplierAssigned: countWithoutReason(candidates, "supplier_missing"),
    configurationTrusted: countWithoutReason(candidates, "configuration_untrusted"),
    trustedForReorder: countWithoutReason(candidates, "reorder_approval_missing"),
    reorderApprovalMissing: countReason("reorder_approval_missing"),
    commercialCostTrusted: countWithoutReason(candidates, "commercial_data_missing"),
    invalidOrMissingCommercialCost: countReason("invalid_or_missing_commercial_cost"),
    mappedToSalesHistory: countWithoutReason(candidates, "sales_history_unavailable"),
    validSalesVelocity: countWithoutReason(candidates, "sales_history_unavailable"),
    validStockInputs: countWithoutReason(candidates, "inventory_unavailable"),
    validCommittedIncomingInputs: products.filter((product) =>
      product.replenishment_intelligence.committedStock !== null &&
      product.replenishment_intelligence.incomingStock !== null).length,
    validLeadTime: countWithoutReason(candidates, "supplier_lead_time_missing"),
    validTargetDays: countWithoutReason(candidates, "target_stock_days_missing"),
    validPackSize: countWithoutReason(candidates, "units_per_pack_missing"),
    validMoq: countWithoutReason(candidates, "supplier_moq_missing"),
    trustedReplenishmentInputs: countWithoutReason(candidates, "replenishment_untrusted"),
    trustedQuantityProduced: candidates.filter((candidate) =>
      candidate.calculatedQuantity !== null && candidate.calculatedQuantity > 0).length,
    noReorderNeeded: countReason("quantity_not_positive"),
    insufficientQuantityData: countReason("quantity_unavailable"),
    staleInventory: countReason("inventory_stale"),
    supplierMinimumUnknown: countReason("supplier_minimum_unknown"),
    targetStockDaysMissing: countReason("target_stock_days_missing"),
    supplierLeadTimeMissing: countReason("supplier_lead_time_missing"),
    supplierMoqMissing: countReason("supplier_moq_missing"),
    commercialDataComplete: countWithoutReason(candidates, "profitability_incomplete"),
    commercialDataMissing: countReason("profitability_incomplete"),
    lowStock: countWithoutReason(candidates, "stock_above_threshold"),
    marginThresholdPassed: countWithoutReason(candidates, "margin_below_threshold"),
    returnThresholdPassed: countWithoutReason(candidates, "return_below_threshold"),
    productsQualifying: candidates.filter((candidate) => candidate.eligible).length,
  };
}

export function analyseAdvisor({ products, candidates }: AdvisorEngineInput): AdvisorEngineResult {
  const commercialInputs = candidates
    .filter((candidate) => candidate.status === "eligible")
    .map(buildCommercialInput)
    .filter((input): input is CommercialOpportunityInput => input !== null);
  const opportunities = OpportunityCollector.collect({ commercial: commercialInputs });
  const analysis = OpportunityEngine.analyse({ opportunities });
  const productNames = new Map(products.map((product) => [product.style_id, product.product_name]));
  const excludedProducts = candidates
    .filter((candidate) => !candidate.eligible)
    .map((candidate) => ({
      productId: candidate.styleId,
      productName: candidate.productName || productNames.get(candidate.styleId) || "Unknown product",
      reasons: candidate.rejectionReasons,
    }));

  return {
    diagnostics: buildDiagnostics(products, candidates),
    candidates,
    commercialInputs,
    opportunities,
    analysis,
    excludedProducts,
  };
}

export const AdvisorEngine = { analyse: analyseAdvisor } as const;
