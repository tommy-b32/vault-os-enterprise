import type {
  Opportunity,
} from "@/lib/brain/OpportunityEngine";

export type CommercialOpportunityInput = {
  productId: string;

  supplierId: string;

  productName: string;

  supplierName: string;

  marginPercent: number | null;

  returnOnCapital: number | null;

  grossProfitPerUnit: number | null;

  stockRemaining: number;

  recommendedOrderQuantity: number;

  purchaseCost: number;
};

function createCommercialOpportunity(
  input: CommercialOpportunityInput,
): Opportunity | null {
  if (
    input.marginPercent === null ||
    input.returnOnCapital === null ||
    input.grossProfitPerUnit === null
  ) {
    return null;
  }

  if (input.stockRemaining > 10) {
    return null;
  }

  if (
    input.marginPercent < 45 ||
    input.returnOnCapital < 100
  ) {
    return null;
  }

  return {
    id: input.productId,

    title: `Reorder ${input.productName}`,

    description: `${input.stockRemaining} units remaining. Recommended order: ${input.recommendedOrderQuantity}. Supplier: ${input.supplierName}.`,

    priority:
      input.stockRemaining <= 5
        ? "critical"
        : "high",

    estimatedProfit:
      input.grossProfitPerUnit *
      input.recommendedOrderQuantity,

    confidence:
      input.stockRemaining <= 5
        ? 97
        : 90,

    source: "commercial",
  };
}

export const CommercialOpportunityEngine = {
  create: createCommercialOpportunity,
};
