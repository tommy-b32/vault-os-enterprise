import { OpportunityCollector } from "@/lib/brain/OpportunityCollector";
import { BuyingRecommendationEngine } from "@/lib/brain/BuyingRecommendationEngine";
import type {
  Opportunity,
  OpportunityEngineResult,
} from "@/lib/brain/OpportunityEngine";
import { OpportunityEngine } from "@/lib/brain/OpportunityEngine";

import type {
  CommercialOpportunityInput,
} from "@/lib/brain/CommercialOpportunityEngine";

import type {
  CatalogueProduct,
} from "@/types/catalogue";

export type AdvisorDiagnostics = {
  productsScanned: number;

  stockedProducts: number;
  restockEnabled: number;
  supplierAssigned: number;

  configurationTrusted: number;
  trustedForReorder: number;
  reorderApprovalMissing: number;
  commercialCostTrusted: number;
  invalidOrMissingCommercialCost: number;

  mappedToSalesHistory: number;
  validSalesVelocity: number;
  validStockInputs: number;
  validCommittedIncomingInputs: number;
  validLeadTime: number;
  validTargetDays: number;
  validPackSize: number;
  validMoq: number;
  trustedReplenishmentInputs: number;
  trustedQuantityProduced: number;
  noReorderNeeded: number;
  insufficientQuantityData: number;
  staleInventory: number;
  supplierMinimumUnknown: number;
  targetStockDaysMissing: number;
  supplierLeadTimeMissing: number;
  supplierMoqMissing: number;

  commercialDataComplete: number;
  commercialDataMissing: number;

  lowStock: number;
  marginThresholdPassed: number;
  returnThresholdPassed: number;

  productsQualifying: number;
};

export type AdvisorExclusionReason =
  | "not_stocked"
  | "restock_disabled"
  | "supplier_missing"
  | "configuration_untrusted"
  | "reorder_approval_missing"
  | "reorder_untrusted"
  | "commercial_cost_untrusted"
  | "invalid_or_missing_commercial_cost"
  | "commercial_data_missing"
  | "replenishment_intelligence_untrusted"
  | "trusted_quantity_unavailable"
  | "stock_above_threshold"
  | "margin_below_threshold"
  | "return_below_threshold";

export type AdvisorExcludedProduct = {
  productId: string;
  productName: string;
  reasons: AdvisorExclusionReason[];
};

export type AdvisorEngineInput = {
  products: CatalogueProduct[];
};

export type AdvisorEngineResult = {
  diagnostics: AdvisorDiagnostics;

  commercialInputs: CommercialOpportunityInput[];

  opportunities: Opportunity[];
  analysis: OpportunityEngineResult;

  excludedProducts: AdvisorExcludedProduct[];
};

const LOW_STOCK_THRESHOLD = 10;
const MINIMUM_MARGIN_PERCENT = 45;
const MINIMUM_RETURN_ON_CAPITAL_PERCENT = 100;

function hasCommercialData(
  product: CatalogueProduct,
): boolean {
  const commercial =
    product.commercial_cost;

  return (
    commercial.estimated_margin_percent !== null &&
    commercial
      .estimated_return_on_pack_capital_percent !==
      null &&
    commercial.estimated_gross_profit_per_unit !== null
  );
}

function hasValidCanonicalCost(product: CatalogueProduct): boolean {
  const cost = product.commercial_cost.landed_cost_per_pack_gbp;

  return cost !== null && Number.isFinite(cost) && cost > 0;
}

