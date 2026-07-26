import type {
  SupplierCatalogueCardData,
} from "@/types/supplier-catalogue";

import type {
  CatalogueProduct,
} from "@/types/catalogue";

export type CatalogueMatchReason =
  | "same_supplier"
  | "brand_match"
  | "colour_match"
  | "name_similarity"
  | "existing_mapping"
  | "image_similarity"
  | "manual_hint";

export type CatalogueMatchSignal = {
  reason: CatalogueMatchReason;
  label: string;
  score: number;
};

export type CatalogueProductMatch = {
  product: CatalogueProduct;
  confidence: number;
  signals: CatalogueMatchSignal[];
};

export type CatalogueMatchingResult = {
  catalogueCardId: string;

  bestMatch: CatalogueProductMatch | null;

  alternatives: CatalogueProductMatch[];

  requiresReview: boolean;

  status:
    | "matched"
    | "possible_match"
    | "unmatched";
};

function normaliseText(
  value: string | null | undefined,
): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function calculateTextSimilarity(
  left: string,
  right: string,
): number {
  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 100;
  }

  const leftWords = new Set(left.split(" "));
  const rightWords = new Set(right.split(" "));

  const sharedWords = [...leftWords].filter(
    (word) => rightWords.has(word),
  );

  const totalWords = new Set([
    ...leftWords,
    ...rightWords,
  ]).size;

  if (totalWords === 0) {
    return 0;
  }

  return Math.round(
    (sharedWords.length / totalWords) * 100,
  );
}

function buildMatch({
  card,
  product,
}: {
  card: SupplierCatalogueCardData;
  product: CatalogueProduct;
}): CatalogueProductMatch {
  const signals: CatalogueMatchSignal[] = [];

  const supplierName = normaliseText(
    card.supplierName,
  );

  const productSupplier = normaliseText(
    product.supplier_company,
  );

  if (
    supplierName &&
    productSupplier &&
    supplierName === productSupplier
  ) {
    signals.push({
      reason: "same_supplier",
      label: "Same supplier",
      score: 20,
    });
  }

  const cardBrand = normaliseText(card.brand);
  const productName = normaliseText(
    product.product_name,
  );

  if (
    cardBrand &&
    productName.includes(cardBrand)
  ) {
    signals.push({
      reason: "brand_match",
      label: "Brand appears in product name",
      score: 20,
    });
  }

  const catalogueName = normaliseText(
    card.officialProductName ??
      card.internalReference,
  );

  const nameSimilarity =
    calculateTextSimilarity(
      catalogueName,
      productName,
    );

  if (nameSimilarity > 0) {
    signals.push({
      reason: "name_similarity",
      label: "Product naming similarity",
      score: Math.round(
        nameSimilarity * 0.45,
      ),
    });
  }

  const cardColour = normaliseText(card.colour);

  if (
    cardColour &&
    productName.includes(cardColour)
  ) {
    signals.push({
      reason: "colour_match",
      label: "Colour appears in product name",
      score: 15,
    });
  }

  if (
    card.linkedProductId ===
    product.product_id
  ) {
    signals.push({
      reason: "existing_mapping",
      label: "Existing supplier mapping",
      score: 100,
    });
  }

  const confidence = clampScore(
    signals.reduce(
      (total, signal) =>
        total + signal.score,
      0,
    ),
  );

  return {
    product,
    confidence,
    signals,
  };
}

export const CatalogueMatchingEngine = {
  matchCatalogueCard({
    card,
    products,
  }: {
    card: SupplierCatalogueCardData;
    products: CatalogueProduct[];
  }): CatalogueMatchingResult {
    const matches = products
      .map((product) =>
        buildMatch({
          card,
          product,
        }),
      )
      .filter(
        (match) =>
          match.confidence > 0,
      )
      .sort(
        (a, b) =>
          b.confidence - a.confidence,
      );

    const bestMatch = matches[0] ?? null;

    const alternatives = matches.slice(1, 4);

    const status =
      bestMatch === null
        ? "unmatched"
        : bestMatch.confidence >= 80
          ? "matched"
          : "possible_match";

    return {
      catalogueCardId: card.id,
      bestMatch,
      alternatives,
      requiresReview:
        status !== "matched",
      status,
    };
  },

  matchCatalogue({
    cards,
    products,
  }: {
    cards: SupplierCatalogueCardData[];
    products: CatalogueProduct[];
  }): CatalogueMatchingResult[] {
    return cards.map((card) =>
      CatalogueMatchingEngine.matchCatalogueCard({
        card,
        products,
      }),
    );
  },
};