import type {
  PurchaseIntelligenceEvaluation,
  PurchaseIntelligenceSupplier,
  PurchasingQualificationState,
} from "@/lib/brain/PurchaseIntelligenceEngine";
import type { DemandIntelligenceResult } from "@/lib/brain/DemandIntelligenceEngine";

export type SupplierPurchaseDiagnostic = {
  supplier: { id: string; name: string };
  evaluated: number;
  needsReplenishment: number;
  genuineNoReorder: number;
  evidenceUnavailable: number;
  excludedByStrategy: number;
  purchasingEligible: number;
  purchasingBlocked: number;
  demandItems: DemandIntelligenceResult[];
  demandMissingRequirements: string[];
  purchasingState: PurchasingQualificationState | "not_applicable";
  purchasingBlockers: string[];
  finalRecommendationStatus:
    | "Trusted recommendation available"
    | "No replenishment genuinely required"
    | "Recommendation blocked"
    | "Evidence unavailable"
    | "Trusted with warnings";
};

export function buildPurchaseIntelligenceDiagnostics({
  suppliers,
  evaluation,
}: {
  suppliers: PurchaseIntelligenceSupplier[];
  evaluation: PurchaseIntelligenceEvaluation;
}): SupplierPurchaseDiagnostic[] {
  return suppliers.map((supplier) => {
    const demands = evaluation.demands.filter((demand) => demand.supplierId === supplier.id);
    const qualification = evaluation.qualifications.find((entry) => entry.supplier.id === supplier.id);
    const needsReplenishment = demands.filter((demand) => demand.status === "needs_replenishment").length;
    const genuineNoReorder = demands.filter((demand) => demand.status === "no_replenishment_required").length;
    const evidenceUnavailable = demands.filter((demand) => demand.status === "evidence_unavailable").length;
    const excludedByStrategy = demands.filter((demand) => demand.status === "excluded_by_strategy").length;
    const purchasingEligible = qualification?.state === "ready_to_purchase"
      ? qualification.demandProducts.length
      : 0;
    const purchasingBlocked = qualification && qualification.state !== "ready_to_purchase"
      ? qualification.demandProducts.length
      : 0;
    const finalRecommendationStatus = qualification?.state === "ready_to_purchase"
      ? "Trusted recommendation available"
      : evidenceUnavailable > 0
        ? "Evidence unavailable"
        : needsReplenishment > 0
          ? "Recommendation blocked"
          : "No replenishment genuinely required";

    return {
      supplier: { id: supplier.id, name: supplier.name },
      evaluated: demands.length,
      needsReplenishment,
      genuineNoReorder,
      evidenceUnavailable,
      excludedByStrategy,
      purchasingEligible,
      purchasingBlocked,
      demandItems: demands.filter((demand) => demand.status === "needs_replenishment"),
      demandMissingRequirements: Array.from(new Set(
        demands.flatMap((demand) => demand.missingRequirements),
      )).sort(),
      purchasingState: qualification?.state ?? "not_applicable",
      purchasingBlockers: qualification?.blockers ?? [],
      finalRecommendationStatus,
    } satisfies SupplierPurchaseDiagnostic;
  }).sort((a, b) => a.supplier.name.localeCompare(b.supplier.name));
}

export const PurchaseIntelligenceDiagnostics = { build: buildPurchaseIntelligenceDiagnostics } as const;
