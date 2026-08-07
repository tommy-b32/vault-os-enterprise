import type { PurchasingWalletData } from "@/components/commercial/PurchasingWallet";
import { BuyingRecommendationEngine } from "@/lib/brain/BuyingRecommendationEngine";
import { CapitalEngine } from "@/lib/brain/CapitalEngine";
import { PurchaseIntelligenceTrust } from "@/lib/brain/PurchaseIntelligenceTrust";
import { SupplierMinimumContract } from "@/lib/supplier/SupplierMinimum";
import type { CatalogueProduct } from "@/types/catalogue";

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
  expectedSupplierCostGbp: number;
  expectedSellingRevenueGbp: number;
  expectedGrossProfitGbp: number;
  confidence: number;
};

export type SupplierPurchaseRecommendation = {
  supplier: { id: string; name: string; currency: string };
  recommendedProducts: PurchaseRecommendationProduct[];
  packs: number;
  units: number;
  spendGbp: number;
  projectedRevenueGbp: number;
  projectedProfitGbp: number;
  supplierMinimumStatus: "satisfied" | "warning";
  purchasingPowerAfterOrderGbp: number;
  confidence: "trusted" | "trusted_with_operator_warnings";
  operatorWarnings: string[];
};

type Input = {
  products: CatalogueProduct[];
  suppliers: PurchaseIntelligenceSupplier[];
  wallet: PurchasingWalletData | null;
  inventoryTrusted: boolean;
};

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function buildPurchaseRecommendations({
  products,
  suppliers,
  wallet,
  inventoryTrusted,
}: Input): SupplierPurchaseRecommendation[] {
  if (!wallet || !inventoryTrusted) return [];

  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const grouped = new Map<string, PurchaseRecommendationProduct[]>();

  for (const product of products) {
    const supplier = product.supplier_id ? supplierById.get(product.supplier_id) : null;
    const commercial = product.commercial_cost;
    const trust = PurchaseIntelligenceTrust.evaluate({
      product,
      supplier: supplier ?? null,
      walletLastUpdated: wallet.wallet_last_updated,
    });

    if (
      trust.excluded ||
      !trust.needsReplenishment ||
      trust.hardBlockers.length > 0 ||
      !supplier
    ) continue;

    const recommendation = BuyingRecommendationEngine.buildRecommendation({ product });
    const unitsPerPack = recommendation.unitsPerPack;
    const packs = recommendation.suggestedPacks;
    const units = recommendation.suggestedUnits;
    const packCost = commercial.landed_cost_per_pack_gbp;
    const sellingPrice = commercial.average_selling_price;
    const profitPerUnit = commercial.estimated_gross_profit_per_unit;

    if (
      recommendation.confidence !== 100 ||
      recommendation.calculatedQuantity === null ||
      recommendation.calculatedQuantity <= 0 ||
      packs === null || packs <= 0 || units === null ||
      unitsPerPack === null || unitsPerPack <= 0 ||
      recommendation.averageDailySales === null ||
      recommendation.targetStockDays === null ||
      packCost === null || packCost <= 0 ||
      sellingPrice === null || sellingPrice < 0 ||
      profitPerUnit === null
    ) continue;

    const line: PurchaseRecommendationProduct = {
      styleId: product.style_id,
      productName: product.product_name,
      currentStock: recommendation.currentStock,
      averageDailySales: recommendation.averageDailySales,
      daysOfStockRemaining: recommendation.estimatedDaysRemaining,
      targetDays: recommendation.targetStockDays,
      quantityRequired: recommendation.calculatedQuantity * unitsPerPack,
      packRounding: {
        unitsPerPack,
        calculatedPacks: recommendation.calculatedQuantity,
        recommendedPacks: packs,
      },
      supplier: { id: supplier.id, name: supplier.name },
      expectedSupplierCostGbp: money(packCost * packs),
      expectedSellingRevenueGbp: money(sellingPrice * units),
      expectedGrossProfitGbp: money(profitPerUnit * units),
      confidence: recommendation.confidence,
    };
    grouped.set(supplier.id, [...(grouped.get(supplier.id) ?? []), line]);
  }

  const recommendations: SupplierPurchaseRecommendation[] = [];
  for (const [supplierId, lines] of grouped) {
    const supplier = supplierById.get(supplierId);
    if (!supplier || supplier.currency !== "GBP") continue;
    const minimum = SupplierMinimumContract.create({
      value: supplier.minimumOrderValue,
      currency: supplier.currency,
      minimumOrderPacks: supplier.minimumOrderPacks,
    });
    const packs = lines.reduce((total, line) => total + line.packRounding.recommendedPacks, 0);
    const units = lines.reduce(
      (total, line) => total + line.packRounding.recommendedPacks * line.packRounding.unitsPerPack,
      0,
    );
    const spendGbp = money(lines.reduce((total, line) => total + line.expectedSupplierCostGbp, 0));
    const capital = CapitalEngine.reviewPosition({
      ledgerBalanceGbp: wallet.ledger_balance_gbp,
      protectedReserveGbp: wallet.protected_reserve_gbp,
      committedOrdersGbp: wallet.committed_orders_gbp,
      manualSpendingLimitGbp: wallet.manual_spending_limit_gbp,
      proposedPurchaseGbp: spendGbp,
      walletAvailable: true,
      walletLastUpdated: wallet.wallet_last_updated,
    });
    if (
      capital.availability !== "available" ||
      !capital.affordable ||
      !capital.reserveProtected ||
      capital.confidence !== 100
    ) continue;

    const supplierProducts = products.filter((product) => product.supplier_id === supplier.id);
    const operatorWarnings: string[] = supplierProducts.flatMap((product) => {
      const evaluation = PurchaseIntelligenceTrust.evaluate({
        product,
        supplier,
        walletLastUpdated: wallet.wallet_last_updated,
      });
      return evaluation.needsReplenishment && !evaluation.excluded && evaluation.hardBlockers.length === 0
        ? evaluation.operatorWarnings
        : [];
    });
    if (!wallet.wallet_last_updated) operatorWarnings.push("wallet_freshness_unavailable");
    if (minimum.value === null) operatorWarnings.push("supplier_minimum_value_unknown");
    else if (minimum.value > 0 && spendGbp < minimum.value) operatorWarnings.push("supplier_minimum_value_not_satisfied");
    if (minimum.minimumOrderPacks === null) operatorWarnings.push("supplier_minimum_packs_unknown");
    else if (minimum.minimumOrderPacks > 0 && packs < minimum.minimumOrderPacks) operatorWarnings.push("supplier_minimum_packs_not_satisfied");
    const uniqueWarnings = Array.from(new Set(operatorWarnings)).sort();

    recommendations.push({
      supplier: { id: supplier.id, name: supplier.name, currency: supplier.currency },
      recommendedProducts: [...lines].sort((a, b) => a.productName.localeCompare(b.productName)),
      packs,
      units,
      spendGbp,
      projectedRevenueGbp: money(lines.reduce((total, line) => total + line.expectedSellingRevenueGbp, 0)),
      projectedProfitGbp: money(lines.reduce((total, line) => total + line.expectedGrossProfitGbp, 0)),
      supplierMinimumStatus: uniqueWarnings.some((warning) => warning.startsWith("supplier_minimum"))
        ? "warning"
        : "satisfied",
      purchasingPowerAfterOrderGbp: capital.remainingPurchasingPowerGbp,
      confidence: uniqueWarnings.length === 0 ? "trusted" : "trusted_with_operator_warnings",
      operatorWarnings: uniqueWarnings,
    });
  }

  return recommendations.sort((a, b) => a.supplier.name.localeCompare(b.supplier.name));
}

export const PurchaseIntelligenceEngine = { build: buildPurchaseRecommendations } as const;
