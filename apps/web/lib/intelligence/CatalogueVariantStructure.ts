export type CatalogueVariant = { id: string; productId: string; sourceVariantId: string; option1: string | null; option2: string | null; option3: string | null; sourceActive: boolean; availableForSale: boolean; available: number | null };
export type Structure = { state: "resolved"; sizePosition: 1 | 2 | 3; descriptorPosition: 1 | 2 | 3; variants: ResolvedVariant[] } | { state: "ambiguous"; variants: CatalogueVariant[] };
export type ResolvedVariant = CatalogueVariant & { size: string; descriptor: string; key: string };
export type ModelAttentionClass = "actionable" | "monitor" | "informational";
export type ModelAssessment = { key: string; descriptor: string; status: "accelerating" | "emerging" | "stable" | "cooling" | "insufficient_data"; confidence: "low" | "medium" | "high"; sold7: number; sold14: number; previous14: number; stock: number | null; daysCover: number | null; priority: "none" | "watch" | "medium" | "high" | "critical"; sizeRisks: string[]; stockImbalance: { weakStockShare: number; constrainedSizes: string[] } | null; attention: ModelAttentionClass; action: string };

const normalizeSize = (value: string | null) => {
  const v = value?.trim().toUpperCase().replace(/\s+/g, " ") ?? "";
  return ({ S: "S", SMALL: "S", M: "M", MEDIUM: "M", L: "L", LARGE: "L", XL: "XL", "X-LARGE": "XL", "EXTRA LARGE": "XL", XXL: "2XL", "2XL": "2XL", "2X": "2XL", XXXL: "3XL", "3XL": "3XL" } as Record<string, string>)[v] ?? null;
};
const option = (v: CatalogueVariant, position: 1 | 2 | 3) => position === 1 ? v.option1 : position === 2 ? v.option2 : v.option3;
const confidence = (now: number, before: number): "low" | "medium" | "high" => now + before >= 24 && Math.min(now, before) >= 6 ? "high" : now + before >= 12 && Math.min(now, before) >= 3 ? "medium" : "low";

export function resolveCatalogueVariantStructure(productId: string, variants: CatalogueVariant[]): Structure {
  const active = variants.filter((v) => v.sourceActive);
  const positions = ([1, 2, 3] as const).filter((p) => {
    const values = active.map((v) => option(v, p)).filter((v): v is string => Boolean(v?.trim()));
    return values.length > 0 && values.every((v) => normalizeSize(v) !== null);
  });
  if (positions.length !== 1) return { state: "ambiguous", variants: active };
  const sizePosition = positions[0];
  const descriptors = ([1, 2, 3] as const).filter((p) => p !== sizePosition && active.some((v) => Boolean(option(v, p)?.trim())));
  if (descriptors.length !== 1) return { state: "ambiguous", variants: active };
  const descriptorPosition = descriptors[0];
  return { state: "resolved", sizePosition, descriptorPosition, variants: active.map((v) => {
    const descriptor = option(v, descriptorPosition)!.trim();
    return { ...v, size: normalizeSize(option(v, sizePosition))!, descriptor, key: `${productId}:${descriptorPosition}:${descriptor.toLocaleLowerCase("en-GB")}` };
  }) };
}

