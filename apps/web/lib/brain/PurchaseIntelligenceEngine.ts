import type { PurchasingWalletData } from "@/components/commercial/PurchasingWallet";
import { CapitalEngine } from "@/lib/brain/CapitalEngine";
import {
  DemandIntelligenceEngine,
  type DemandIntelligenceResult,
} from "@/lib/brain/DemandIntelligenceEngine";
import {
  TrustedBuyingCandidateClassifier,
  TRUSTED_BUYING_MARGIN_PERCENT,
  TRUSTED_BUYING_RETURN_PERCENT,
  type TrustedBuyingCandidateResult,
} from "@/lib/brain/TrustedBuyingCandidateClassifier";
import { SupplierMinimumContract } from "@/lib/supplier/SupplierMinimum";
import {
  SupplierBasketIntelligenceEngine,
  type SupplierBasketIntelligence,
} from "@/lib/brain/SupplierBasketIntelligenceEngine";
import type { CatalogueProduct } from "@/types/catalogue";
import {
  WalletFreshness,
  type WalletFreshnessEvaluation,
} from "@/lib/brain/WalletFreshness";

export type PurchaseIntelligenceSupplier = {
  id: string;
  name: string;
  active: boolean;
  currency: string | null;
  minimumOrderValue: number | null;
  minimumOrderPacks: number | null;
};

export type PurchaseRecommendationProduct = {
  styleId: string;
  productName: string;
  currentStock: number;
  averageDailySales: number;
  daysOfStockRemaining: number | null;
  targetDays: number;
  quantityRequired: number;
  packRounding: { unitsPerPack: number; calculatedPacks: number; recommendedPacks: number };
  supplier: { id: string; name: string };
  expectedSupplierCostGbp: number | null;
  expectedSellingRevenueGbp: number | null;
  expectedGrossProfitGbp: number | null;
  confidence: number;
  demand_score: number;
  demand_level: NonNullable<DemandIntelligenceResult["demand_level"]>;
  demand_reason: string;
  quantityIntelligence: NonNullable<DemandIntelligenceResult["quantity_intelligence"]>;
};

export type PurchasingQualificationState =
  | "ready_to_purchase"
  | "blocked_by_supplier_policy"
  | "blocked_by_approval"
  | "blocked_by_capital"
  | "policy_unresolved"
  | "evidence_unavailable";

export type SupplierPurchasingQualification = {
  supplier: { id: string; name: string; currency: string | null };
  demandProducts: DemandIntelligenceResult[];
  totalDemandPacks: number;
  totalDemandUnits: number;
  spendGbp: number | null;
  supplierMinimumValue: number | null;
  supplierMinimumPacks: number | null;
  state: PurchasingQualificationState;
  blockers: string[];
  purchasingPowerAfterOrderGbp: number | null;
  walletFreshness: WalletFreshnessEvaluation;
};

export type SupplierPurchaseRecommendation = {
  supplier: { id: string; name: string; currency: string | null };
  recommendedProducts: PurchaseRecommendationProduct[];
  packs: number;
  units: number;
  spendGbp: number | null;
  projectedRevenueGbp: number | null;
  projectedProfitGbp: number | null;
  supplierMinimumStatus: "satisfied" | "not_satisfied" | "unknown";
  purchasingPowerAfterOrderGbp: number | null;
  confidence: "trusted" | "advisory";
  purchasingQualificationState: PurchasingQualificationState;
  purchasingBlockers: string[];
  operatorWarnings: string[];
};

export type PurchaseIntelligenceEvaluation = {
  demands: DemandIntelligenceResult[];
  candidates: TrustedBuyingCandidateResult[];
  qualifications: SupplierPurchasingQualification[];
  recommendations: SupplierPurchaseRecommendation[];
  baskets: SupplierBasketIntelligence[];
};

