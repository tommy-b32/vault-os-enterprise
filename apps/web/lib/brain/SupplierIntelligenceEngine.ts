import type {
  ProductSupplierComparison,
  ProductSupplierSource,
} from "@/types/suppliers";

function getComparablePackCost(
  source: ProductSupplierSource,
): number {
  if (
    source.packCost === null ||
    source.unitsPerPack === null ||
    source.unitsPerPack <= 0
  ) {
    return Number.POSITIVE_INFINITY;
  }

  return source.packCost / source.unitsPerPack;
}

function getLeadTime(
  source: ProductSupplierSource,
): number {
  if (
    source.leadTimeDays === null ||
    source.leadTimeDays < 0
  ) {
    return Number.POSITIVE_INFINITY;
  }

  return source.leadTimeDays;
}

function sortByPreferred(
  sources: ProductSupplierSource[],
): ProductSupplierSource[] {
  return [...sources].sort((a, b) => {
    if (a.isPreferred === b.isPreferred) {
      return a.supplierName.localeCompare(
        b.supplierName,
      );
    }

    return a.isPreferred ? -1 : 1;
  });
}

export const SupplierIntelligenceEngine = {
  compareProductSources({
    productId,
    sources,
  }: {
    productId: string;
    sources: ProductSupplierSource[];
  }): ProductSupplierComparison {
    const activeSources = sources.filter(
      (source) =>
        source.productId === productId &&
        source.isActive,
    );

    const orderedSources =
      sortByPreferred(activeSources);

    const preferredSource =
      orderedSources.find(
        (source) => source.isPreferred,
      ) ?? null;

    const cheapestSource =
      [...activeSources]
        .filter(
          (source) =>
            Number.isFinite(
              getComparablePackCost(source),
            ),
        )
        .sort(
          (a, b) =>
            getComparablePackCost(a) -
            getComparablePackCost(b),
        )[0] ?? null;

    const fastestSource =
      [...activeSources]
        .filter((source) =>
          Number.isFinite(getLeadTime(source)),
        )
        .sort(
          (a, b) =>
            getLeadTime(a) -
            getLeadTime(b),
        )[0] ?? null;

    return {
      productId,
      sources: orderedSources,
      preferredSource,
      cheapestSource,
      fastestSource,
    };
  },

  compareCatalogueSources({
    sources,
  }: {
    sources: ProductSupplierSource[];
  }): ProductSupplierComparison[] {
    const productIds = Array.from(
      new Set(
        sources.map((source) => source.productId),
      ),
    );

    return productIds.map((productId) =>
      SupplierIntelligenceEngine.compareProductSources({
        productId,
        sources,
      }),
    );
  },
};