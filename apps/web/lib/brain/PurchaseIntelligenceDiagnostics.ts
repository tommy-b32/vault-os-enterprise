import type { PurchasingWalletData } from "@/components/commercial/PurchasingWallet";
import type {
  PurchaseIntelligenceSupplier,
  SupplierPurchaseRecommendation,
} from "@/lib/brain/PurchaseIntelligenceEngine";
import type {
  TrustedBuyingCandidateRejectionReason,
} from "@/lib/brain/TrustedBuyingCandidateClassifier";
import { PurchaseIntelligenceTrust } from "@/lib/brain/PurchaseIntelligenceTrust";
import { SupplierMinimumContract } from "@/lib/supplier/SupplierMinimum";
import type { CatalogueProduct } from "@/types/catalogue";

export type DiagnosticState = "trusted" | "not_trusted" | "unavailable";

export type SupplierPurchaseDiagnostic = {
  supplier: { id: string; name: string };
  productsEvaluated: number;
  productsNeedingReplenishment: number;
  productsExcluded: number;
  inventoryTrust: DiagnosticState;
  catalogueTrust: DiagnosticState;
  supplierConfiguration: "configured" | "not_configured";
  minimumOrderValueStatus: string;
  minimumPackStatus: string;
  reorderApproval: "approved" | "not_approved" | "unavailable";
  capitalAvailability: "available" | "unavailable";
  confidence: string;
  classifierRejectionReasons: TrustedBuyingCandidateRejectionReason[];
  hardBlockers: string[];
  operatorWarnings: string[];
  finalRecommendationStatus: "Trusted" | "Trusted with warnings" | "Not Trusted" | "No replenishment needed";
  decisionExplanation: string;
};

type Input = {
  products: CatalogueProduct[];
  suppliers: PurchaseIntelligenceSupplier[];
  recommendations: SupplierPurchaseRecommendation[];
  wallet: PurchasingWalletData | null;
  inventoryTrusted: boolean;
};

function minimumValueStatus(supplier: PurchaseIntelligenceSupplier): string {
  const minimum = SupplierMinimumContract.create({
    value: supplier.minimumOrderValue,
    currency: supplier.currency,
    minimumOrderPacks: supplier.minimumOrderPacks,
  });
  if (minimum.value === null) return "Unknown";
  if (minimum.value === 0) return "No minimum";
  return minimum.currency
    ? `Defined: ${minimum.currency} ${minimum.value.toFixed(2)}`
    : "Currency unavailable";
}

function minimumPackStatus(supplier: PurchaseIntelligenceSupplier): string {
  const minimum = SupplierMinimumContract.create({
    value: supplier.minimumOrderValue,
    currency: supplier.currency,
    minimumOrderPacks: supplier.minimumOrderPacks,
  });
  if (minimum.minimumOrderPacks === null) return "Unknown";
  if (minimum.minimumOrderPacks === 0) return "No minimum";
  return `Defined: ${minimum.minimumOrderPacks} packs`;
}

