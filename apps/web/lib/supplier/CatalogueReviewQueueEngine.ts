import {
  CatalogueMatchingEngine,
  type CatalogueMatchingResult,
} from "@/lib/brain/CatalogueMatchingEngine";

import type {
  VaultProductMemory,
} from "@/lib/brain/VaultMemoryRepository";

import {
  MultiProductDetectionEngine,
} from "@/lib/supplier/MultiProductDetectionEngine";

import type {
  CatalogueAnalysisSession,
  CatalogueMultiProductDetection,
  CatalogueProductGroup,
} from "@/lib/supplier/catalogue-analysis-types";

import type {
  SupplierExtractionResult,
} from "@/lib/supplier/types";

import type {
  CatalogueProduct,
} from "@/types/catalogue";

import type {
  SupplierCatalogueCardData,
  SupplierCatalogueImage,
} from "@/types/supplier-catalogue";

export type CatalogueReviewQueueItem = {
  card: SupplierCatalogueCardData;
  match: CatalogueMatchingResult;
  memory: VaultProductMemory | null;
  multiProductDetection: CatalogueMultiProductDetection;
};

export type CatalogueReviewQueueDetails = {
  supplierName: string;
  collectionName: string;
  catalogueType:
    | "products"
    | "footwear"
    | "accessories";
  leadTimeDays: number | null;
};

type BuildQueueInput = {
  session: CatalogueAnalysisSession;
  extractionResult: SupplierExtractionResult;
  details: CatalogueReviewQueueDetails;
  products: CatalogueProduct[];
  memories?: VaultProductMemory[];
};

type QueueCandidate = {
  group: CatalogueProductGroup;
  card: SupplierCatalogueCardData;
  multiProductDetection: CatalogueMultiProductDetection;
};

function createSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normaliseText(
  value: string | null | undefined,
): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getImageRole(
  session: CatalogueAnalysisSession,
  pageNumber: number,
): SupplierCatalogueImage["role"] {
  const role =
    session.pages[pageNumber]?.extraction?.pageRole;

  switch (role) {
    case "official-product":
      return "official";
    case "supplier-product":
      return "supplier";
    case "detail":
      return "detail";
    case "label":
      return "label";
    default:
      return "other";
  }
}

function buildImages({
  group,
  session,
  extractionResult,
}: {
  group: CatalogueProductGroup;
  session: CatalogueAnalysisSession;
  extractionResult: SupplierExtractionResult;
}): SupplierCatalogueImage[] {
  return group.pageNumbers.flatMap(
    (pageNumber) => {
      const page =
        extractionResult.pages.find(
          (candidate) =>
            candidate.pageNumber === pageNumber,
        );

      if (!page) {
        return [];
      }

      return page.images.map(
        (image, imageIndex) => ({
          id:
            `${group.id}-page-${pageNumber}-image-${imageIndex + 1}`,
          url: image.dataUrl,
          alt:
            `${group.productName ?? "Supplier product"} catalogue page ${pageNumber}`,
          role:
            getImageRole(
              session,
              pageNumber,
            ),
        }),
      );
    },
  );
}

function buildCard({
  group,
  session,
  extractionResult,
  details,
}: {
  group: CatalogueProductGroup;
  session: CatalogueAnalysisSession;
  extractionResult: SupplierExtractionResult;
  details: CatalogueReviewQueueDetails;
}): SupplierCatalogueCardData {
  const supplierSlug =
    createSlug(details.supplierName) ||
    "unassigned-supplier";

  const catalogueSlug =
    createSlug(details.collectionName) ||
    createSlug(extractionResult.document.fileName) ||
    extractionResult.document.id;

  const pageRange =
    group.startPage === group.endPage
      ? `Page ${group.startPage}`
      : `Pages ${group.startPage}-${group.endPage}`;

  return {
    id: group.id,
    supplierId: supplierSlug,
    supplierName: details.supplierName,
    catalogueId: catalogueSlug,
    catalogueName: details.collectionName,
    pageNumber: group.startPage,
    brand: group.brand,
    officialProductName: group.productName,
    internalReference:
      group.supplierSku ??
      `${details.supplierName} ${pageRange}`,
    colour: group.colour,
    packCost: null,
    packSize: group.packQuantity,
    currency: group.currency ?? "GBP",
    leadTimeDays: details.leadTimeDays,
    status: "review",
    linkedProductId: null,
    linkedProductName: null,
    isPreferredSource: false,
    images:
      buildImages({
        group,
        session,
        extractionResult,
      }),
    vision: {
      garmentType:
        group.garmentType ??
        group.productType,
      secondaryColours:
        group.secondaryColours,
      chestLogo:
        group.chestLogo,
      frontGraphic:
        group.frontGraphic,
      backGraphic:
        group.backGraphic,
      sleeveDetail:
        group.sleeveDetail,
      neckLabel:
        group.neckLabel,
      fit:
        group.fit,
      collection:
        group.collection,
      visualFingerprint:
        group.visualFingerprint,
      rawVisibleText:
        group.rawVisibleText,
      confidence:
        group.confidence,
    },
    notes: [
      `${pageRange} from ${details.collectionName}.`,
      `Vault Vision grouping confidence: ${group.confidence}%.`,
      group.productType
        ? `Detected product type: ${group.productType}.`
        : null,
      group.frontGraphic
        ? `Front graphic: ${group.frontGraphic}.`
        : null,
      group.chestLogo
        ? `Chest logo: ${group.chestLogo}.`
        : null,
      group.visualFingerprint.length > 0
        ? `Visual fingerprint: ${group.visualFingerprint.join(", ")}.`
        : null,
      group.warnings.length > 0
        ? `Warnings: ${group.warnings.join(" ")}`
        : null,
    ]
      .filter(
        (value): value is string =>
          value !== null,
      )
      .join(" "),
  };
}

