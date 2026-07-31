import {
  CatalogueMatchingEngine,
  type CatalogueMatchingResult,
} from "@/lib/brain/CatalogueMatchingEngine";

import type {
  CatalogueAnalysisSession,
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
};

function createSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

export const CatalogueReviewQueueEngine = {
  buildQueue({
    session,
    extractionResult,
    details,
    products,
  }: BuildQueueInput): CatalogueReviewQueueItem[] {
    const cards =
      session.productGroups.map((group) =>
        buildCard({
          group,
          session,
          extractionResult,
          details,
        }),
      );

    const matches =
      CatalogueMatchingEngine.matchCatalogue({
        cards,
        products,
      });

    const matchesByCardId =
      new Map(
        matches.map((match) => [
          match.catalogueCardId,
          match,
        ]),
      );

    return cards.map((card) => ({
      card,

      match:
        matchesByCardId.get(card.id) ?? {
          catalogueCardId: card.id,
          bestMatch: null,
          alternatives: [],
          requiresReview: true,
          status: "unmatched",
        },
    }));
  },
} as const;