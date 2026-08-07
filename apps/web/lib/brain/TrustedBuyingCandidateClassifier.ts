import { DemandIntelligenceEngine } from "@/lib/brain/DemandIntelligenceEngine";
import {
  SupplierMinimumContract,
  type SupplierMinimum,
} from "@/lib/supplier/SupplierMinimum";
import type { CatalogueProduct } from "@/types/catalogue";

export const TRUSTED_BUYING_MARGIN_PERCENT = 45;
export const TRUSTED_BUYING_RETURN_PERCENT = 100;
export const TRUSTED_BUYING_LOW_STOCK_THRESHOLD = 10;

export type TrustedBuyingCandidateStatus =
  | "eligible"
  | "ineligible"
  | "blocked_by_policy"
  | "unavailable";

export type TrustedBuyingCandidateRejectionReason =
  | "canonical_product_missing"
  | "configuration_untrusted"
  | "inventory_strategy_not_stocked"
  | "restock_disabled"
  | "reorder_approval_missing"
  | "supplier_missing"
  | "supplier_inactive"
  | "supplier_currency_missing"
  | "commercial_data_missing"
  | "invalid_or_missing_commercial_cost"
  | "profitability_incomplete"
  | "margin_below_threshold"
  | "return_below_threshold"
  | "stock_above_threshold"
  | "inventory_unavailable"
  | "inventory_stale"
  | "sales_history_unavailable"
  | "supplier_lead_time_missing"
  | "target_stock_days_missing"
  | "units_per_pack_missing"
  | "supplier_moq_missing"
  | "replenishment_untrusted"
  | "quantity_unavailable"
  | "quantity_not_positive"
  | "quantity_below_minimum_policy_unresolved"
  | "supplier_minimum_unknown"
  | "supplier_minimum_not_evaluated"
  | "supplier_minimum_currency_unavailable"
  | "wallet_unavailable"
  | "wallet_freshness_policy_missing"
  | "capital_not_evaluated"
  | "insufficient_reserve_safe_capacity"
  | "protected_reserve_breach";

export type TrustedBuyingSupplier = {
  id: string;
  name: string;
  active: boolean;
  currency: string | null;
  minimumOrderValue: number | null;
  minimumOrderPacks?: number | null;
};

export type TrustedBuyingWallet = {
  available: boolean;
  lastUpdated: string | null;
};

export type TrustedBuyingCandidateResult = {
  styleId: string;
  parentProductId: string;
  productName: string;
  supplierId: string | null;
  supplierName: string | null;
  status: TrustedBuyingCandidateStatus;
  eligible: boolean;
  rejectionReasons: TrustedBuyingCandidateRejectionReason[];
  calculatedQuantity: number | null;
  minimumRequiredQuantity: number | null;
  suggestedQuantity: number | null;
  suggestedUnits: number | null;
  unitsPerPack: number | null;
  stockRemaining: number | null;
  canonicalPackCostGbp: number | null;
  canonicalUnitCostGbp: number | null;
  estimatedOrderCostGbp: number | null;
  estimatedGrossProfitGbp: number | null;
  grossProfitPerUnitGbp: number | null;
  marginPercent: number | null;
  returnOnCapitalPercent: number | null;
  supplierMinimum: SupplierMinimum & {
    evaluation:
      | "not_evaluated"
      | "satisfied"
      | "not_satisfied"
      | "currency_unavailable";
  };
  capitalEvaluation: {
    status:
      | "not_evaluated"
      | "available"
      | "unavailable"
      | "approved"
      | "limited"
      | "rejected";
    reserveProtected: boolean | null;
    remainingPurchasingPowerGbp: number | null;
    walletLastUpdated: string | null;
  };
  confidence: number | null;
  evidence: string[];
};

type ClassifierInput = {
  product: CatalogueProduct | null;
  supplier: TrustedBuyingSupplier | null;
  wallet: TrustedBuyingWallet | null;
  walletFreshnessPolicyDefined?: boolean;
};

const POLICY_REASONS = new Set<TrustedBuyingCandidateRejectionReason>([
  "quantity_below_minimum_policy_unresolved",
  "supplier_minimum_unknown",
  "supplier_minimum_not_evaluated",
  "supplier_minimum_currency_unavailable",
  "wallet_freshness_policy_missing",
  "capital_not_evaluated",
]);

const UNAVAILABLE_REASONS = new Set<TrustedBuyingCandidateRejectionReason>([
  "canonical_product_missing",
  "inventory_unavailable",
  "wallet_unavailable",
]);

