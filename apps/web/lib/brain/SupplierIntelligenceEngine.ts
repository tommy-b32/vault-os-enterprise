import type {
  ProductSupplierComparison,
  ProductSupplierSource,
  SupplierProfile,
  SupplierSourceScore,
} from "@/types/suppliers";

const COST_WEIGHT = 0.4;
const LEAD_TIME_WEIGHT = 0.25;
const RELIABILITY_WEIGHT = 0.3;
const PREFERRED_BONUS = 5;

function clampScore(
  value: number,
): number {
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(value),
    ),
  );
}

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

  return (
    source.packCost /
    source.unitsPerPack
  );
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
    if (
      a.isPreferred ===
      b.isPreferred
    ) {
      return a.supplierName.localeCompare(
        b.supplierName,
      );
    }

    return a.isPreferred
      ? -1
      : 1;
  });
}

function findSupplierProfile(
  source: ProductSupplierSource,
  supplierProfiles: SupplierProfile[],
): SupplierProfile | null {
  return (
    supplierProfiles.find(
      (profile) =>
        profile.id ===
        source.supplierId,
    ) ??
    null
  );
}

function calculateRelativeScore({
  value,
  bestValue,
}: {
  value: number;
  bestValue: number;
}): number | null {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(bestValue)
  ) {
    return null;
  }

  if (value === 0) {
    return bestValue === 0
      ? 100
      : null;
  }

  return clampScore(
    (
      bestValue /
      value
    ) *
      100,
  );
}

function calculateOverallScore({
  costScore,
  leadTimeScore,
  reliabilityScore,
  isPreferred,
}: {
  costScore: number | null;
  leadTimeScore: number | null;
  reliabilityScore: number | null;
  isPreferred: boolean;
}): number {
  const weightedValues = [
    {
      score:
        costScore,
      weight:
        COST_WEIGHT,
    },
    {
      score:
        leadTimeScore,
      weight:
        LEAD_TIME_WEIGHT,
    },
    {
      score:
        reliabilityScore,
      weight:
        RELIABILITY_WEIGHT,
    },
  ].filter(
    (
      entry,
    ): entry is {
      score: number;
      weight: number;
    } =>
      entry.score !== null,
  );

  if (
    weightedValues.length === 0
  ) {
    return isPreferred
      ? PREFERRED_BONUS
      : 0;
  }

  const totalWeight =
    weightedValues.reduce(
      (total, entry) =>
        total +
        entry.weight,
      0,
    );

  const weightedScore =
    weightedValues.reduce(
      (total, entry) =>
        total +
        entry.score *
          entry.weight,
      0,
    ) /
    totalWeight;

  return clampScore(
    weightedScore +
      (
        isPreferred
          ? PREFERRED_BONUS
          : 0
      ),
  );
}

function buildReason({
  source,
  score,
  cheapestSource,
  fastestSource,
  preferredSource,
}: {
  source: ProductSupplierSource;
  score: SupplierSourceScore;
  cheapestSource: ProductSupplierSource | null;
  fastestSource: ProductSupplierSource | null;
  preferredSource: ProductSupplierSource | null;
}): string {
  const reasons: string[] = [];

  if (
    cheapestSource?.id ===
    source.id
  ) {
    reasons.push(
      "lowest comparable unit cost",
    );
  }

  if (
    fastestSource?.id ===
    source.id
  ) {
    reasons.push(
      "fastest lead time",
    );
  }

  if (
    score.reliabilityScore !== null &&
    score.reliabilityScore >= 80
  ) {
    reasons.push(
      "strong reliability",
    );
  }

  if (
    preferredSource?.id ===
    source.id
  ) {
    reasons.push(
      "currently preferred",
    );
  }

  if (
    reasons.length === 0
  ) {
    return (
      "Balanced supplier score based on the available cost, lead-time and reliability data."
    );
  }

  return (
    `Recommended for ${reasons.join(
      ", ",
    )}.`
  );
}

