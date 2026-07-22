import type {
  CommercialDecisionInput,
  CommercialDecisionResult,
} from "@/lib/brain/types";

function getMissingInputs(
  input: CommercialDecisionInput,
): string[] {
  const missingInputs: string[] = [];

  if (!input.supplierAssigned) {
    missingInputs.push("supplier");
  }

  if (
    input.unitsPerPack === null ||
    input.unitsPerPack <= 0
  ) {
    missingInputs.push("units per pack");
  }

  if (!input.packCostEntered) {
    missingInputs.push("pack cost");
  }

  if (!input.sellingPriceEntered) {
    missingInputs.push("selling price");
  }

  return missingInputs;
}

function calculateConfidence(
  input: CommercialDecisionInput,
  missingInputs: string[],
): number {
  if (missingInputs.length > 0) {
    return Math.max(
      10,
      100 - missingInputs.length * 20,
    );
  }

  let confidence = 60;

  if (input.productConfigured) {
    confidence += 15;
  }

  if (input.supplierAssigned) {
    confidence += 10;
  }

  if (
    input.unitsPerPack !== null &&
    input.unitsPerPack > 0
  ) {
    confidence += 5;
  }

  if (input.packCostEntered) {
    confidence += 5;
  }

  if (input.sellingPriceEntered) {
    confidence += 5;
  }

  return Math.min(100, confidence);
}

export function reviewCommercialProduct(
  input: CommercialDecisionInput,
): CommercialDecisionResult {
  const missingInputs = getMissingInputs(input);

  const confidence = calculateConfidence(
    input,
    missingInputs,
  );

  if (missingInputs.length > 0) {
    return {
      decision: "waiting",
      label: "Awaiting data",

      headline:
        "Vault Brain needs more commercial data.",

      explanation: `Complete ${missingInputs.join(
        ", ",
      )} before a trusted purchasing decision can be made.`,

      confidence,

      marginPercent: input.marginPercent,
      returnOnCapital: input.returnOnCapital,
      grossProfitPerUnit:
        input.grossProfitPerUnit,

      missingInputs,
    };
  }

  const margin = input.marginPercent ?? 0;

  const returnOnCapital =
    input.returnOnCapital ?? 0;

  if (
    margin >= 60 &&
    returnOnCapital >= 150
  ) {
    return {
      decision: "buy",
      label: "Approved",

      headline:
        "Strong commercial opportunity.",

      explanation:
        "This product has a high gross margin and strong return on invested capital. It is commercially suitable for replenishment, subject to stock demand and available purchasing power.",

      confidence,

      marginPercent: input.marginPercent,
      returnOnCapital: input.returnOnCapital,
      grossProfitPerUnit:
        input.grossProfitPerUnit,

      missingInputs,
    };
  }

  if (
    margin >= 45 &&
    returnOnCapital >= 100
  ) {
    return {
      decision: "hold",
      label: "Review",

      headline:
        "Commercially viable, but not a priority.",

      explanation:
        "The product is profitable, but its return is not strong enough to automatically outrank higher-efficiency products.",

      confidence,

      marginPercent: input.marginPercent,
      returnOnCapital: input.returnOnCapital,
      grossProfitPerUnit:
        input.grossProfitPerUnit,

      missingInputs,
    };
  }

  return {
    decision: "avoid",
    label: "Do not prioritise",

    headline:
      "Weak capital efficiency.",

    explanation:
      "The current selling price and landed cost do not produce a strong enough margin or return on capital. Review supplier cost or retail price before purchasing more stock.",

    confidence,

    marginPercent: input.marginPercent,
    returnOnCapital: input.returnOnCapital,
    grossProfitPerUnit:
      input.grossProfitPerUnit,

    missingInputs,
  };
}

export const CommercialEngine = {
  reviewProduct: reviewCommercialProduct,
};