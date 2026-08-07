import type { PurchasingWalletData } from "@/components/commercial/PurchasingWallet";
import type {
  PurchaseIntelligenceSupplier,
  SupplierPurchaseRecommendation,
} from "@/lib/brain/PurchaseIntelligenceEngine";
import type {
  TrustedBuyingCandidateRejectionReason,
  TrustedBuyingCandidateResult,
} from "@/lib/brain/TrustedBuyingCandidateClassifier";
import { SupplierMinimumContract } from "@/lib/supplier/SupplierMinimum";
import type { CatalogueProduct } from "@/types/catalogue";

export type DiagnosticState = "trusted" | "not_trusted" | "unavailable";

export type SupplierPurchaseDiagnostic = {
  supplier: { id: string; name: string };
  productsEvaluated: number;
  inventoryTrust: DiagnosticState;
  catalogueTrust: DiagnosticState;
  supplierConfiguration: "configured" | "not_configured";
  minimumOrderValueStatus: string;
  minimumPackStatus: string;
  reorderApproval: "approved" | "not_approved" | "unavailable";
  capitalAvailability: "available" | "unavailable";
  confidence: string;
  classifierRejectionReasons: TrustedBuyingCandidateRejectionReason[];
  finalDecision: "Trusted" | "Not Trusted";
  decisionExplanation: string;
};

type Input = {
  products: CatalogueProduct[];
  suppliers: PurchaseIntelligenceSupplier[];
  candidates: TrustedBuyingCandidateResult[];
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
  candidates,
  recommendations,
  wallet,
  inventoryTrusted,
}: Input): SupplierPurchaseDiagnostic[] {
  const trustedSupplierIds = new Set(recommendations.map((entry) => entry.supplier.id));

  return suppliers
    .map((supplier) => {
      const supplierProducts = products.filter((product) => product.supplier_id === supplier.id);
      const supplierCandidates = candidates.filter((candidate) => candidate.supplierId === supplier.id);
      const rejectionReasons = Array.from(
        new Set(supplierCandidates.flatMap((candidate) => candidate.rejectionReasons)),
      ).sort();
      const finalDecision = trustedSupplierIds.has(supplier.id) ? "Trusted" : "Not Trusted";
      const confidenceValues = supplierCandidates
        .map((candidate) => candidate.confidence)
        .filter((value): value is number => value !== null);
      const confidence = finalDecision === "Trusted"
        ? "Trusted (100%)"
        : confidenceValues.length > 0
          ? `Not trusted (${Math.min(...confidenceValues)}%)`
          : "Unavailable";
      const approvals = supplierProducts.map(
        (product) => product.reorder_approval?.approval_state === "approved",
      );

      return {
        supplier: { id: supplier.id, name: supplier.name },
        productsEvaluated: supplierProducts.length,
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
        finalDecision,
        decisionExplanation: finalDecision === "Trusted"
          ? "Every canonical supplier-level recommendation gate passed."
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
