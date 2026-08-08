import type { DemandIntelligenceResult } from "./DemandIntelligenceEngine.ts";
import type { PurchaseIntelligenceSupplier } from "./PurchaseIntelligenceEngine.ts";
import type { CatalogueProduct } from "@/types/catalogue";

export type SupplierPurchasingState =
  | "READY_TO_ORDER"
  | "NEAR_MINIMUM"
  | "BUILD_BASKET"
  | "NO_DEMAND";

export type SupplierBasketProduct = {
  style_id: string;
  product_name: string;
  required_packs: number;
  required_units: number;
  estimated_value: number;
  urgency: DemandIntelligenceResult["urgency"];
  sold_7d: number;
  current_stock: number;
  demand_score: number;
};

export type SupplierBasketIntelligence = {
  supplier: { id: string; name: string; currency: string | null };
  products_recommended: number;
  total_required_packs: number;
  total_required_units: number;
  estimated_order_value: number | null;
  supplier_minimum_packs: number | null;
  supplier_minimum_value: number | null;
  packs_short: number | null;
  value_short: number | null;
  purchasing_state: SupplierPurchasingState;
  top_products: SupplierBasketProduct[];
  additional_qualifying_products: SupplierBasketProduct[];
  minimum_reached_with_additions: boolean;
};

const URGENCY_ORDER = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 } as const;

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function rankProducts(left: SupplierBasketProduct, right: SupplierBasketProduct): number {
  const urgency = (URGENCY_ORDER[right.urgency ?? "LOW"] - URGENCY_ORDER[left.urgency ?? "LOW"]);
  if (urgency !== 0) return urgency;
  if (right.sold_7d !== left.sold_7d) return right.sold_7d - left.sold_7d;
  if (left.current_stock !== right.current_stock) return left.current_stock - right.current_stock;
  if (right.demand_score !== left.demand_score) return right.demand_score - left.demand_score;
  return left.style_id.localeCompare(right.style_id);
}

function isWithinTwentyFivePercent(shortfall: number | null, minimum: number | null): boolean {
  if (minimum === null) return false;
  if (minimum <= 0) return true;
  return (shortfall ?? minimum) / minimum <= 0.25;
}

function hasBasketDemandQuality(demand: DemandIntelligenceResult): boolean {
  return (demand.sales7Days ?? 0) > 0 ||
    ((demand.sales14Days ?? 0) >= 2 && (demand.daysSinceLastSale ?? Number.POSITIVE_INFINITY) <= 14);
}

