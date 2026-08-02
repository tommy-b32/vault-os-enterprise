import type {
  CatalogueDetectedGarment,
  CatalogueMultiProductDetection,
  CatalogueProductGroup,
} from "@/lib/supplier/catalogue-analysis-types";

type BuildDetectionInput = {
  group: CatalogueProductGroup;
};

function createGarmentId(
  groupId: string,
  index: number,
): string {
  return `${groupId}-garment-${index + 1}`;
}

function createLabel(
  group: CatalogueProductGroup,
  index: number,
): string {
  const parts = [
    group.colour,
    group.garmentType ??
      group.productType,
    group.brand,
  ].filter(
    (value): value is string =>
      Boolean(value?.trim()),
  );

  if (parts.length > 0) {
    return parts.join(" ");
  }

  return `Detected garment ${index + 1}`;
}

function buildFallbackGarments(
  group: CatalogueProductGroup,
  detectedCount: number,
): CatalogueDetectedGarment[] {
  return Array.from(
    {
      length:
        detectedCount,
    },
    (_, index) => {
      const width =
        1 / detectedCount;

      return {
        id:
          createGarmentId(
            group.id,
            index,
          ),

        pageNumber:
          group.startPage,

        label:
          createLabel(
            group,
            index,
          ),

        brand:
          group.brand,

        productType:
          group.productType,

        garmentType:
          group.garmentType,

        colour:
          group.colour,

        secondaryColours:
          group.secondaryColours,

        boundingBox: {
          x:
            index * width,

          y:
            0,

          width,

          height:
            1,
        },

        confidence:
          Math.max(
            50,
            group.confidence,
          ),

        status:
          "detected",

        childReviewCardId:
          null,

        childProductGroupId:
          null,

        warnings: [
          "Temporary crop generated from an estimated horizontal split.",
        ],
      };
    },
  );
}

function estimateDetectedCount(
  group: CatalogueProductGroup,
): number {
  const warningText =
    group.warnings
      .join(" ")
      .toLowerCase();

  const fingerprintText =
    group.visualFingerprint
      .join(" ")
      .toLowerCase();

  const rawText =
    group.rawVisibleText
      .join(" ")
      .toLowerCase();

  const combined =
    `${warningText} ${fingerprintText} ${rawText}`;

  const explicitCount =
    combined.match(
      /\b([2-9])\s+(?:products|garments|tees|t-shirts|shirts|items)\b/,
    );

  if (explicitCount) {
    return Number(
      explicitCount[1],
    );
  }

  const multiProductSignals = [
    "multiple products",
    "multiple garments",
    "two garments",
    "two products",
    "side by side",
    "left garment",
    "right garment",
    "black tee and white tee",
    "black and white tees",
  ];

  const hasSignal =
    multiProductSignals.some(
      (signal) =>
        combined.includes(signal),
    );

  return hasSignal
    ? 2
    : 1;
}

export const MultiProductDetectionEngine = {
  analyseGroup(
    input: BuildDetectionInput,
  ): CatalogueMultiProductDetection {
    const detectedCount =
      estimateDetectedCount(
        input.group,
      );

    const isMultiProduct =
      detectedCount > 1;

    return {
      isMultiProduct,

      detectedCount,

      confidence:
        isMultiProduct
          ? Math.max(
              60,
              input.group.confidence,
            )
          : input.group.confidence,

      garments:
        isMultiProduct
          ? buildFallbackGarments(
              input.group,
              detectedCount,
            )
          : [],

      splitStatus:
        isMultiProduct
          ? "available"
          : "not-required",

      childReviewCardIds:
        [],

      detectedAt:
        new Date().toISOString(),

      splitAt:
        null,

      error:
        null,
    };
  },
} as const;