function getExclusionReasons(
  product: CatalogueProduct,
): AdvisorExclusionReason[] {
  const commercial =
    product.commercial_cost;

  const reasons: AdvisorExclusionReason[] = [];

  if (product.inventory_strategy !== "stocked") {
    reasons.push("not_stocked");
  }

  if (!product.restock_enabled) {
    reasons.push("restock_disabled");
  }

  if (!product.supplier_id) {
    reasons.push("supplier_missing");
  }

  if (!product.configuration_trusted) {
    reasons.push("configuration_untrusted");
  }

  if (
    product.reorder_approval?.approval_state !==
    "approved"
  ) {
    reasons.push("reorder_approval_missing");
  } else if (!product.trusted_for_reorder) {
    reasons.push("reorder_untrusted");
  }

  if (!commercial.commercial_cost_trusted) {
    reasons.push("commercial_cost_untrusted");
  }

  if (!hasValidCanonicalCost(product)) {
    reasons.push("invalid_or_missing_commercial_cost");
  }

  if (!hasCommercialData(product)) {
    reasons.push("commercial_data_missing");

    return reasons;
  }

  const buying = BuyingRecommendationEngine.buildRecommendation({ product });

  if (!product.replenishment_intelligence.trusted) {
    reasons.push("replenishment_intelligence_untrusted");
  }

  if (
    !buying.trusted ||
    buying.suggestedPacks === null ||
    buying.suggestedPacks <= 0
  ) {
    reasons.push("trusted_quantity_unavailable");
  }

  if (
    product.stock_on_hand >
    LOW_STOCK_THRESHOLD
  ) {
    reasons.push("stock_above_threshold");
  }

  if (
    commercial.estimated_margin_percent !== null &&
    commercial.estimated_margin_percent <
      MINIMUM_MARGIN_PERCENT
  ) {
    reasons.push("margin_below_threshold");
  }

  if (
    commercial
      .estimated_return_on_pack_capital_percent !==
      null &&
    commercial
      .estimated_return_on_pack_capital_percent <
      MINIMUM_RETURN_ON_CAPITAL_PERCENT
  ) {
    reasons.push("return_below_threshold");
  }

  return reasons;
}

function buildCommercialInput(
  product: CatalogueProduct,
): CommercialOpportunityInput | null {
  const commercial =
    product.commercial_cost;
  const purchaseCost = commercial.landed_cost_per_pack_gbp;
  const buying = BuyingRecommendationEngine.buildRecommendation({ product });

  if (
    !hasValidCanonicalCost(product) ||
    purchaseCost === null ||
    !buying.trusted ||
    buying.suggestedPacks === null ||
    buying.suggestedPacks <= 0
  ) {
    return null;
  }

  const recommendedOrderQuantity = buying.suggestedPacks;

  return {
    productId: product.style_id,

    productName:
      product.product_name,

    supplierName:
      product.supplier_company ??
      "Supplier not named",

    marginPercent:
      commercial.estimated_margin_percent,

    returnOnCapital:
      commercial
        .estimated_return_on_pack_capital_percent,

    grossProfitPerUnit:
      commercial
        .estimated_gross_profit_per_unit,

    stockRemaining:
      product.stock_on_hand,

    recommendedOrderQuantity,

    purchaseCost,
  };
}

