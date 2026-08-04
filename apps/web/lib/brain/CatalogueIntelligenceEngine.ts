import type {
  CatalogueReviewQueueItem,
} from "@/lib/supplier/CatalogueReviewQueueEngine";

export type CatalogueIntelligenceCategory =
  | "known_product"
  | "strong_match"
  | "possible_match"
  | "new_product";

export type CatalogueIntelligenceItem = {
  cardId: string;

  category:
    CatalogueIntelligenceCategory;

  label: string;

  reviewRequired: boolean;

  confidence: number | null;

  productId: string | null;

  productName: string | null;

  source:
    | "memory"
    | "vault_brain"
    | "unmatched";

  item: CatalogueReviewQueueItem;
};

export type CatalogueIntelligenceSummary = {
  totalDetected: number;

  knownProducts: number;

  strongMatches: number;

  possibleMatches: number;

  newProducts: number;

  needsReview: number;

  readyWithoutReview: number;

  estimatedReviewMinutes: number;

  reviewPercentage: number;
};

export type CatalogueIntelligenceResult = {
  items: CatalogueIntelligenceItem[];

  knownProducts:
    CatalogueIntelligenceItem[];

  strongMatches:
    CatalogueIntelligenceItem[];

  possibleMatches:
    CatalogueIntelligenceItem[];

  newProducts:
    CatalogueIntelligenceItem[];

  reviewItems:
    CatalogueIntelligenceItem[];

  summary:
    CatalogueIntelligenceSummary;
};

function hasMemorySignal(
  item: CatalogueReviewQueueItem,
): boolean {
  if (item.memory) {
    return true;
  }

  return Boolean(
    item.match.bestMatch?.signals.some(
      (signal) =>
        signal.reason ===
          "existing_mapping" ||
        signal.label
          .toLowerCase()
          .includes(
            "known product",
          ),
    ),
  );
}

function classifyItem(
  item: CatalogueReviewQueueItem,
): CatalogueIntelligenceItem {
  const bestMatch =
    item.match.bestMatch;

  if (
    bestMatch &&
    hasMemorySignal(item)
  ) {
    return {
      cardId:
        item.card.id,

      category:
        "known_product",

      label:
        "Known product",

      reviewRequired:
        false,

      confidence:
        100,

      productId:
        bestMatch.product.style_id,

      productName:
        bestMatch.product.product_name,

      source:
        "memory",

      item,
    };
  }

  if (
    bestMatch &&
    item.match.status ===
      "matched" &&
    bestMatch.confidence >= 92
  ) {
    return {
      cardId:
        item.card.id,

      category:
        "strong_match",

      label:
        "Strong Vault Brain match",

      reviewRequired:
        false,

      confidence:
        bestMatch.confidence,

      productId:
        bestMatch.product.style_id,

      productName:
        bestMatch.product.product_name,

      source:
        "vault_brain",

      item,
    };
  }

  if (bestMatch) {
    return {
      cardId:
        item.card.id,

      category:
        "possible_match",

      label:
        "Review suggested",

      reviewRequired:
        true,

      confidence:
        bestMatch.confidence,

      productId:
        bestMatch.product.style_id,

      productName:
        bestMatch.product.product_name,

      source:
        "vault_brain",

      item,
    };
  }

  return {
    cardId:
      item.card.id,

    category:
      "new_product",

    label:
      "No existing product found",

    reviewRequired:
      true,

    confidence:
      null,

    productId:
      null,

    productName:
      null,

    source:
      "unmatched",

    item,
  };
}

function calculateEstimatedReviewMinutes(
  reviewCount: number,
): number {
  if (reviewCount <= 0) {
    return 0;
  }

  /*
   * Existing Match Review estimates roughly
   * five seconds per item. Keep the dashboard
   * consistent with that workflow.
   */
  return Math.max(
    1,
    Math.ceil(
      reviewCount * 0.08,
    ),
  );
}

export const CatalogueIntelligenceEngine = {
  analyse(
    queue:
      CatalogueReviewQueueItem[],
  ): CatalogueIntelligenceResult {
    const items =
      queue.map(
        classifyItem,
      );

    const knownProducts =
      items.filter(
        (item) =>
          item.category ===
          "known_product",
      );

    const strongMatches =
      items.filter(
        (item) =>
          item.category ===
          "strong_match",
      );

    const possibleMatches =
      items.filter(
        (item) =>
          item.category ===
          "possible_match",
      );

    const newProducts =
      items.filter(
        (item) =>
          item.category ===
          "new_product",
      );

    const reviewItems =
      items.filter(
        (item) =>
          item.reviewRequired,
      );

    const totalDetected =
      items.length;

    const readyWithoutReview =
      knownProducts.length +
      strongMatches.length;

    const reviewPercentage =
      totalDetected > 0
        ? Math.round(
            (
              reviewItems.length /
              totalDetected
            ) *
              100,
          )
        : 0;

    return {
      items,

      knownProducts,

      strongMatches,

      possibleMatches,

      newProducts,

      reviewItems,

      summary: {
        totalDetected,

        knownProducts:
          knownProducts.length,

        strongMatches:
          strongMatches.length,

        possibleMatches:
          possibleMatches.length,

        newProducts:
          newProducts.length,

        needsReview:
          reviewItems.length,

        readyWithoutReview,

        estimatedReviewMinutes:
          calculateEstimatedReviewMinutes(
            reviewItems.length,
          ),

        reviewPercentage,
      },
    };
  },
} as const;
