import type {
  SupplierCatalogueCardData,
} from "@/types/supplier-catalogue";

import type {
  CatalogueVisionData,
} from "@/types/catalogue-vision";

function clean(
  value: string | null | undefined,
): string | null {
  return value?.trim() || null;
}

function uniqueStrings(
  values: string[],
): string[] {
  return Array.from(
    new Set(
      values
        .map((value) =>
          value.trim(),
        )
        .filter(Boolean),
    ),
  );
}

export const CatalogueVisionEngine = {
  analyse(
    card: SupplierCatalogueCardData,
  ): CatalogueVisionData {
    return {
      brand:
        clean(card.brand),

      productName:
        clean(
          card.officialProductName,
        ),

      garmentType:
        clean(
          card.vision.garmentType,
        ),

      colour:
        clean(card.colour),

      secondaryColours:
        uniqueStrings(
          card.vision.secondaryColours,
        ),

      chestLogo:
        clean(
          card.vision.chestLogo,
        ),

      frontGraphic:
        clean(
          card.vision.frontGraphic,
        ),

      backGraphic:
        clean(
          card.vision.backGraphic,
        ),

      sleeveDetail:
        clean(
          card.vision.sleeveDetail,
        ),

      neckLabel:
        clean(
          card.vision.neckLabel,
        ),

      fit:
        clean(card.vision.fit),

      collection:
        clean(
          card.vision.collection ??
            card.catalogueName,
        ),

      confidence:
        Math.max(
          0,
          Math.min(
            100,
            Math.round(
              card.vision.confidence,
            ),
          ),
        ),

      extractedText:
        uniqueStrings(
          card.vision.rawVisibleText,
        ),

      visualFingerprint:
        uniqueStrings(
          card.vision.visualFingerprint,
        ),

      reviewed: false,
    };
  },
} as const;
