import { BuyingRecommendationEngine } from "./BuyingRecommendationEngine.ts";
import type { CatalogueProduct } from "@/types/catalogue";

export type DemandIntelligenceStatus =
  | "needs_replenishment"
  | "no_replenishment_required"
  | "evidence_unavailable"
  | "excluded_by_strategy";

export type DemandEvidence = {
  field: string;
  source: "catalogue" | "inventory" | "sales" | "supplier" | "quantity_engine";
  value: string | number | boolean | null;
};

export type DemandIntelligenceResult = {
  parentProductId: string;
  styleId: string;
  productName: string;
  supplierId: string | null;
  currentStock: number | null;
  committedStock: number | null;
  incomingStock: number | null;
  netAvailableStock: number | null;
  averageDailySales: number | null;
  salesHistoryDays: number | null;
  targetStockDays: number | null;
  supplierLeadTimeDays: number | null;
  unitsPerPack: number | null;
  productMoqPacks: number | null;
  calculatedPacks: number | null;
  suggestedPacks: number | null;
  suggestedUnits: number | null;
  status: DemandIntelligenceStatus;
  trusted: boolean;
  evidence: DemandEvidence[];
  missingRequirements: string[];
};

const SUPPLIER_POLICY_REQUIREMENTS = new Set([
  "supplier_minimum_order_not_evaluated",
  "supplier_minimum_order_unknown",
]);

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function evaluateDemand(product: CatalogueProduct): DemandIntelligenceResult {
  const replenishment = product.replenishment_intelligence;
  const evidence: DemandEvidence[] = [
    { field: "inventory_strategy", source: "catalogue", value: product.inventory_strategy },
    { field: "restock_enabled", source: "catalogue", value: product.restock_enabled },
    { field: "stock_on_hand", source: "inventory", value: replenishment.stockOnHand },
    { field: "committed_stock", source: "inventory", value: replenishment.committedStock },
    { field: "incoming_stock", source: "inventory", value: replenishment.incomingStock },
    { field: "net_available_stock", source: "inventory", value: replenishment.netAvailableStock },
    { field: "average_daily_sales", source: "sales", value: replenishment.averageDailySales },
    { field: "sales_history_days", source: "sales", value: replenishment.salesHistoryDays },
    { field: "target_stock_days", source: "catalogue", value: replenishment.targetStockDays },
    { field: "supplier_lead_time_days", source: "supplier", value: replenishment.supplierLeadTimeDays },
    { field: "units_per_pack", source: "catalogue", value: replenishment.unitsPerPack },
    { field: "product_moq_packs", source: "catalogue", value: replenishment.supplierMoqPacks },
  ];
  const base = {
    parentProductId: product.parent_product_id,
    styleId: product.style_id,
    productName: product.product_name,
    supplierId: product.supplier_id,
    currentStock: replenishment.stockOnHand,
    committedStock: replenishment.committedStock,
    incomingStock: replenishment.incomingStock,
    netAvailableStock: replenishment.netAvailableStock,
    averageDailySales: replenishment.averageDailySales,
    salesHistoryDays: replenishment.salesHistoryDays,
    targetStockDays: replenishment.targetStockDays,
    supplierLeadTimeDays: replenishment.supplierLeadTimeDays,
    unitsPerPack: replenishment.unitsPerPack,
    productMoqPacks: replenishment.supplierMoqPacks,
    evidence,
  };

  if (product.inventory_strategy !== "stocked" || !product.restock_enabled) {
    return {
      ...base,
      calculatedPacks: null,
      suggestedPacks: null,
      suggestedUnits: null,
      status: "excluded_by_strategy",
      trusted: true,
      missingRequirements: [],
    };
  }

  const operationalMissing = replenishment.missingRequirements.filter(
    (requirement) => !SUPPLIER_POLICY_REQUIREMENTS.has(requirement),
  );
  if (replenishment.stockOnHand === null) operationalMissing.push("stock_unavailable");
  if (replenishment.committedStock === null) operationalMissing.push("committed_stock_unavailable");
  if (replenishment.incomingStock === null) operationalMissing.push("incoming_stock_unavailable");
  if (replenishment.averageDailySales === null) operationalMissing.push("sales_history_unavailable");
  if ((replenishment.targetStockDays ?? 0) <= 0) operationalMissing.push("target_stock_days_missing");
  if ((replenishment.supplierLeadTimeDays ?? 0) <= 0) operationalMissing.push("supplier_lead_time_missing");
  if ((replenishment.unitsPerPack ?? 0) <= 0) operationalMissing.push("units_per_pack_missing");
  if (replenishment.supplierMoqPacks === null || replenishment.supplierMoqPacks < 0) {
    operationalMissing.push("supplier_moq_missing");
  }
  const missingRequirements = unique(operationalMissing);
  if (missingRequirements.length > 0) {
    return {
      ...base,
      calculatedPacks: null,
      suggestedPacks: null,
      suggestedUnits: null,
      status: "evidence_unavailable",
      trusted: false,
      missingRequirements,
    };
  }

  const buying = BuyingRecommendationEngine.buildRecommendation({
    product: {
      ...product,
      replenishment_intelligence: {
        ...replenishment,
        trusted: true,
        missingRequirements: [],
      },
    },
  });
  evidence.push(
    { field: "calculated_packs", source: "quantity_engine", value: buying.calculatedQuantity },
    { field: "suggested_packs", source: "quantity_engine", value: buying.suggestedPacks },
    { field: "suggested_units", source: "quantity_engine", value: buying.suggestedUnits },
  );
  if (buying.calculatedQuantity === null || buying.suggestedPacks === null || buying.suggestedUnits === null) {
    return {
      ...base,
      evidence,
      calculatedPacks: null,
      suggestedPacks: null,
      suggestedUnits: null,
      status: "evidence_unavailable",
      trusted: false,
      missingRequirements: unique([...buying.missingData, "quantity_unavailable"]),
    };
  }

  return {
    ...base,
    evidence,
    calculatedPacks: buying.calculatedQuantity,
    suggestedPacks: buying.suggestedPacks,
    suggestedUnits: buying.suggestedUnits,
    status: buying.calculatedQuantity > 0
      ? "needs_replenishment"
      : "no_replenishment_required",
    trusted: true,
    missingRequirements: [],
  };
}

export const DemandIntelligenceEngine = { evaluate: evaluateDemand } as const;
