export type CanonicalVariantIdentity = {
  id: string;
  source_variant_id: string;
};

export type ShopifyVariantIdentity = {
  id: string;
};

export function findStaleCanonicalVariantIds(
  canonicalVariants: CanonicalVariantIdentity[],
  shopifyVariants: ShopifyVariantIdentity[],
): string[] {
  const currentSourceIds = new Set(shopifyVariants.map((variant) => variant.id));
  return canonicalVariants
    .filter((variant) => !currentSourceIds.has(variant.source_variant_id))
    .map((variant) => variant.id);
}

export function classifyCatalogueWrites(
  currentIds: string[],
  incomingIds: string[],
): { created: number; updated: number } {
  const current = new Set(currentIds);
  return incomingIds.reduce((counts, id) => {
    if (current.has(id)) counts.updated += 1;
    else counts.created += 1;
    return counts;
  }, { created: 0, updated: 0 });
}
