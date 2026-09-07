import type { ProductMomentumRecommendation } from "./ProductMomentumEngine";

export type InventoryPriority = "none" | "watch" | "medium" | "high" | "critical";
export type InventoryAssessment = { state: "available" | "inventory_unavailable" | "mapping_incomplete"; stock: number | null; sold7: number; sold14: number; dailyVelocity: number | null; daysCover: number | null; priority: InventoryPriority; missingSizes: string[]; lowSizes: string[]; action: string; freshness: "current" | "stale" | "unavailable" };
export type InventoryVariant = { sourceVariantId: string; productId: string; size: string | null; availableForSale: boolean; available: number | null; sold14: number };

export function assessInventory(input: { momentum: ProductMomentumRecommendation; sold7: number; sold14: number; soldVariantIds: string[]; variants: InventoryVariant[]; freshness: "current" | "stale" | "unavailable"; queryFailed?: boolean }): InventoryAssessment {
  const { momentum, sold7, sold14, soldVariantIds, variants, freshness, queryFailed = false } = input;
  if (queryFailed) return { state: "inventory_unavailable", stock: null, sold7, sold14, dailyVelocity: null, daysCover: null, priority: "watch", missingSizes: [], lowSizes: [], freshness: "unavailable", action: "Inventory unavailable. No reorder recommendation made." };
  const mapped = new Map(variants.map((variant) => [variant.sourceVariantId, variant]));
  if (soldVariantIds.some((id) => !mapped.has(id))) return { state: "mapping_incomplete", stock: null, sold7, sold14, dailyVelocity: null, daysCover: null, priority: "watch", missingSizes: [], lowSizes: [], freshness, action: "Inventory mapping incomplete. No reorder recommendation made." };
  const productIds = new Set(soldVariantIds.map((id) => mapped.get(id)!.productId));
  if (productIds.size !== 1 || variants.some((variant) => productIds.has(variant.productId) && variant.available === null)) return { state: "inventory_unavailable", stock: null, sold7, sold14, dailyVelocity: null, daysCover: null, priority: "watch", missingSizes: [], lowSizes: [], freshness, action: "Inventory unavailable. No reorder recommendation made." };
  const productVariants = variants.filter((variant) => productIds.has(variant.productId) && variant.availableForSale);
  const stock = productVariants.reduce((sum, variant) => sum + (variant.available ?? 0), 0);
  const velocity = sold14 > 0 ? sold14 / 14 : null;
  const daysCover = velocity ? Math.round(stock / velocity * 10) / 10 : null;
  const missingSizes = productVariants.filter((variant) => variant.size && variant.available === 0 && variant.sold14 >= 3).map((variant) => variant.size!);
  const lowSizes = productVariants.filter((variant) => variant.size && (variant.available ?? 0) > 0 && (variant.available ?? 0) <= 2 && variant.sold14 >= 3).map((variant) => variant.size!);
  const credible = momentum.confidence !== "low" && !["emerging", "insufficient_data"].includes(momentum.status) && sold14 >= 6;
  let priority: InventoryPriority = "none";
  if (freshness !== "current") priority = "watch";
  else if (missingSizes.length) priority = credible ? "critical" : "watch";
  else if (credible && daysCover !== null && daysCover <= 7) priority = "critical";
  else if (credible && daysCover !== null && daysCover <= 14) priority = "high";
  else if (sold14 >= 3 && daysCover !== null && daysCover <= 28 && momentum.status !== "cooling") priority = "medium";
  else if (daysCover === null || (daysCover !== null && daysCover <= 45) || lowSizes.length) priority = "watch";
  if (momentum.status === "cooling" && priority !== "critical") priority = daysCover !== null && daysCover <= 28 ? "watch" : "none";
  const action = priority === "critical" || priority === "high" || priority === "medium"
    ? "Review Purchase Intelligence for verified reorder quantity."
    : priority === "watch" ? "Monitor stock and demand before increasing purchasing." : "No immediate reorder — adequate stock cover.";
  return { state: "available", stock, sold7, sold14, dailyVelocity: velocity ? Math.round(velocity * 100) / 100 : null, daysCover, priority, missingSizes, lowSizes, freshness, action };
}