function buildDiagnostics(
  products: CatalogueProduct[],
  qualifyingProducts: CatalogueProduct[],
): AdvisorDiagnostics {
  const commercialDataComplete =
    products.filter(hasCommercialData).length;
  const buyingResults = products.map((product) =>
    BuyingRecommendationEngine.buildRecommendation({ product }),
  );

  return {
    productsScanned:
      products.length,

    stockedProducts:
      products.filter(
        (product) =>
          product.inventory_strategy ===
          "stocked",
      ).length,

    restockEnabled:
      products.filter(
        (product) =>
          product.restock_enabled,
      ).length,

    supplierAssigned:
      products.filter(
        (product) =>
          Boolean(product.supplier_id),
      ).length,

    configurationTrusted:
      products.filter(
        (product) =>
          product.configuration_trusted,
      ).length,

    trustedForReorder:
      products.filter(
        (product) =>
          product.trusted_for_reorder,
      ).length,

    reorderApprovalMissing:
      products.filter(
        (product) =>
          product.reorder_approval?.approval_state !==
          "approved",
      ).length,

    commercialCostTrusted:
      products.filter(
        (product) =>
          product.commercial_cost
            .commercial_cost_trusted,
      ).length,

    invalidOrMissingCommercialCost:
      products.filter(
        (product) => !hasValidCanonicalCost(product),
      ).length,

    mappedToSalesHistory: products.filter(
      (product) =>
        !product.replenishment_intelligence.missingRequirements.includes(
          "variant_mapping_missing",
        ),
    ).length,
    validSalesVelocity: products.filter(
      (product) =>
        product.replenishment_intelligence.averageDailySales !== null,
    ).length,
    validStockInputs: products.filter(
      (product) => product.replenishment_intelligence.stockOnHand !== null,
    ).length,
    validCommittedIncomingInputs: products.filter(
      (product) =>
        product.replenishment_intelligence.committedStock !== null &&
        product.replenishment_intelligence.incomingStock !== null,
    ).length,
    validLeadTime: products.filter(
      (product) =>
        (product.replenishment_intelligence.supplierLeadTimeDays ?? 0) > 0,
    ).length,
    validTargetDays: products.filter(
      (product) =>
        (product.replenishment_intelligence.targetStockDays ?? 0) > 0,
    ).length,
    validPackSize: products.filter(
      (product) =>
        (product.replenishment_intelligence.unitsPerPack ?? 0) > 0,
    ).length,
    validMoq: products.filter(
      (product) =>
        product.replenishment_intelligence.supplierMoqPacks !== null &&
        product.replenishment_intelligence.supplierMoqPacks >= 0,
    ).length,
    trustedReplenishmentInputs: products.filter(
      (product) => product.replenishment_intelligence.trusted,
    ).length,
    trustedQuantityProduced: buyingResults.filter(
      (result) =>
        result.trusted &&
        result.suggestedPacks !== null &&
        result.suggestedPacks > 0,
    ).length,
    noReorderNeeded: buyingResults.filter(
      (result) => result.status === "healthy",
    ).length,
    insufficientQuantityData: buyingResults.filter(
      (result) => result.status === "insufficient_data",
    ).length,
    staleInventory: products.filter((product) =>
      product.replenishment_intelligence.missingRequirements.includes(
        "inventory_stale",
      ),
    ).length,
    supplierMinimumUnknown: products.filter((product) =>
      product.replenishment_intelligence.missingRequirements.includes(
        "supplier_minimum_order_unknown",
      ),
    ).length,
    targetStockDaysMissing: products.filter((product) =>
      product.replenishment_intelligence.missingRequirements.includes(
        "target_stock_days_missing",
      ),
    ).length,
    supplierLeadTimeMissing: products.filter((product) =>
      product.replenishment_intelligence.missingRequirements.includes(
        "supplier_lead_time_missing",
      ),
    ).length,
    supplierMoqMissing: products.filter((product) =>
      product.replenishment_intelligence.missingRequirements.includes(
        "supplier_moq_missing",
      ),
    ).length,

    commercialDataComplete,

    commercialDataMissing:
      products.length -
      commercialDataComplete,

    lowStock:
      products.filter(
        (product) =>
          product.stock_on_hand <=
          LOW_STOCK_THRESHOLD,
      ).length,

    marginThresholdPassed:
      products.filter((product) => {
        const margin =
          product.commercial_cost
            .estimated_margin_percent;

        return (
          margin !== null &&
          margin >=
            MINIMUM_MARGIN_PERCENT
        );
      }).length,

    returnThresholdPassed:
      products.filter((product) => {
        const returnOnCapital =
          product.commercial_cost
            .estimated_return_on_pack_capital_percent;

        return (
          returnOnCapital !== null &&
          returnOnCapital >=
            MINIMUM_RETURN_ON_CAPITAL_PERCENT
        );
      }).length,

    productsQualifying:
      qualifyingProducts.length,
  };
}

export function analyseAdvisor({
  products,
}: AdvisorEngineInput): AdvisorEngineResult {
  const excludedProducts =
    products
      .map((product) => ({
        productId:
          product.style_id,

        productName:
          product.product_name,

        reasons:
          getExclusionReasons(product),
      }))
      .filter(
        (product) =>
          product.reasons.length > 0,
      );

  const qualifyingProducts =
    products.filter(
      (product) =>
        getExclusionReasons(product)
          .length === 0,
    );

  const commercialInputs =
    qualifyingProducts
      .map(buildCommercialInput)
      .filter(
        (input): input is CommercialOpportunityInput =>
          input !== null,
      );

  const opportunities =
    OpportunityCollector.collect({
      commercial:
        commercialInputs,
    });

  const analysis =
    OpportunityEngine.analyse({
      opportunities,
    });

  const diagnostics =
    buildDiagnostics(
      products,
      qualifyingProducts,
    );

  return {
    diagnostics,
    commercialInputs,
    opportunities,
    analysis,
    excludedProducts,
  };
}

export const AdvisorEngine = {
  analyse: analyseAdvisor,
} as const;
