import type {
  CatalogueProduct,
} from "@/types/catalogue";

import type {
  SupplierCatalogueCardData,
} from "@/types/supplier-catalogue";

export type BuyingRecommendationUrgency =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "critical";

export type BuyingRecommendationStatus =
  | "not_applicable"
  | "insufficient_data"
  | "healthy"
  | "review"
  | "reorder";

export type BuyingRecommendationResult = {
  productId: string;
  productName: string;

  status: BuyingRecommendationStatus;
  urgency: BuyingRecommendationUrgency;

  headline: string;
  reason: string;

  currentStock: number;

  averageDailySales: number | null;
  estimatedDaysRemaining: number | null;

  supplierLeadTimeDays: number | null;
  targetStockDays: number | null;
  safetyStock: number | null;
  reorderPoint: number | null;

  unitsPerPack: number | null;
  supplierMoqPacks: number | null;

  suggestedPacks: number | null;
  suggestedUnits: number | null;
  projectedStockAfterOrder: number | null;

  estimatedOrderCost: number | null;
  estimatedGrossProfit: number | null;

  currency: string;

  confidence: number;

  trusted: boolean;
  missingData: string[];
};

type BuildRecommendationInput = {
  product: CatalogueProduct;
  supplierCard?: SupplierCatalogueCardData | null;
};

const EMPTY_SALES_INTELLIGENCE = {
  average_daily_sales: null,
  average_weekly_sales: null,
  average_monthly_sales: null,
  last_sale_date: null,
  days_since_last_sale: null,
  sales_velocity: "unknown" as const,
  reorder_point: null,
  safety_stock: null,
};

function getSalesIntelligence(
  product: CatalogueProduct,
) {
  return (
    product.sales_intelligence ??
    EMPTY_SALES_INTELLIGENCE
  );
}

function roundTo(
  value: number,
  decimalPlaces = 2,
): number {
  const multiplier =
    10 ** decimalPlaces;

  return (
    Math.round(
      value * multiplier,
    ) / multiplier
  );
}

function getAverageDailySales(
  product: CatalogueProduct,
): number | null {
  const intelligence =
    getSalesIntelligence(
      product,
    );

  if (
    intelligence.average_daily_sales !==
      null &&
    intelligence.average_daily_sales >
      0
  ) {
    return intelligence.average_daily_sales;
  }

  if (
    intelligence.average_weekly_sales !==
      null &&
    intelligence.average_weekly_sales >
      0
  ) {
    return (
      intelligence.average_weekly_sales /
      7
    );
  }

  if (
    intelligence.average_monthly_sales !==
      null &&
    intelligence.average_monthly_sales >
      0
  ) {
    return (
      intelligence.average_monthly_sales /
      30
    );
  }

  return null;
}

function getUnitsPerPack({
  product,
  supplierCard,
}: BuildRecommendationInput): number | null {
  if (
    supplierCard?.packSize !== null &&
    supplierCard?.packSize !== undefined &&
    supplierCard.packSize > 0
  ) {
    return supplierCard.packSize;
  }

  const unitsPerPack =
    product.commercial_cost?.units_per_pack ??
    null;

  if (
    unitsPerPack !== null &&
    unitsPerPack > 0
  ) {
    return unitsPerPack;
  }

  return null;
}

function getPackCost({
  product,
  supplierCard,
}: BuildRecommendationInput): number | null {
  if (
    supplierCard?.packCost !== null &&
    supplierCard?.packCost !== undefined &&
    supplierCard.packCost >= 0
  ) {
    return supplierCard.packCost;
  }

  return (
    product.commercial_cost?.pack_cost ??
    null
  );
}

function getCurrency({
  product,
  supplierCard,
}: BuildRecommendationInput): string {
  return (
    supplierCard?.currency ||
    product.commercial_cost?.currency ||
    "GBP"
  );
}