function add(
  reasons: TrustedBuyingCandidateRejectionReason[],
  reason: TrustedBuyingCandidateRejectionReason,
): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function statusFor(
  reasons: TrustedBuyingCandidateRejectionReason[],
): TrustedBuyingCandidateStatus {
  if (reasons.some((reason) => UNAVAILABLE_REASONS.has(reason))) {
    return "unavailable";
  }
  if (reasons.some((reason) => !POLICY_REASONS.has(reason))) {
    return "ineligible";
  }
  return reasons.length > 0 ? "blocked_by_policy" : "eligible";
}

export function classifyTrustedBuyingCandidate({
  product,
  supplier,
  wallet,
  walletFreshnessPolicyDefined = false,
}: ClassifierInput): TrustedBuyingCandidateResult {
  const reasons: TrustedBuyingCandidateRejectionReason[] = [];
  const emptyMinimum = SupplierMinimumContract.create({
    value: null,
    currency: null,
  });

  if (!product) {
    return {
      styleId: "",
      parentProductId: "",
      productName: "",
      supplierId: null,
      supplierName: null,
      status: "unavailable",
      eligible: false,
      rejectionReasons: ["canonical_product_missing"],
      calculatedQuantity: null,
      minimumRequiredQuantity: null,
      suggestedQuantity: null,
      suggestedUnits: null,
      unitsPerPack: null,
      stockRemaining: null,
      canonicalPackCostGbp: null,
      canonicalUnitCostGbp: null,
      estimatedOrderCostGbp: null,
      estimatedGrossProfitGbp: null,
      grossProfitPerUnitGbp: null,
      marginPercent: null,
      returnOnCapitalPercent: null,
      supplierMinimum: { ...emptyMinimum, evaluation: "not_evaluated" },
      capitalEvaluation: {
        status: "unavailable",
        reserveProtected: null,
        remainingPurchasingPowerGbp: null,
        walletLastUpdated: wallet?.lastUpdated ?? null,
      },
      confidence: null,
      evidence: [],
    };
  }

  const commercial = product.commercial_cost;
  const replenishment = product.replenishment_intelligence;
  const demand = DemandIntelligenceEngine.evaluate(product);
  const supplierMinimum = SupplierMinimumContract.create({
    value: supplier?.minimumOrderValue ?? null,
    currency: supplier?.currency ?? null,
    minimumOrderPacks: supplier?.minimumOrderPacks ?? null,
  });

  if (!product.style_id || !product.parent_product_id) add(reasons, "canonical_product_missing");
  if (!product.configuration_trusted) add(reasons, "configuration_untrusted");
  if (product.inventory_strategy !== "stocked") add(reasons, "inventory_strategy_not_stocked");
  if (!product.restock_enabled) add(reasons, "restock_disabled");
  if (product.reorder_approval?.approval_state !== "approved") add(reasons, "reorder_approval_missing");
  if (!product.supplier_id || !supplier) add(reasons, "supplier_missing");
  else if (!supplier.active) add(reasons, "supplier_inactive");
  if (supplier && !supplier.currency?.trim()) add(reasons, "supplier_currency_missing");

  if (!commercial.commercial_cost_trusted) add(reasons, "commercial_data_missing");
  if (
    commercial.landed_cost_per_pack_gbp === null ||
    !Number.isFinite(commercial.landed_cost_per_pack_gbp) ||
    commercial.landed_cost_per_pack_gbp <= 0
  ) add(reasons, "invalid_or_missing_commercial_cost");
  if (
    commercial.estimated_margin_percent === null ||
    commercial.estimated_return_on_pack_capital_percent === null ||
    commercial.estimated_gross_profit_per_unit === null
  ) add(reasons, "profitability_incomplete");
  if ((commercial.estimated_margin_percent ?? Number.NEGATIVE_INFINITY) < TRUSTED_BUYING_MARGIN_PERCENT) {
    if (commercial.estimated_margin_percent !== null) add(reasons, "margin_below_threshold");
  }
  if ((commercial.estimated_return_on_pack_capital_percent ?? Number.NEGATIVE_INFINITY) < TRUSTED_BUYING_RETURN_PERCENT) {
    if (commercial.estimated_return_on_pack_capital_percent !== null) add(reasons, "return_below_threshold");
  }
  if (product.stock_on_hand > TRUSTED_BUYING_LOW_STOCK_THRESHOLD) add(reasons, "stock_above_threshold");

  const missing = replenishment.missingRequirements;
  if (replenishment.stockOnHand === null) add(reasons, "inventory_unavailable");
  if (missing.includes("inventory_stale")) add(reasons, "inventory_stale");
  if (missing.includes("sales_history_unavailable")) add(reasons, "sales_history_unavailable");
  if ((replenishment.supplierLeadTimeDays ?? 0) <= 0) add(reasons, "supplier_lead_time_missing");
  if ((replenishment.targetStockDays ?? 0) <= 0) add(reasons, "target_stock_days_missing");
  if ((replenishment.unitsPerPack ?? 0) <= 0) add(reasons, "units_per_pack_missing");
  if (replenishment.supplierMoqPacks === null || replenishment.supplierMoqPacks < 0) add(reasons, "supplier_moq_missing");
  if (demand.status === "evidence_unavailable") add(reasons, "replenishment_untrusted");
  if (demand.calculatedPacks === null || demand.suggestedPacks === null) add(reasons, "quantity_unavailable");
  else if (demand.calculatedPacks <= 0) add(reasons, "quantity_not_positive");
  if (
    demand.calculatedPacks !== null &&
    demand.productMoqPacks !== null &&
    demand.calculatedPacks > 0 &&
    demand.calculatedPacks < demand.productMoqPacks
  ) add(reasons, "quantity_below_minimum_policy_unresolved");

  let minimumEvaluation: TrustedBuyingCandidateResult["supplierMinimum"]["evaluation"] = "not_evaluated";
  if (supplierMinimum.state === "unknown") add(reasons, "supplier_minimum_unknown");
  else if (supplierMinimum.state === "defined") add(reasons, "supplier_minimum_not_evaluated");
  if (supplierMinimum.state === "defined" && !supplierMinimum.currency) {
    minimumEvaluation = "currency_unavailable";
    add(reasons, "supplier_minimum_currency_unavailable");
  }

  if (!wallet?.available) add(reasons, "wallet_unavailable");
  else if (!walletFreshnessPolicyDefined) add(reasons, "wallet_freshness_policy_missing");
  add(reasons, "capital_not_evaluated");

  const packCost = commercial.landed_cost_per_pack_gbp;
  const suggestedQuantity = demand.suggestedPacks;
  const estimatedOrderCostGbp =
    packCost !== null && suggestedQuantity !== null
      ? Math.round(packCost * suggestedQuantity * 100) / 100
      : null;
  const estimatedGrossProfitGbp =
    commercial.estimated_gross_profit_per_unit !== null && demand.suggestedUnits !== null
      ? Math.round(commercial.estimated_gross_profit_per_unit * demand.suggestedUnits * 100) / 100
      : null;
  const status = statusFor(reasons);

  return {
    styleId: product.style_id,
    parentProductId: product.parent_product_id,
    productName: product.product_name,
    supplierId: product.supplier_id,
    supplierName: supplier?.name ?? product.supplier_company,
    status,
    eligible: status === "eligible",
    rejectionReasons: reasons,
    calculatedQuantity: demand.calculatedPacks,
    minimumRequiredQuantity: demand.productMoqPacks,
    suggestedQuantity,
    suggestedUnits: demand.suggestedUnits,
    unitsPerPack: demand.unitsPerPack,
    stockRemaining: replenishment.stockOnHand,
    canonicalPackCostGbp: packCost,
    canonicalUnitCostGbp: commercial.landed_cost_per_unit,
    estimatedOrderCostGbp,
    estimatedGrossProfitGbp,
    grossProfitPerUnitGbp: commercial.estimated_gross_profit_per_unit,
    marginPercent: commercial.estimated_margin_percent,
    returnOnCapitalPercent: commercial.estimated_return_on_pack_capital_percent,
    supplierMinimum: { ...supplierMinimum, evaluation: minimumEvaluation },
    capitalEvaluation: {
      status: wallet?.available ? "not_evaluated" : "unavailable",
      reserveProtected: null,
      remainingPurchasingPowerGbp: null,
      walletLastUpdated: wallet?.lastUpdated ?? null,
    },
    confidence: demand.trusted ? 100 : null,
    evidence: [
      "DemandIntelligenceEngine",
      "canonical commercial intelligence",
      "canonical replenishment intelligence",
      "canonical supplier minimum",
      "purchasing wallet provenance",
    ],
  };
}

export const TrustedBuyingCandidateClassifier = {
  classify: classifyTrustedBuyingCandidate,
} as const;