function findRememberedMemory(
  card: SupplierCatalogueCardData,
  memories: VaultProductMemory[],
): VaultProductMemory | null {
  const supplierName =
    normaliseText(
      card.supplierName,
    );

  const supplierProductName =
    normaliseText(
      card.officialProductName ??
      card.internalReference,
    );

  const supplierReference =
    normaliseText(
      card.internalReference,
    );

  const supplierColour =
    normaliseText(
      card.colour,
    );

  const belongsToSupplier = (
    memory: VaultProductMemory,
  ): boolean =>
    normaliseText(
      memory.supplierName,
    ) === supplierName;

  const matchesColour = (
    memory: VaultProductMemory,
  ): boolean => {
    if (!supplierColour) {
      return true;
    }

    return normaliseText(
      memory.fabricVaultProductName,
    )
      .split(" ")
      .includes(
        supplierColour,
      );
  };

  const exactReferenceMatches =
    memories.filter(
      (memory) =>
        belongsToSupplier(memory) &&
        supplierReference.length > 0 &&
        normaliseText(
          memory.supplierReference,
        ) === supplierReference,
    );

  const colourSafeReferenceMatch =
    exactReferenceMatches.find(
      matchesColour,
    );

  if (colourSafeReferenceMatch) {
    return colourSafeReferenceMatch;
  }

  const productNameMatches =
    memories.filter(
      (memory) =>
        belongsToSupplier(memory) &&
        normaliseText(
          memory.supplierProductName,
        ) === supplierProductName,
    );

  const colourSafeProductMatch =
    productNameMatches.find(
      matchesColour,
    );

  if (colourSafeProductMatch) {
    return colourSafeProductMatch;
  }

  if (!supplierColour) {
    return (
      exactReferenceMatches[0] ??
      productNameMatches[0] ??
      null
    );
  }

  return null;
}

function buildRememberedMatch({
  card,
  memory,
  products,
}: {
  card: SupplierCatalogueCardData;
  memory: VaultProductMemory;
  products: CatalogueProduct[];
}): CatalogueMatchingResult | null {
  const product =
    products.find(
      (candidate) =>
        candidate.product_id ===
        memory.fabricVaultProductId,
    );

  if (!product) {
    return null;
  }

  return {
    catalogueCardId:
      card.id,
    bestMatch: {
      product,
      confidence: 100,
      signals: [
        {
          reason:
            "existing_mapping",
          label:
            `Known product · confirmed ${memory.acceptedCount} ${memory.acceptedCount === 1 ? "time" : "times"}`,
          score: 100,
        },
      ],
    },
    alternatives: [],
    requiresReview: true,
    status:
      "matched",
  };
}

function buildQueueCandidate({
  group,
  session,
  extractionResult,
  details,
}: {
  group: CatalogueProductGroup;
  session: CatalogueAnalysisSession;
  extractionResult: SupplierExtractionResult;
  details: CatalogueReviewQueueDetails;
}): QueueCandidate {
  const pageDetection =
    session.pages[
      group.startPage
    ]?.multiProductDetection ??
    null;

  return {
    group,
    card:
      buildCard({
        group,
        session,
        extractionResult,
        details,
      }),
    multiProductDetection:
      pageDetection ??
      MultiProductDetectionEngine.analyseGroup({
        group,
      }),
  };
}

export const CatalogueReviewQueueEngine = {
  buildQueue({
    session,
    extractionResult,
    details,
    products,
    memories = [],
  }: BuildQueueInput): CatalogueReviewQueueItem[] {
    const candidates =
      session.productGroups.map(
        (group) =>
          buildQueueCandidate({
            group,
            session,
            extractionResult,
            details,
          }),
      );

    const cards =
      candidates.map(
        (candidate) =>
          candidate.card,
      );

    const aiMatches =
      CatalogueMatchingEngine.matchCatalogue({
        cards,
        products,
      });

    const aiMatchesByCardId =
      new Map(
        aiMatches.map((match) => [
          match.catalogueCardId,
          match,
        ]),
      );

    return candidates.map(
      ({
        card,
        multiProductDetection,
      }) => {
        const memory =
          findRememberedMemory(
            card,
            memories,
          );

        const rememberedMatch =
          memory
            ? buildRememberedMatch({
                card,
                memory,
                products,
              })
            : null;

        return {
          card: rememberedMatch?.bestMatch
            ? {
                ...card,
                linkedProductId:
                  rememberedMatch.bestMatch.product.product_id,
                linkedProductName:
                  rememberedMatch.bestMatch.product.product_name,
              }
            : card,

          match:
            rememberedMatch ??
            aiMatchesByCardId.get(card.id) ?? {
              catalogueCardId: card.id,
              bestMatch: null,
              alternatives: [],
              requiresReview: true,
              status: "unmatched",
            },

          memory:
            rememberedMatch
              ? memory
              : null,

          multiProductDetection,
        };
      },
    );
  },
} as const;