export function buildPurchaseIntelligenceDiagnostics({
  products,
  suppliers,
  recommendations,
  wallet,
  inventoryTrusted,
}: Input): SupplierPurchaseDiagnostic[] {
  const trustedSupplierIds = new Set(recommendations.map((entry) => entry.supplier.id));

  return suppliers
    .map((supplier) => {
      const supplierProducts = products.filter((product) => product.supplier_id === supplier.id);
      const evaluations = supplierProducts.map((product) => PurchaseIntelligenceTrust.evaluate({
        product,
        supplier,
        walletLastUpdated: wallet?.wallet_last_updated ?? null,
      }));
      const supplierCandidates = evaluations.map((evaluation) => evaluation.candidate);
      const rejectionReasons = Array.from(
        new Set(supplierCandidates.flatMap((candidate) => candidate.rejectionReasons)),
      ).sort();
      const remainingCandidates = evaluations.filter(
        (evaluation) => evaluation.needsReplenishment && !evaluation.excluded,
      );
      const hardBlockers = Array.from(new Set(remainingCandidates.flatMap((evaluation) => evaluation.hardBlockers))).sort();
      const operatorWarnings: string[] = Array.from(new Set<string>(
        remainingCandidates
          .filter((evaluation) => evaluation.hardBlockers.length === 0)
          .flatMap((evaluation) => evaluation.operatorWarnings),
      )).sort();
      if (!wallet?.wallet_last_updated) operatorWarnings.push("wallet_freshness_unavailable");
      const recommendation = recommendations.find((entry) => entry.supplier.id === supplier.id);
      for (const warning of recommendation?.operatorWarnings ?? []) {
        if (!operatorWarnings.includes(warning)) operatorWarnings.push(warning);
      }
      const productsNeedingReplenishment = evaluations.filter(
        (evaluation) => evaluation.needsReplenishment && !evaluation.excluded,
      ).length;
      const productsExcluded = evaluations.filter((evaluation) => evaluation.excluded).length;
      const finalRecommendationStatus = trustedSupplierIds.has(supplier.id)
        ? operatorWarnings.length > 0 ? "Trusted with warnings" : "Trusted"
        : productsNeedingReplenishment === 0 ? "No replenishment needed" : "Not Trusted";
      const confidenceValues = supplierCandidates
        .map((candidate) => candidate.confidence)
        .filter((value): value is number => value !== null);
      const confidence = finalRecommendationStatus === "Trusted"
        ? "Trusted (100%)"
        : finalRecommendationStatus === "Trusted with warnings"
          ? "Reduced by operator warnings"
        : confidenceValues.length > 0
          ? `Not trusted (${Math.min(...confidenceValues)}%)`
          : "Unavailable";
      const approvals = supplierProducts.map(
        (product) => product.reorder_approval?.approval_state === "approved",
      );

      return {
        supplier: { id: supplier.id, name: supplier.name },
        productsEvaluated: supplierProducts.length,
        productsNeedingReplenishment,
        productsExcluded,
        inventoryTrust: supplierProducts.length === 0
          ? "unavailable"
          : inventoryTrusted && supplierProducts.every(
              (product) => product.replenishment_intelligence.trusted,
            )
            ? "trusted"
            : "not_trusted",
        catalogueTrust: supplierProducts.length === 0
          ? "unavailable"
          : supplierProducts.every(
              (product) => product.configuration_trusted && product.trusted_for_reorder,
            )
            ? "trusted"
            : "not_trusted",
        supplierConfiguration:
          supplier.active && supplier.currency === "GBP" ? "configured" : "not_configured",
        minimumOrderValueStatus: minimumValueStatus(supplier),
        minimumPackStatus: minimumPackStatus(supplier),
        reorderApproval: approvals.length === 0
          ? "unavailable"
          : approvals.every(Boolean)
            ? "approved"
            : "not_approved",
        capitalAvailability:
          wallet?.wallet_last_updated ? "available" : "unavailable",
        confidence,
        classifierRejectionReasons: rejectionReasons,
        hardBlockers,
        operatorWarnings: operatorWarnings.sort(),
        finalRecommendationStatus,
        decisionExplanation: finalRecommendationStatus === "Trusted"
          ? "Every canonical supplier-level recommendation gate passed."
          : finalRecommendationStatus === "Trusted with warnings"
            ? "A recommendation is available, with operator review warnings retained."
          : finalRecommendationStatus === "No replenishment needed"
            ? "Evaluated products were excluded because no trusted replenishment quantity is currently required."
          : supplierProducts.length === 0
            ? "No canonical catalogue products are assigned to this supplier."
            : rejectionReasons.length > 0
              ? "One or more classifier trust gates rejected the supplier's products."
              : "The supplier did not pass every supplier-level minimum, capital or recommendation gate.",
      } satisfies SupplierPurchaseDiagnostic;
    })
    .sort((a, b) => a.supplier.name.localeCompare(b.supplier.name));
}

export const PurchaseIntelligenceDiagnostics = {
  build: buildPurchaseIntelligenceDiagnostics,
} as const;
