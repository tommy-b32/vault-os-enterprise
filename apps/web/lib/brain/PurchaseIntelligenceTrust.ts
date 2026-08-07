import {
  TrustedBuyingCandidateClassifier,
  type TrustedBuyingCandidateRejectionReason,
  type TrustedBuyingCandidateResult,
} from "@/lib/brain/TrustedBuyingCandidateClassifier";
import type { PurchaseIntelligenceSupplier } from "@/lib/brain/PurchaseIntelligenceEngine";
import type { CatalogueProduct } from "@/types/catalogue";

const EXCLUSION_REASONS = new Set<TrustedBuyingCandidateRejectionReason>([
  "stock_above_threshold",
  "quantity_unavailable",
  "quantity_not_positive",
]);

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
  const exclusionReasons = candidate.rejectionReasons.filter((reason) => EXCLUSION_REASONS.has(reason));
  const operatorWarnings = candidate.rejectionReasons.filter((reason) => OPERATOR_WARNING_REASONS.has(reason));
  const minimumOnlyReplenishmentGap =
    candidate.rejectionReasons.includes("replenishment_untrusted") &&
    product.replenishment_intelligence.missingRequirements.length > 0 &&
    product.replenishment_intelligence.missingRequirements.every(
      (reason) => SUPPLIER_MINIMUM_REPLENISHMENT_GAPS.has(reason),
    );
  const hardBlockers = candidate.rejectionReasons.filter(
    (reason) =>
      !EXCLUSION_REASONS.has(reason) &&
      !OPERATOR_WARNING_REASONS.has(reason) &&
      !RESOLVED_AT_SUPPLIER_LEVEL.has(reason) &&
      !(
        reason === "replenishment_untrusted" &&
        (product.replenishment_intelligence.trusted || minimumOnlyReplenishmentGap)
      ),
  );
  if (minimumOnlyReplenishmentGap && !operatorWarnings.includes("supplier_minimum_not_evaluated")) {
    operatorWarnings.push("supplier_minimum_not_evaluated");
  }

  return {
    candidate,
    needsReplenishment: exclusionReasons.length === 0 && candidate.calculatedQuantity !== null && candidate.calculatedQuantity > 0,
    excluded: exclusionReasons.length > 0,
    exclusionReasons,
    hardBlockers,
    operatorWarnings,
  };
}

export const PurchaseIntelligenceTrust = { evaluate: evaluatePurchaseProductTrust } as const;