function calculateConfidence({
  averageDailySales,
  supplierLeadTimeDays,
  unitsPerPack,
  packCost,
  product,
}: {
  averageDailySales: number | null;
  supplierLeadTimeDays: number | null;
  unitsPerPack: number | null;
  packCost: number | null;
  product: CatalogueProduct;
}): number {
  let score = 0;

  if (averageDailySales !== null) {
    score += 25;
  }

  if (supplierLeadTimeDays !== null) {
    score += 20;
  }

  if (unitsPerPack !== null) {
    score += 20;
  }

  if (packCost !== null) {
    score += 15;
  }

  if (
    product.commercial_cost
      ?.commercial_cost_trusted
  ) {
    score += 10;
  }

  if (
    product.trusted_for_reorder &&
    product.configuration_trusted
  ) {
    score += 10;
  }

  return Math.min(
    100,
    Math.max(
      0,
      score,
    ),
  );
}

export const BuyingRecommendationEngine = {
  buildRecommendation({
    product,
    supplierCard = null,
  }: BuildRecommendationInput): BuyingRecommendationResult {
    const averageDailySales =
      getAverageDailySales(product);

    const currentStock =
      product.stock_on_hand ?? 0;

    const supplierLeadTimeDays =
      supplierCard?.leadTimeDays ??
      null;

    const targetStockDays =
      product.target_stock_days;

    const salesIntelligence =
      getSalesIntelligence(
        product,
      );

    const safetyStock =
      salesIntelligence.safety_stock;

    const reorderPoint =
      salesIntelligence.reorder_point;

    const unitsPerPack =
      getUnitsPerPack({
        product,
        supplierCard,
      });

    const packCost =
      getPackCost({
        product,
        supplierCard,
      });

    const currency =
      getCurrency({
        product,
        supplierCard,
      });

    const confidence =
      calculateConfidence({
        averageDailySales,
        supplierLeadTimeDays,
        unitsPerPack,
        packCost,
        product,
      });

    const missingData: string[] = [];

    if (averageDailySales === null) {
      missingData.push(
        "Average sales rate",
      );
    }

    if (supplierLeadTimeDays === null) {
      missingData.push(
        "Supplier lead time",
      );
    }

    if (targetStockDays === null) {
      missingData.push(
        "Target stock days",
      );
    }

    if (unitsPerPack === null) {
      missingData.push(
        "Units per pack",
      );
    }

    const trusted =
      product.trusted_for_reorder &&
      product.configuration_trusted &&
      (
        product.commercial_cost
          ?.commercial_cost_trusted ??
        false
      );

    const baseResult = {
      productId:
        product.style_id,

      productName:
        product.product_name,

      currentStock,

      averageDailySales:
        averageDailySales !== null
          ? roundTo(
              averageDailySales,
              3,
            )
          : null,

      estimatedDaysRemaining:
        averageDailySales !== null
          ? roundTo(
              currentStock /
                averageDailySales,
              1,
            )
          : null,

      supplierLeadTimeDays,
      targetStockDays,
      safetyStock,
      reorderPoint,
      unitsPerPack,

      supplierMoqPacks:
        product.supplier_moq_packs,

      currency,
      confidence,
      trusted,
      missingData,
    };

    if (
      !product.restock_enabled ||
      product.inventory_strategy ===
        "do_not_restock" ||
      product.inventory_strategy ===
        "discontinued" ||
      product.inventory_strategy ===
        "service"
    ) {
      return {
        ...baseResult,

        status:
          "not_applicable",

        urgency:
          "none",

        headline:
          "Do not reorder",

        reason:
          "This product is not currently enabled for replenishment.",

        suggestedPacks:
          null,

        suggestedUnits:
          null,

        projectedStockAfterOrder:
          null,

        estimatedOrderCost:
          null,

        estimatedGrossProfit:
          null,
      };
    }

    if (
      averageDailySales === null ||
      targetStockDays === null ||
      unitsPerPack === null
    ) {
      return {
        ...baseResult,

        status:
          "insufficient_data",

        urgency:
          currentStock === 0
            ? "critical"
            : currentStock < 5
              ? "high"
              : "low",

        headline:
          currentStock === 0
            ? "Out of stock"
            : currentStock < 5
              ? "Low stock"
              : "Recommendation limited",

        reason:
          "Vault Brain needs more sales or pack data before it can calculate an exact order quantity.",

        suggestedPacks:
          null,

        suggestedUnits:
          null,

        projectedStockAfterOrder:
          null,

        estimatedOrderCost:
          null,

        estimatedGrossProfit:
          null,
      };
    }

    const effectiveSafetyStock =
      safetyStock ??
      Math.ceil(
        averageDailySales *
          Math.max(
            2,
            supplierLeadTimeDays ??
              0,
          ),
      );

    const desiredStock =
      Math.ceil(
        averageDailySales *
          targetStockDays +
          effectiveSafetyStock,
      );

    const unitsRequired =
      Math.max(
        0,
        desiredStock -
          currentStock,
      );

    const calculatedPacks =
      Math.ceil(
        unitsRequired /
          unitsPerPack,
      );

    const minimumPacks =
      product.supplier_moq_packs ??
      1;

    const suggestedPacks =
      calculatedPacks > 0
        ? Math.max(
            calculatedPacks,
            minimumPacks,
          )
        : 0;

    const suggestedUnits =
      suggestedPacks *
      unitsPerPack;

    const projectedStockAfterOrder =
      currentStock +
      suggestedUnits;

    const estimatedOrderCost =
      packCost !== null
        ? roundTo(
            packCost *
              suggestedPacks,
          )
        : null;

    const grossProfitPerUnit =
      product.commercial_cost
        ?.estimated_gross_profit_per_unit ??
      null;

    const estimatedGrossProfit =
      grossProfitPerUnit !== null
        ? roundTo(
            grossProfitPerUnit *
              suggestedUnits,
          )
        : null;

    const leadTimeDemand =
      averageDailySales *
      (supplierLeadTimeDays ??
        0);

    const reorderThreshold =
      reorderPoint ??
      Math.ceil(
        leadTimeDemand +
          effectiveSafetyStock,
      );

    const isOutOfStock =
      currentStock === 0;

    const isBelowReorderPoint =
      currentStock <=
      reorderThreshold;

    const isLikelyToStockOutBeforeDelivery =
      supplierLeadTimeDays !== null &&
      baseResult.estimatedDaysRemaining !==
        null &&
      baseResult.estimatedDaysRemaining <=
        supplierLeadTimeDays;

    if (
      suggestedPacks > 0 &&
      (
        isOutOfStock ||
        isBelowReorderPoint ||
        isLikelyToStockOutBeforeDelivery
      )
    ) {
      return {
        ...baseResult,

        status:
          "reorder",

        urgency:
          isOutOfStock
            ? "critical"
            : isLikelyToStockOutBeforeDelivery
              ? "high"
              : "medium",

        headline:
          `Order ${suggestedPacks} ${
            suggestedPacks === 1
              ? "pack"
              : "packs"
          }`,

        reason:
          isOutOfStock
            ? "This product is out of stock and replenishment is enabled."
            : isLikelyToStockOutBeforeDelivery
              ? "Current stock is likely to run out before the supplier lead time has elapsed."
              : "Current stock is at or below the calculated reorder threshold.",

        suggestedPacks,
        suggestedUnits,
        projectedStockAfterOrder,
        estimatedOrderCost,
        estimatedGrossProfit,
      };
    }

    if (suggestedPacks > 0) {
      return {
        ...baseResult,

        status:
          "review",

        urgency:
          "low",

        headline:
          `Review ${suggestedPacks} ${
            suggestedPacks === 1
              ? "pack"
              : "packs"
          }`,

        reason:
          "Stock is not immediately critical, but the target stock position indicates a replenishment opportunity.",

        suggestedPacks,
        suggestedUnits,
        projectedStockAfterOrder,
        estimatedOrderCost,
        estimatedGrossProfit,
      };
    }

    return {
      ...baseResult,

      status:
        "healthy",

      urgency:
        "none",

      headline:
        "Stock level healthy",

      reason:
        "Current stock is above the calculated reorder threshold and no immediate order is indicated.",

      suggestedPacks:
        0,

      suggestedUnits:
        0,

      projectedStockAfterOrder:
        currentStock,

      estimatedOrderCost:
        0,

      estimatedGrossProfit:
        0,
    };
  },
} as const;
