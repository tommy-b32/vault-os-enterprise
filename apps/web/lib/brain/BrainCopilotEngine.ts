import type {
  BrainCopilotRecommendation,
} from "@/types/brain-copilot";

export type BrainCopilotInput = {
  productId: string;

  productName: string;

  supplierId: string | null;

  supplierName: string | null;

  suggestedPacks: number | null;

  estimatedCost: number | null;

  estimatedRevenue: number | null;

  estimatedProfit: number | null;

  currency: string;

  confidence: number;

  urgency:
    | "low"
    | "medium"
    | "high"
    | "critical";

  reasons: string[];
};

function clampConfidence(
  value: number,
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(value),
    ),
  );
}

function buildPriority(
  urgency:
    BrainCopilotInput["urgency"],
): BrainCopilotRecommendation["priority"] {
  return urgency;
}

function buildTitle(
  input: BrainCopilotInput,
): string {
  if (
    input.suggestedPacks !== null &&
    input.suggestedPacks > 0 &&
    input.estimatedCost !== null
  ) {
    return `Order ${input.suggestedPacks} ${
      input.suggestedPacks === 1
        ? "pack"
        : "packs"
    } of ${input.productName}`;
  }

  return `Review ${input.productName}`;
}

function buildMessage(
  input: BrainCopilotInput,
): string {
  const hasPricing =
    input.estimatedCost !== null &&
    input.estimatedRevenue !== null &&
    input.estimatedProfit !== null;

  const hasSuggestedOrder =
    input.suggestedPacks !== null &&
    input.suggestedPacks > 0;

  if (
    hasPricing &&
    hasSuggestedOrder &&
    input.supplierName
  ) {
    return `Vault Brain recommends purchasing from ${input.supplierName} based on the current buying and supplier intelligence.`;
  }

  if (!hasPricing) {
    return "Supplier pricing or sales data is incomplete. Review this product before placing the next order.";
  }

  if (!hasSuggestedOrder) {
    return "Vault Brain does not yet have enough stock or sales data to calculate a reliable order quantity.";
  }

  return "Vault Brain recommends reviewing this product before placing the next supplier order.";
}

export const BrainCopilotEngine = {
  createRecommendation(
    input: BrainCopilotInput,
  ): BrainCopilotRecommendation {
    return {
      id:
        `${input.productId}:${Date.now()}`,

      title:
        buildTitle(input),

      message:
        buildMessage(input),

      priority:
        buildPriority(
          input.urgency,
        ),

      confidence:
        clampConfidence(
          input.confidence,
        ),

      productId:
        input.productId,

      productName:
        input.productName,

      supplierId:
        input.supplierId,

      supplierName:
        input.supplierName,

      suggestedPacks:
        input.suggestedPacks,

      estimatedCost:
        input.estimatedCost,

      estimatedRevenue:
        input.estimatedRevenue,

      estimatedProfit:
        input.estimatedProfit,

      currency:
        input.currency,

      primaryAction:
        input.suggestedPacks !== null &&
        input.suggestedPacks > 0 &&
        input.estimatedCost !== null
          ? "add_to_basket"
          : "review_product",

      secondaryAction:
        input.supplierName
          ? "generate_whatsapp"
          : null,

      reasons:
        input.reasons,

      createdAt:
        new Date().toISOString(),
    };
  },
} as const;