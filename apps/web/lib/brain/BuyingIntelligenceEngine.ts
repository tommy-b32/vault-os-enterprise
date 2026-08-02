import type {
  BuyingBasketItem,
} from "@/components/suppliers/BuyingBasket";

export type BuyingRecommendation = {
  suggestedPacks: number;

  estimatedCost: number | null;

  estimatedRevenue: number | null;

  estimatedProfit: number | null;

  marginPercent: number | null;

  urgency:
    | "low"
    | "medium"
    | "high";
};

export const BuyingIntelligenceEngine = {
  analyse(
    item: BuyingBasketItem,
  ): BuyingRecommendation {

    return {
      suggestedPacks:
        item.packs,

      estimatedCost:
        item.packCost === null
          ? null
          : item.packCost *
            item.packs,

      estimatedRevenue:
        null,

      estimatedProfit:
        null,

      marginPercent:
        null,

      urgency:
        "medium",
    };

  },
} as const;