export function evaluateSupplierBasket({
  supplier,
  demands,
  products,
}: {
  supplier: PurchaseIntelligenceSupplier;
  demands: DemandIntelligenceResult[];
  products: CatalogueProduct[];
}): SupplierBasketIntelligence {
  const productByStyle = new Map(products.map((product) => [product.style_id, product]));
  const recommended = demands.filter((demand) =>
    demand.supplierId === supplier.id &&
    demand.status === "needs_replenishment" &&
    (demand.demand_status === "ACTIVE" || demand.demand_status === "SLOW") &&
    (demand.suggestedPacks ?? 0) > 0
  );
  const topProducts = recommended.map((demand): SupplierBasketProduct | null => {
    const product = productByStyle.get(demand.styleId);
    const packCost = product?.commercial_cost.landed_cost_per_pack_gbp ?? null;
    if (!product || packCost === null) return null;
    return {
      style_id: demand.styleId,
      product_name: demand.productName,
      required_packs: demand.suggestedPacks as number,
      required_units: demand.suggestedUnits as number,
      estimated_value: money(packCost * (demand.suggestedPacks as number)),
      urgency: demand.urgency,
      sold_7d: demand.sales7Days ?? 0,
      current_stock: demand.currentStock ?? 0,
      demand_score: demand.demand_score ?? 0,
    };
  }).filter((product): product is SupplierBasketProduct => product !== null).sort(rankProducts);

  const totalRequiredPacks = recommended.reduce((total, demand) => total + (demand.suggestedPacks ?? 0), 0);
  const totalRequiredUnits = recommended.reduce((total, demand) => total + (demand.suggestedUnits ?? 0), 0);
  const values = recommended.map((demand) => {
    const packCost = productByStyle.get(demand.styleId)?.commercial_cost.landed_cost_per_pack_gbp ?? null;
    return packCost === null ? null : packCost * (demand.suggestedPacks ?? 0);
  });
  const estimatedOrderValue = values.some((value) => value === null)
    ? null
    : money(values.reduce<number>((total, value) => total + (value ?? 0), 0));
  const minimumPacks = supplier.minimumOrderPacks;
  const minimumValue = supplier.minimumOrderValue;
  const packsShort = minimumPacks === null ? null : Math.max(0, minimumPacks - totalRequiredPacks);
  const valueComparable = supplier.currency === "GBP" && estimatedOrderValue !== null;
  const valueShort = minimumValue === null || !valueComparable
    ? null
    : money(Math.max(0, minimumValue - estimatedOrderValue));
  const packsSatisfied = minimumPacks !== null && packsShort === 0;
  const valueSatisfied = minimumValue !== null && valueComparable && valueShort === 0;

  let purchasingState: SupplierPurchasingState;
  if (recommended.length === 0) purchasingState = "NO_DEMAND";
  else if (packsSatisfied && valueSatisfied) purchasingState = "READY_TO_ORDER";
  else if (
    isWithinTwentyFivePercent(packsShort, minimumPacks) &&
    isWithinTwentyFivePercent(valueShort, minimumValue)
  ) purchasingState = "NEAR_MINIMUM";
  else purchasingState = "BUILD_BASKET";

  const recommendedIds = new Set(recommended.map((demand) => demand.styleId));
  const candidates = demands.filter((demand) => {
    const product = productByStyle.get(demand.styleId);
    const unitsPerPack = demand.unitsPerPack ?? 0;
    return demand.supplierId === supplier.id &&
      !recommendedIds.has(demand.styleId) &&
      demand.trusted &&
      (demand.demand_status === "ACTIVE" || demand.demand_status === "SLOW") &&
      (demand.productMoqPacks ?? 0) > 0 &&
      product?.configuration_trusted === true &&
      product.reorder_approval?.approval_state === "approved" &&
      product?.commercial_cost.commercial_cost_trusted === true &&
      (product?.commercial_cost.landed_cost_per_pack_gbp ?? 0) > 0 &&
      unitsPerPack > 0 &&
      hasBasketDemandQuality(demand) &&
      (
        (demand.netAvailableStock ?? Number.POSITIVE_INFINITY) <= unitsPerPack ||
        (demand.currentStock ?? Number.POSITIVE_INFINITY) <= unitsPerPack
      );
  }).map((demand): SupplierBasketProduct => {
    const product = productByStyle.get(demand.styleId) as CatalogueProduct;
    const packs = demand.productMoqPacks as number;
    const units = packs * (demand.unitsPerPack as number);
    return {
      style_id: demand.styleId,
      product_name: demand.productName,
      required_packs: packs,
      required_units: units,
      estimated_value: money((product.commercial_cost.landed_cost_per_pack_gbp as number) * packs),
      urgency: demand.urgency,
      sold_7d: demand.sales7Days ?? 0,
      current_stock: demand.currentStock ?? 0,
      demand_score: demand.demand_score ?? 0,
    };
  }).sort(rankProducts);

  const selected: SupplierBasketProduct[] = [];
  let remainingPacks = minimumPacks === null ? 0 : Math.max(0, minimumPacks - totalRequiredPacks);
  let projectedPacks = totalRequiredPacks;
  let projectedValue = estimatedOrderValue;
  for (const candidate of candidates) {
    if (remainingPacks === 0) break;
    selected.push(candidate);
    projectedPacks += candidate.required_packs;
    projectedValue = projectedValue === null ? null : money(projectedValue + candidate.estimated_value);
    remainingPacks = Math.max(0, remainingPacks - candidate.required_packs);
  }
  const minimumReachedWithAdditions = selected.length > 0 &&
    minimumPacks !== null && projectedPacks >= minimumPacks &&
    minimumValue !== null && supplier.currency === "GBP" &&
    projectedValue !== null && projectedValue >= minimumValue;

  return {
    supplier: { id: supplier.id, name: supplier.name, currency: supplier.currency },
    products_recommended: recommended.length,
    total_required_packs: totalRequiredPacks,
    total_required_units: totalRequiredUnits,
    estimated_order_value: estimatedOrderValue,
    supplier_minimum_packs: minimumPacks,
    supplier_minimum_value: minimumValue,
    packs_short: packsShort,
    value_short: valueShort,
    purchasing_state: purchasingState,
    top_products: topProducts.slice(0, 5),
    additional_qualifying_products: selected,
    minimum_reached_with_additions: minimumReachedWithAdditions,
  };
}

export const SupplierBasketIntelligenceEngine = { evaluate: evaluateSupplierBasket } as const;
