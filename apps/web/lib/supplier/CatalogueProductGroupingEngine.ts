import type {
  CatalogueAnalysisSession,
  CataloguePageAnalysisRecord,
  CatalogueProductGroup,
} from "@/lib/supplier/catalogue-analysis-types";

import type {
  CataloguePageGarmentExtraction,
} from "@/lib/ai/extractCataloguePage";

type GroupingCandidate = {
  pageNumber: number;
  record: CataloguePageAnalysisRecord;
};

function createId(
  startPage: number,
  endPage: number,
  garmentId?: string | null,
): string {
  const baseId =
    `catalogue-product-${startPage}-${endPage}`;

  return garmentId
    ? `${baseId}-${garmentId}`
    : baseId;
}

function normaliseText(
  value: string | null | undefined,
): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

function calculateTextSimilarity(
  left: string | null,
  right: string | null,
): number {
  const normalisedLeft =
    normaliseText(left);

  const normalisedRight =
    normaliseText(right);

  if (
    !normalisedLeft ||
    !normalisedRight
  ) {
    return 0;
  }

  if (
    normalisedLeft ===
    normalisedRight
  ) {
    return 100;
  }

  const leftWords =
    new Set(
      normalisedLeft.split(" "),
    );

  const rightWords =
    new Set(
      normalisedRight.split(" "),
    );

  const sharedWords =
    [...leftWords].filter(
      (word) =>
        rightWords.has(word),
    );

  const totalWords =
    new Set([
      ...leftWords,
      ...rightWords,
    ]).size;

  if (totalWords === 0) {
    return 0;
  }

  return Math.round(
    (sharedWords.length /
      totalWords) *
      100,
  );
}

function valuesMatch(
  left: string | null,
  right: string | null,
): boolean {
  const normalisedLeft =
    normaliseText(left);

  const normalisedRight =
    normaliseText(right);

  return (
    normalisedLeft.length > 0 &&
    normalisedRight.length > 0 &&
    normalisedLeft ===
      normalisedRight
  );
}

function shouldJoinPreviousGroup({
  previous,
  current,
}: {
  previous: CataloguePageAnalysisRecord;
  current: CataloguePageAnalysisRecord;
}): boolean {
  const previousExtraction =
    previous.extraction;

  const currentExtraction =
    current.extraction;

  if (
    !previousExtraction ||
    !currentExtraction
  ) {
    return false;
  }

  if (
    current.pageNumber !==
    previous.pageNumber + 1
  ) {
    return false;
  }

  if (
    currentExtraction
      .possibleSameProductAsPreviousPage
  ) {
    return true;
  }

  const sameBrand =
    valuesMatch(
      previousExtraction.brand,
      currentExtraction.brand,
    );

  const sameColour =
    valuesMatch(
      previousExtraction.colour,
      currentExtraction.colour,
    );

  const sameProductType =
    valuesMatch(
      previousExtraction.productType,
      currentExtraction.productType,
    );

  const nameSimilarity =
    calculateTextSimilarity(
      previousExtraction.productName,
      currentExtraction.productName,
    );

  const currentIsSupportingPage =
    [
      "detail",
      "label",
      "supplier-product",
    ].includes(
      currentExtraction.pageRole,
    );

  if (
    sameBrand &&
    nameSimilarity >= 65
  ) {
    return true;
  }

  if (
    sameBrand &&
    sameColour &&
    sameProductType &&
    currentIsSupportingPage
  ) {
    return true;
  }

  return false;
}

function getMostFrequentValue(
  values: Array<
    string | null | undefined
  >,
): string | null {
  const counts =
    new Map<string, number>();

  const originals =
    new Map<string, string>();

  for (const value of values) {
    if (!value?.trim()) {
      continue;
    }

    const key =
      normaliseText(value);

    if (!key) {
      continue;
    }

    counts.set(
      key,
      (counts.get(key) ?? 0) + 1,
    );

    if (!originals.has(key)) {
      originals.set(
        key,
        value.trim(),
      );
    }
  }

  const winner =
    [...counts.entries()]
      .sort(
        (a, b) =>
          b[1] - a[1],
      )[0];

  if (!winner) {
    return null;
  }

  return (
    originals.get(
      winner[0],
    ) ?? null
  );
}

function getFirstNumber(
  values: Array<
    number | null | undefined
  >,
): number | null {
  return (
    values.find(
      (value): value is number =>
        typeof value === "number" &&
        Number.isFinite(value),
    ) ?? null
  );
}