function buildSourceScores({
  sources,
  supplierProfiles,
  cheapestSource,
  fastestSource,
  preferredSource,
}: {
  sources: ProductSupplierSource[];
  supplierProfiles: SupplierProfile[];
  cheapestSource: ProductSupplierSource | null;
  fastestSource: ProductSupplierSource | null;
  preferredSource: ProductSupplierSource | null;
}): SupplierSourceScore[] {
  const cheapestCost =
    cheapestSource
      ? getComparablePackCost(
          cheapestSource,
        )
      : Number.POSITIVE_INFINITY;

  const fastestLeadTime =
    fastestSource
      ? getLeadTime(
          fastestSource,
        )
      : Number.POSITIVE_INFINITY;

  const provisionalScores =
    sources.map(
      (source) => {
        const profile =
          findSupplierProfile(
            source,
            supplierProfiles,
          );

        const costScore =
          calculateRelativeScore({
            value:
              getComparablePackCost(
                source,
              ),

            bestValue:
              cheapestCost,
          });

        const leadTimeScore =
          calculateRelativeScore({
            value:
              getLeadTime(
                source,
              ),

            bestValue:
              fastestLeadTime,
          });

        const reliabilityScore =
          profile?.reliabilityScore !==
            null &&
          profile?.reliabilityScore !==
            undefined
            ? clampScore(
                profile.reliabilityScore,
              )
            : null;

        const overallScore =
          calculateOverallScore({
            costScore,
            leadTimeScore,
            reliabilityScore,
            isPreferred:
              source.isPreferred,
          });

        return {
          supplierId:
            source.supplierId,

          supplierName:
            source.supplierName,

          overallScore,

          costScore,

          leadTimeScore,

          reliabilityScore,

          recommended: false,

          reason: "",
        };
      },
    );

  const highestScore =
    provisionalScores.reduce(
      (best, score) =>
        Math.max(
          best,
          score.overallScore,
        ),
      0,
    );

  return provisionalScores.map(
    (score) => {
      const source =
        sources.find(
          (candidate) =>
            candidate.supplierId === score.supplierId,
        );

      if (!source) {
        return score;
      }

      const recommended =
        score.overallScore ===
          highestScore &&
        highestScore > 0;

      const result = {
        ...score,
        recommended,
      };

      return {
        ...result,

        reason:
          buildReason({
            source,
            score: result,
            cheapestSource,
            fastestSource,
            preferredSource,
          }),
      };
    },
  );
}

export const SupplierIntelligenceEngine = {
  compareProductSources({
    productId,
    sources,
    supplierProfiles = [],
  }: {
    productId: string;
    sources: ProductSupplierSource[];
    supplierProfiles?: SupplierProfile[];
  }): ProductSupplierComparison {
    const activeSources =
      sources.filter(
        (source) =>
          source.productId ===
            productId &&
          source.isActive,
      );

    const orderedSources =
      sortByPreferred(
        activeSources,
      );

    const preferredSource =
      orderedSources.find(
        (source) =>
          source.isPreferred,
      ) ??
      null;

    const cheapestSource =
      [...activeSources]
        .filter(
          (source) =>
            Number.isFinite(
              getComparablePackCost(
                source,
              ),
            ),
        )
        .sort(
          (a, b) =>
            getComparablePackCost(
              a,
            ) -
            getComparablePackCost(
              b,
            ),
        )[0] ??
      null;

    const fastestSource =
      [...activeSources]
        .filter(
          (source) =>
            Number.isFinite(
              getLeadTime(
                source,
              ),
            ),
        )
        .sort(
          (a, b) =>
            getLeadTime(a) -
            getLeadTime(b),
        )[0] ??
      null;

    const sourceScores =
      buildSourceScores({
        sources:
          orderedSources,

        supplierProfiles,

        cheapestSource,

        fastestSource,

        preferredSource,
      });

    const recommendedScore =
      [...sourceScores].sort(
        (a, b) =>
          b.overallScore -
          a.overallScore,
      )[0] ??
      null;

    const recommendedSource =
      recommendedScore
        ? orderedSources.find(
            (source) =>
              source.supplierId === recommendedScore.supplierId,
          ) ??
          null
        : null;

    return {
      productId,

      sources:
        orderedSources,

      preferredSource,

      cheapestSource,

      fastestSource,

      sourceScores,

      recommendedSource,
    };
  },

  compareCatalogueSources({
    sources,
    supplierProfiles = [],
  }: {
    sources:
      ProductSupplierSource[];

    supplierProfiles?:
      SupplierProfile[];
  }): ProductSupplierComparison[] {
    const productIds =
      Array.from(
        new Set(
          sources.map(
            (source) =>
              source.productId,
          ),
        ),
      );

    return productIds.map(
      (productId) =>
        SupplierIntelligenceEngine.compareProductSources({
          productId,

          sources,

          supplierProfiles,
        }),
    );
  },
} as const;