type Input = {
  products: CatalogueProduct[];
  suppliers: PurchaseIntelligenceSupplier[];
  wallet: PurchasingWalletData | null;
  inventoryTrusted: boolean;
  evaluatedAt?: string;
};

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function evaluatePurchaseIntelligence({
  products,
  suppliers,
  wallet,
  inventoryTrusted,
  evaluatedAt,
}: Input): PurchaseIntelligenceEvaluation {
  const demands = products.map((product) => {
    const demand = DemandIntelligenceEngine.evaluate(product);
    return !inventoryTrusted && demand.status !== "excluded_by_strategy"
      ? {
          ...demand,
          calculatedPacks: null,
          suggestedPacks: null,
          suggestedUnits: null,
          status: "evidence_unavailable" as const,
          trusted: false,
          missingRequirements: Array.from(new Set([...demand.missingRequirements, "inventory_sync_not_current"])),
        }
      : demand;
  });
  const productByStyle = new Map(products.map((product) => [product.style_id, product]));
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const walletFreshness = WalletFreshness.evaluate({
    evidenceTimestamp: wallet?.wallet_last_updated ?? null,
    thresholdMinutes: wallet?.wallet_freshness_threshold_minutes ?? null,
    evaluatedAt,
  });
  const baskets = suppliers.map((supplier) => SupplierBasketIntelligenceEngine.evaluate({
    supplier,
    demands,
    products,
  })).sort((left, right) => left.supplier.name.localeCompare(right.supplier.name));
  const basketBySupplier = new Map(baskets.map((basket) => [basket.supplier.id, basket]));
  const candidates = products.map((product) => {
    const supplier = product.supplier_id ? supplierById.get(product.supplier_id) ?? null : null;
    return TrustedBuyingCandidateClassifier.classify({
      product,
      supplier,
      wallet: wallet
        ? {
            available: true,
            lastUpdated: wallet.wallet_last_updated,
            freshnessThresholdMinutes: wallet.wallet_freshness_threshold_minutes,
          }
        : null,
      evaluatedAt,
    });
  });
  const grouped = new Map<string, DemandIntelligenceResult[]>();
  for (const demand of demands) {
    if (
      demand.status !== "needs_replenishment" ||
      (demand.demand_status !== "ACTIVE" && demand.demand_status !== "SLOW") ||
      !demand.supplierId
    ) continue;
    grouped.set(demand.supplierId, [...(grouped.get(demand.supplierId) ?? []), demand]);
  }

  const qualifications: SupplierPurchasingQualification[] = [];
  const recommendations: SupplierPurchaseRecommendation[] = [];
  for (const [supplierId, demandProducts] of grouped) {
    const supplier = supplierById.get(supplierId);
    const basket = basketBySupplier.get(supplierId);
    const blockers: string[] = [];
    const totalDemandPacks = demandProducts.reduce((total, demand) => total + (demand.suggestedPacks ?? 0), 0);
    const totalDemandUnits = demandProducts.reduce((total, demand) => total + (demand.suggestedUnits ?? 0), 0);
    const lineProducts = demandProducts.map((demand) => productByStyle.get(demand.styleId)).filter(
      (product): product is CatalogueProduct => product !== undefined,
    );

    if (!supplier?.active) blockers.push("supplier_inactive_or_unknown");
    if (!supplier?.currency) blockers.push("supplier_currency_missing");
    if (lineProducts.some((product) => product.reorder_approval?.approval_state !== "approved")) {
      blockers.push("reorder_approval_missing");
    }
    if (lineProducts.some((product) => !product.commercial_cost.commercial_cost_trusted)) {
      blockers.push("commercial_data_missing");
    }
    if (lineProducts.some((product) =>
      (product.commercial_cost.estimated_margin_percent ?? Number.NEGATIVE_INFINITY) < TRUSTED_BUYING_MARGIN_PERCENT ||
      (product.commercial_cost.estimated_return_on_pack_capital_percent ?? Number.NEGATIVE_INFINITY) < TRUSTED_BUYING_RETURN_PERCENT
    )) blockers.push("commercial_profitability_below_threshold");

    const costs = lineProducts.map((product) => {
      const demand = demandProducts.find((entry) => entry.styleId === product.style_id);
      const packCost = product.commercial_cost.landed_cost_per_pack_gbp;
      return demand?.suggestedPacks !== null && demand?.suggestedPacks !== undefined && packCost !== null
        ? demand.suggestedPacks * packCost
        : null;
    });
    const spendGbp = costs.some((cost) => cost === null)
      ? null
      : money(costs.reduce<number>((total, cost) => total + (cost ?? 0), 0));
    if (spendGbp === null) blockers.push("supplier_basket_cost_unavailable");

    const minimum = SupplierMinimumContract.create({
      value: supplier?.minimumOrderValue ?? null,
      currency: supplier?.currency ?? null,
      minimumOrderPacks: supplier?.minimumOrderPacks ?? null,
    });
    if (minimum.state === "unknown") blockers.push("supplier_minimum_policy_unknown");
    if (minimum.minimumOrderPacks !== null &&
      (basket?.intelligent_basket_packs ?? totalDemandPacks) < minimum.minimumOrderPacks) {
      blockers.push("supplier_minimum_packs_not_satisfied");
    }
    if (minimum.value !== null && minimum.value > 0) {
      if (supplier?.currency !== "GBP" || spendGbp === null) blockers.push("supplier_minimum_value_not_evaluated");
      else if (spendGbp < minimum.value) blockers.push("supplier_minimum_value_not_satisfied");
    }
    if (!wallet) blockers.push("wallet_unavailable");
    else if (walletFreshness.status === "unknown") blockers.push("wallet_freshness_unknown");
    else if (walletFreshness.status === "stale") blockers.push("wallet_stale");

    const capital = wallet && spendGbp !== null
      ? CapitalEngine.reviewPosition({
          ledgerBalanceGbp: wallet.ledger_balance_gbp,
          protectedReserveGbp: wallet.protected_reserve_gbp,
          committedOrdersGbp: wallet.committed_orders_gbp,
          manualSpendingLimitGbp: wallet.manual_spending_limit_gbp,
          proposedPurchaseGbp: spendGbp,
          walletAvailable: true,
          walletLastUpdated: wallet.wallet_last_updated,
        })
      : null;
    if (capital && (!capital.affordable || !capital.reserveProtected)) blockers.push("insufficient_reserve_safe_capacity");

    let state: PurchasingQualificationState = "ready_to_purchase";
    if (blockers.some((reason) => reason === "wallet_unavailable" || reason.includes("unavailable") || reason === "commercial_data_missing")) {
      state = "evidence_unavailable";
    } else if (blockers.includes("reorder_approval_missing")) {
      state = "blocked_by_approval";
    } else if (blockers.includes("insufficient_reserve_safe_capacity")) {
      state = "blocked_by_capital";
    } else if (blockers.some((reason) => reason.startsWith("supplier_minimum") || reason.startsWith("supplier_currency") || reason.startsWith("supplier_inactive"))) {
      state = blockers.some((reason) => reason.endsWith("unknown") || reason.endsWith("not_evaluated"))
        ? "policy_unresolved"
        : "blocked_by_supplier_policy";
    } else if (blockers.length > 0) {
      state = "policy_unresolved";
    }

    const qualification: SupplierPurchasingQualification = {
      supplier: { id: supplierId, name: supplier?.name ?? "Unknown supplier", currency: supplier?.currency ?? null },
      demandProducts,
      totalDemandPacks,
      totalDemandUnits,
      spendGbp,
      supplierMinimumValue: minimum.value,
      supplierMinimumPacks: minimum.minimumOrderPacks,
      state,
      blockers: Array.from(new Set(blockers)).sort(),
      purchasingPowerAfterOrderGbp: capital?.remainingPurchasingPowerGbp ?? null,
      walletFreshness,
    };
    qualifications.push(qualification);

    if (!supplier) continue;
    const recommendedProducts: PurchaseRecommendationProduct[] = demandProducts.map((demand) => {
      const product = productByStyle.get(demand.styleId) as CatalogueProduct;
      const unitsPerPack = demand.unitsPerPack as number;
      const packs = demand.suggestedPacks as number;
      const units = demand.suggestedUnits as number;
      const averageDailySales = demand.averageDailySales as number;
      return {
        styleId: demand.styleId,
        productName: demand.productName,
        currentStock: demand.currentStock as number,
        averageDailySales,
        daysOfStockRemaining: averageDailySales > 0 ? Math.round((demand.currentStock as number) / averageDailySales * 10) / 10 : null,
        targetDays: demand.targetStockDays as number,
        quantityRequired: (demand.calculatedPacks as number) * unitsPerPack,
        packRounding: { unitsPerPack, calculatedPacks: demand.calculatedPacks as number, recommendedPacks: packs },
        supplier: { id: supplier.id, name: supplier.name },
        expectedSupplierCostGbp: product.commercial_cost.landed_cost_per_pack_gbp === null
          ? null
          : money(product.commercial_cost.landed_cost_per_pack_gbp * packs),
        expectedSellingRevenueGbp: product.commercial_cost.average_selling_price === null
          ? null
          : money(product.commercial_cost.average_selling_price * units),
        expectedGrossProfitGbp: product.commercial_cost.estimated_gross_profit_per_unit === null
          ? null
          : money(product.commercial_cost.estimated_gross_profit_per_unit * units),
        confidence: 100,
        demand_score: demand.demand_score as number,
        demand_level: demand.demand_level as NonNullable<DemandIntelligenceResult["demand_level"]>,
        demand_reason: demand.demand_reason,
        quantityIntelligence: demand.quantity_intelligence as NonNullable<DemandIntelligenceResult["quantity_intelligence"]>,
      };
    });
    recommendations.push({
      supplier: { id: supplier.id, name: supplier.name, currency: supplier.currency },
      recommendedProducts,
      packs: totalDemandPacks,
      units: totalDemandUnits,
      spendGbp,
      projectedRevenueGbp: recommendedProducts.some((line) => line.expectedSellingRevenueGbp === null)
        ? null
        : money(recommendedProducts.reduce((total, line) => total + (line.expectedSellingRevenueGbp ?? 0), 0)),
      projectedProfitGbp: recommendedProducts.some((line) => line.expectedGrossProfitGbp === null)
        ? null
        : money(recommendedProducts.reduce((total, line) => total + (line.expectedGrossProfitGbp ?? 0), 0)),
      supplierMinimumStatus: minimum.state === "unknown"
        ? "unknown"
        : blockers.includes("supplier_minimum_packs_not_satisfied") ||
            blockers.includes("supplier_minimum_value_not_satisfied")
          ? "not_satisfied"
          : "satisfied",
      purchasingPowerAfterOrderGbp: capital?.remainingPurchasingPowerGbp ?? null,
      confidence: state === "ready_to_purchase" ? "trusted" : "advisory",
      purchasingQualificationState: state,
      purchasingBlockers: Array.from(new Set(blockers)).sort(),
      operatorWarnings: Array.from(new Set(blockers)).sort(),
    });
  }

  return {
    demands,
    candidates,
    qualifications: qualifications.sort((a, b) => a.supplier.name.localeCompare(b.supplier.name)),
    recommendations: recommendations.sort((a, b) => a.supplier.name.localeCompare(b.supplier.name)),
    baskets,
  };
}

export function buildPurchaseRecommendations(input: Input): SupplierPurchaseRecommendation[] {
  return evaluatePurchaseIntelligence(input).recommendations;
}

export const PurchaseIntelligenceEngine = {
  evaluate: evaluatePurchaseIntelligence,
  build: buildPurchaseRecommendations,
} as const;