function getUniqueStrings(
  values: string[],
): string[] {
  const seen =
    new Set<string>();

  const result: string[] = [];

  for (const value of values) {
    const cleaned =
      value.trim();

    if (!cleaned) {
      continue;
    }

    const key =
      normaliseText(cleaned);

    if (
      !key ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function createGarmentGroup({
  candidate,
  garment,
  garmentIndex,
}: {
  candidate: GroupingCandidate;
  garment: CataloguePageGarmentExtraction;
  garmentIndex: number;
}): CatalogueProductGroup {
  const extraction =
    candidate.record.extraction;

  if (!extraction) {
    throw new Error(
      "A completed catalogue page extraction is required.",
    );
  }

  const pageNumber =
    candidate.pageNumber;

  const garmentId =
    garment.id ||
    `page-${pageNumber}-garment-${garmentIndex + 1}`;

  const warnings =
    getUniqueStrings([
      ...extraction.warnings,
      ...garment.warnings,
      `Created from garment ${garmentIndex + 1} of ${extraction.garments.length} detected on page ${pageNumber}.`,
    ]);

  return {
    id:
      createId(
        pageNumber,
        pageNumber,
        garmentId,
      ),

    startPage:
      pageNumber,

    endPage:
      pageNumber,

    pageNumbers: [
      pageNumber,
    ],

    brand:
      garment.brand ??
      extraction.brand,

    productName:
      garment.productName ??
      extraction.productName ??
      `Garment ${garmentIndex + 1}`,

    productType:
      garment.productType ??
      garment.garmentType ??
      extraction.productType,

    garmentType:
      garment.garmentType ??
      garment.productType ??
      extraction.garmentType,

    colour:
      garment.colour ??
      extraction.colour,

    secondaryColours:
      getUniqueStrings([
        ...garment.secondaryColours,
        ...extraction.secondaryColours,
      ]),

    chestLogo:
      garment.chestLogo ??
      extraction.chestLogo,

    frontGraphic:
      garment.frontGraphic ??
      extraction.frontGraphic,

    backGraphic:
      garment.backGraphic ??
      extraction.backGraphic,

    sleeveDetail:
      garment.sleeveDetail ??
      extraction.sleeveDetail,

    neckLabel:
      garment.neckLabel ??
      extraction.neckLabel,

    fit:
      extraction.fit,

    collection:
      extraction.collection,

    visualFingerprint:
      getUniqueStrings([
        ...garment.visualFingerprint,
        ...extraction.visualFingerprint,
      ]),

    rawVisibleText:
      extraction.rawVisibleText,

    displayedPrice:
      extraction.displayedPrice,

    currency:
      extraction.currency,

    supplierSku:
      extraction.supplierSku
        ? `${extraction.supplierSku}-${garmentIndex + 1}`
        : null,

    sizes:
      extraction.sizes,

    packQuantity:
      extraction.packQuantity,

    confidence:
      garment.confidence,

    status:
      garment.confidence >= 85
        ? "confirmed"
        : "requires-review",

    warnings,

    sourceDetectedGarmentId:
      garmentId,

    parentProductGroupId:
      createId(
        pageNumber,
        pageNumber,
      ),

    cropBoundingBox:
      garment.boundingBox,

    isSplitChild:
      true,
  };
}

function createGroups(
  candidates: GroupingCandidate[],
): CatalogueProductGroup[] {
  /*
   * Safe first implementation:
   * split only a single analysed page containing multiple
   * garments. Existing multi-page grouping remains unchanged
   * until supporting-page attachment is introduced.
   */
  if (candidates.length === 1) {
    const candidate =
      candidates[0];

    const garments =
      candidate.record.extraction?.garments ??
      [];

    if (garments.length > 1) {
      return garments.map(
        (
          garment,
          garmentIndex,
        ) =>
          createGarmentGroup({
            candidate,
            garment,
            garmentIndex,
          }),
      );
    }
  }

  return [
    createGroup(
      candidates,
    ),
  ];
}

function createGroup(
  candidates: GroupingCandidate[],
): CatalogueProductGroup {
  const extractions =
    candidates
      .map(
        (candidate) =>
          candidate.record.extraction,
      )
      .filter(
        (
          extraction,
        ): extraction is NonNullable<
          CataloguePageAnalysisRecord["extraction"]
        > =>
          extraction !== null,
      );

  const pageNumbers =
    candidates.map(
      (candidate) =>
        candidate.pageNumber,
    );

  const warnings =
    getUniqueStrings(
      extractions.flatMap(
        (extraction) =>
          extraction.warnings,
      ),
    );

  const confidence =
    extractions.length > 0
      ? Math.round(
          extractions.reduce(
            (total, extraction) =>
              total +
              extraction.confidence,
            0,
          ) /
            extractions.length,
        )
      : 0;

  const startPage =
    Math.min(...pageNumbers);

  const endPage =
    Math.max(...pageNumbers);

  return {
    id:
      createId(
        startPage,
        endPage,
      ),

    startPage,
    endPage,
    pageNumbers,

    brand:
      getMostFrequentValue(
        extractions.map(
          (extraction) =>
            extraction.brand,
        ),
      ),

    productName:
      getMostFrequentValue(
        extractions.map(
          (extraction) =>
            extraction.productName,
        ),
      ),

    productType:
      getMostFrequentValue(
        extractions.map(
          (extraction) =>
            extraction.productType,
        ),
      ),

    garmentType:
      getMostFrequentValue(
        extractions.map(
          (extraction) =>
            extraction.garmentType,
        ),
      ),

    colour:
      getMostFrequentValue(
        extractions.map(
          (extraction) =>
            extraction.colour,
        ),
      ),

    secondaryColours:
      getUniqueStrings(
        extractions.flatMap(
          (extraction) =>
            extraction.secondaryColours,
        ),
      ),

    chestLogo:
      getMostFrequentValue(
        extractions.map(
          (extraction) =>
            extraction.chestLogo,
        ),
      ),

    frontGraphic:
      getMostFrequentValue(
        extractions.map(
          (extraction) =>
            extraction.frontGraphic,
        ),
      ),

    backGraphic:
      getMostFrequentValue(
        extractions.map(
          (extraction) =>
            extraction.backGraphic,
        ),
      ),

    sleeveDetail:
      getMostFrequentValue(
        extractions.map(
          (extraction) =>
            extraction.sleeveDetail,
        ),
      ),

    neckLabel:
      getMostFrequentValue(
        extractions.map(
          (extraction) =>
            extraction.neckLabel,
        ),
      ),

    fit:
      getMostFrequentValue(
        extractions.map(
          (extraction) =>
            extraction.fit,
        ),
      ),

    collection:
      getMostFrequentValue(
        extractions.map(
          (extraction) =>
            extraction.collection,
        ),
      ),

    visualFingerprint:
      getUniqueStrings(
        extractions.flatMap(
          (extraction) =>
            extraction.visualFingerprint,
        ),
      ),

    rawVisibleText:
      getUniqueStrings(
        extractions.flatMap(
          (extraction) =>
            extraction.rawVisibleText,
        ),
      ),

    displayedPrice:
      getFirstNumber(
        extractions.map(
          (extraction) =>
            extraction.displayedPrice,
        ),
      ),

    currency:
      getMostFrequentValue(
        extractions.map(
          (extraction) =>
            extraction.currency,
        ),
      ),

    supplierSku:
      getMostFrequentValue(
        extractions.map(
          (extraction) =>
            extraction.supplierSku,
        ),
      ),

    sizes:
      getUniqueStrings(
        extractions.flatMap(
          (extraction) =>
            extraction.sizes,
        ),
      ),

    packQuantity:
      getFirstNumber(
        extractions.map(
          (extraction) =>
            extraction.packQuantity,
        ),
      ),

    confidence,

    status:
      confidence >= 85
        ? "confirmed"
        : "requires-review",

    warnings,
  };
}

export const CatalogueProductGroupingEngine = {
  groupSession(
    session: CatalogueAnalysisSession,
  ): CatalogueAnalysisSession {
    const completedCandidates =
      Object.values(
        session.pages,
      )
        .filter(
          (record) =>
            record.status ===
              "complete" &&
            record.extraction !==
              null,
        )
        .sort(
          (a, b) =>
            a.pageNumber -
            b.pageNumber,
        )
        .map((record) => ({
          pageNumber:
            record.pageNumber,
          record,
        }));

    if (
      completedCandidates.length ===
      0
    ) {
      return {
        ...session,
        productGroups: [],
      };
    }

    const groupedCandidates:
      GroupingCandidate[][] = [];

    for (
      const candidate of
        completedCandidates
    ) {
      const currentGroup =
        groupedCandidates[
          groupedCandidates.length -
            1
        ];

      if (!currentGroup) {
        groupedCandidates.push([
          candidate,
        ]);

        continue;
      }

      const previousCandidate =
        currentGroup[
          currentGroup.length - 1
        ];

      if (
        shouldJoinPreviousGroup({
          previous:
            previousCandidate.record,

          current:
            candidate.record,
        })
      ) {
        currentGroup.push(
          candidate,
        );
      } else {
        groupedCandidates.push([
          candidate,
        ]);
      }
    }

    return {
      ...session,

      productGroups:
        groupedCandidates.flatMap(
          (group) =>
            createGroups(group),
        ),
    };
  },
} as const;