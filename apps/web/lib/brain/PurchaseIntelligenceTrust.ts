import {
  TrustedBuyingCandidateClassifier,
  type TrustedBuyingCandidateRejectionReason,
  type TrustedBuyingCandidateResult,
} from "@/lib/brain/TrustedBuyingCandidateClassifier";
import {
  DemandIntelligenceEngine,
  type DemandIntelligenceResult,
} from "@/lib/brain/DemandIntelligenceEngine";
import type { PurchaseIntelligenceSupplier } from "@/lib/brain/PurchaseIntelligenceEngine";
import type { CatalogueProduct } from "@/types/catalogue";

const OPERATOR_WARNING_REASONS = new Set<TrustedBuyingCandidateRejectionReason>([
  "reorder_approval_missing",
  "quantity_below_minimum_policy_unresolved",
  "supplier_minimum_unknown",
  "supplier_minimum_not_evaluated",
  "supplier_minimum_currency_unavailable",
  "wallet_freshness_policy_missing",
]);

const RESOLVED_AT_SUPPLIER_LEVEL = new Set<TrustedBuyingCandidateRejectionReason>([
  "capital_not_evaluated",
]);

const SUPPLIER_MINIMUM_REPLENISHMENT_GAPS = new Set([
  "supplier_minimum_order_not_evaluated",
  "supplier_minimum_order_unknown",
]);

export type PurchaseProductTrustEvaluation = {
  candidate: TrustedBuyingCandidateResult;
  demand: DemandIntelligenceResult;
  needsReplenishment: boolean;
  excluded: boolean;
  exclusionReasons: TrustedBuyingCandidateRejectionReason[];
  hardBlockers: TrustedBuyingCandidateRejectionReason[];
  operatorWarnings: TrustedBuyingCandidateRejectionReason[];
};

export function evaluatePurchaseProductTrust({
  product,
  supplier,
  walletLastUpdated,
}: {
  product: CatalogueProduct;
  supplier: PurchaseIntelligenceSupplier | null;
  walletLastUpdated: string | null;
}): PurchaseProductTrustEvaluation {
  const candidate = TrustedBuyingCandidateClassifier.classify({
    product,
    supplier,
    wallet: { available: true, lastUpdated: walletLastUpdated },
  });
  const demand = DemandIntelligenceEngine.evaluate(product);
  const exclusionReasons = demand.status === "excluded_by_strategy"
    ? candidate.rejectionReasons.filter(
        (reason) => reason === "inventory_strategy_not_stocked" || reason === "restock_disabled",
      )
    : [];
  const operatorWarnings = candidate.rejectionReasons.filter((reason) => OPERATOR_WARNING_REASONS.has(reason));
  const minimumOnlyReplenishmentGap =
    candidate.rejectionReasons.includes("replenishment_untrusted") &&
    product.replenishment_intelligence.missingRequirements.length > 0 &&
    product.replenishment_intelligence.missingRequirements.every(
      (reason) => SUPPLIER_MINIMUM_REPLENISHMENT_GAPS.has(reason),
    );
  const hardBlockers = demand.status === "evidence_unavailable"
    ? candidate.rejectionReasons.filter(
        (reason) =>
          !OPERATOR_WARNING_REASONS.has(reason) &&
          !RESOLVED_AT_SUPPLIER_LEVEL.has(reason) &&
          reason !== "quantity_not_positive" &&
          reason !== "stock_above_threshold",
      )
    : [];
  if (minimumOnlyReplenishmentGap && !operatorWarnings.includes("supplier_minimum_not_evaluated")) {
    operatorWarnings.push("supplier_minimum_not_evaluated");
  }

  return {
    candidate,
    demand,
    needsReplenishment: demand.status === "needs_replenishment",
    excluded: demand.status === "excluded_by_strategy",
    exclusionReasons,
    hardBlockers,
    operatorWarnings,
  };
}

export const PurchaseIntelligenceTrust = { evaluate: evaluatePurchaseProductTrust } as const;