export function assessModels(structure: Structure, sales: Map<string, { sold7: number; sold14: number; previous14: number }>, freshness: "current" | "stale" | "unavailable", queryFailed = false): ModelAssessment[] {
  if (structure.state !== "resolved") return [];
  const groups = new Map<string, ResolvedVariant[]>(); for (const v of structure.variants) groups.set(v.key, [...(groups.get(v.key) ?? []), v]);
  return [...groups.entries()].map(([key, variants]) => {
    const demand = variants.reduce((a, v) => { const s = sales.get(v.sourceVariantId) ?? { sold7: 0, sold14: 0, previous14: 0 }; return { sold7: a.sold7 + s.sold7, sold14: a.sold14 + s.sold14, previous14: a.previous14 + s.previous14 }; }, { sold7: 0, sold14: 0, previous14: 0 });
    const c = confidence(demand.sold14, demand.previous14); const status = demand.previous14 === 0 && demand.sold14 > 0 ? "emerging" : demand.sold14 + demand.previous14 < 6 || c === "low" ? "insufficient_data" : demand.sold14 / demand.previous14 >= 1.25 ? "accelerating" : demand.sold14 / demand.previous14 <= .75 ? "cooling" : "stable";
    const incomplete = queryFailed || variants.some((v) => v.available === null); const stock = incomplete ? null : variants.filter((v) => v.availableForSale).reduce((n, v) => n + (v.available ?? 0), 0); const daysCover = stock !== null && freshness === "current" && demand.sold14 > 0 ? Math.round(stock / (demand.sold14 / 14) * 10) / 10 : null;
    const sizeRisks = variants.filter((v) => v.available === 0 && (sales.get(v.sourceVariantId)?.sold14 ?? 0) >= 3).map((v) => `${v.size} sold out`);
    const sizePositions = variants.map((v) => ({ variant: v, demand: sales.get(v.sourceVariantId)?.sold14 ?? 0, sellable: v.availableForSale ? (v.available ?? 0) : 0 }));
    const constrainedSizes = sizePositions.filter((s) => s.demand >= 3 && s.sellable <= 1).map((s) => s.variant.size);
    const weakStock = sizePositions.filter((s) => s.demand <= 1).reduce((total, s) => total + s.sellable, 0);
    const weakStockShare = stock && stock > 0 ? weakStock / stock : 0;
    const stockImbalance = !incomplete && constrainedSizes.length > 0 && weakStockShare >= .5 ? { weakStockShare: Math.round(weakStockShare * 100), constrainedSizes } : null;
    const credible = c !== "low" && !["emerging", "insufficient_data"].includes(status) && demand.sold14 >= 6; let priority: ModelAssessment["priority"] = "none";
    if (incomplete || freshness !== "current") priority = "watch"; else if (credible && (sizeRisks.length || (daysCover !== null && daysCover <= 7))) priority = "critical"; else if (credible && daysCover !== null && daysCover <= 14) priority = "high"; else if (demand.sold14 >= 3 && daysCover !== null && daysCover <= 28 && status !== "cooling") priority = "medium"; else if (status === "emerging" || status === "insufficient_data" || sizeRisks.length || daysCover === null || (daysCover !== null && daysCover <= 45)) priority = "watch";
    if (stockImbalance && priority === "none") priority = "watch";
    if (status === "cooling" && priority !== "critical") priority = daysCover !== null && daysCover <= 28 ? "watch" : stockImbalance ? "watch" : "none";
    const explicitRisk = sizeRisks.length > 0 || stockImbalance !== null;
    const attention: ModelAttentionClass = priority === "medium" || priority === "high" || priority === "critical" || (priority === "watch" && explicitRisk)
      ? "actionable"
      : demand.sold14 === 0 && !explicitRisk && stock !== null && freshness === "current"
        ? "informational"
        : "monitor";
    return { key, descriptor: variants[0].descriptor, status, confidence: c, ...demand, stock, daysCover, priority, sizeRisks, stockImbalance, attention, action: priority === "high" || priority === "critical" || priority === "medium" ? "Review Purchase Intelligence for verified reorder quantity." : priority === "watch" ? "Monitor stock and demand before increasing purchasing." : "No immediate reorder — adequate stock cover." };
  });
}

export function summarizeModelAttention(models: ModelAssessment[]) {
  const summary = { actionableModelCount: 0, monitorModelCount: 0, informationalModelCount: 0 };
  for (const model of models) {
    if (model.attention === "actionable") summary.actionableModelCount += 1;
    else if (model.attention === "monitor") summary.monitorModelCount += 1;
    else summary.informationalModelCount += 1;
  }
  return summary;
}
