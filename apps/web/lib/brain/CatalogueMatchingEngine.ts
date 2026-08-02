import {
  CatalogueVisionEngine,
} from "./CatalogueVisionEngine";

import {
  IdentityConflictEngine,
} from "./IdentityConflictEngine";

import {
  VisualSimilarityEngine,
} from "./VisualSimilarityEngine";

import type {
  CatalogueVisionData,
} from "@/types/catalogue-vision";

import type {
  SupplierCatalogueCardData,
} from "@/types/supplier-catalogue";

import type {
  CatalogueProduct,
  ProductIntelligenceProfile,
} from "@/types/catalogue";

import type {
  ProductVision,
} from "@/types/product-vision";

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

const MINIMUM_SUGGESTED_CONFIDENCE = 55;
const AUTOMATIC_MATCH_CONFIDENCE = 92;
const MAX_NON_MAPPING_CONFIDENCE = 96;

const EMPTY_PRODUCT_INTELLIGENCE:
  ProductIntelligenceProfile = {
    brand: null,
    official_product_name: null,
    aliases: [],
    primary_colour: null,
    secondary_colours: [],
    garment_type: null,
    chest_logo: null,
    front_graphic: null,
    back_graphic: null,
    sleeve_detail: null,
    neck_label: null,
    fit: null,
    collection: null,
    visual_fingerprint: [],
    confidence: 0,
    reviewed: false,
  };

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

function clampScore(
  value: number,
  maximum = 100,
): number {
  return Math.max(
    0,
    Math.min(
      maximum,
      Math.round(value),
    ),
  );
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

  const leftWords =
    new Set(
      left
        .split(" ")
        .filter(Boolean),
    );

  const rightWords =
    new Set(
      right
        .split(" ")
        .filter(Boolean),
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
  left: string | null | undefined,
  right: string | null | undefined,
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

function getBestSimilarity(
  source: string | null | undefined,
  candidates: Array<
    string | null | undefined
  >,
): number {
  const normalisedSource =
    normaliseText(source);

  if (!normalisedSource) {
    return 0;
  }

  return candidates.reduce(
    (best, candidate) =>
      Math.max(
        best,
        calculateTextSimilarity(
          normalisedSource,
          normaliseText(candidate),
        ),
      ),
    0,
  );
}

function getProductIntelligence(
  product: CatalogueProduct,
): ProductIntelligenceProfile {
  return (
    product.product_intelligence ??
    EMPTY_PRODUCT_INTELLIGENCE
  );
}

function getProductVision(
  product: CatalogueProduct,
): ProductVision | null {
  return product.product_vision ?? null;
}

function addSignal(
  signals: CatalogueMatchSignal[],
  signal: CatalogueMatchSignal,
): void {
  const score =
    clampScore(
      signal.score,
    );

  if (score <= 0) {
    return;
  }

  signals.push({
    ...signal,
    score,
  });
}

function hasDistinctiveEvidence(
  signals: CatalogueMatchSignal[],
): boolean {
  return signals.some(
    (signal) =>
      (
        signal.reason ===
          "image_similarity" &&
        signal.score >= 12
      ) ||
      (
        signal.reason ===
          "name_similarity" &&
        signal.score >= 18
      ),
  );
}

function hasBrandAgreement(
  signals: CatalogueMatchSignal[],
): boolean {
  return signals.some(
    (signal) =>
      signal.reason ===
        "brand_match",
  );
}

function hasStrongUnbrandedEvidence(
  signals: CatalogueMatchSignal[],
): boolean {
  const nameSignal =
    signals.find(
      (signal) =>
        signal.reason ===
          "name_similarity",
    );

  const imageSignals =
    signals.filter(
      (signal) =>
        signal.reason ===
          "image_similarity",
    );

  const imageScore =
    imageSignals.reduce(
      (total, signal) =>
        total + signal.score,
      0,
    );

  return (
    (nameSignal?.score ?? 0) >= 16 &&
    imageScore >= 12
  ) ||
  imageScore >= 24;
}

function buildMatch({
  card,
  product,
  vision,
}: {
  card: SupplierCatalogueCardData;
  product: CatalogueProduct;
  vision: CatalogueVisionData;
}): CatalogueProductMatch {
  const signals:
    CatalogueMatchSignal[] = [];

  const intelligence =
    getProductIntelligence(
      product,
    );

  const productVision =
    getProductVision(
      product,
    );

  const visual =
    VisualSimilarityEngine.compare({
      supplierVision:
        vision,

      productVision,

      productIntelligence:
        intelligence,
    });

  for (
    const signal of
    visual.signals
  ) {
    addSignal(
      signals,
      {
        reason:
          "image_similarity",

        label:
          signal.label,

        score:
          signal.score,
      },
    );
  }

  const identity =
    IdentityConflictEngine.verify({
      supplierVision:
        vision,

      product,

      productVision,

      productIntelligence:
        intelligence,
    });

  if (!identity.valid) {
    return {
      product,
      confidence: 0,
      signals: [],
    };
  }

  if (
    card.linkedProductId ===
    product.product_id
  ) {
    return {
      product,
      confidence: 100,
      signals: [
        {
          reason:
            "existing_mapping",
          label:
            "Existing supplier mapping",
          score: 100,
        },
      ],
    };
  }

  const supplierName =
    normaliseText(
      card.supplierName,
    );

  const productSupplier =
    normaliseText(
      product.supplier_company,
    );

  if (
    supplierName &&
    productSupplier &&
    supplierName ===
      productSupplier
  ) {
    addSignal(
      signals,
      {
        reason:
          "same_supplier",
        label:
          "Same supplier",
        score: 3,
      },
    );
  }

  if (
    identity.supplierBrand &&
    identity.productBrand &&
    identity.supplierBrand ===
      identity.productBrand
  ) {
    addSignal(
      signals,
      {
        reason:
          "brand_match",
        label:
          productVision
            ? "Brand matches Product Vision"
            : "Brand match",
        score: 30,
      },
    );
  }

  const productNames = [
    intelligence.official_product_name,
    product.product_name,
    ...intelligence.aliases,
    ...(productVision?.matching_keywords ??
      []),
  ];

  const nameSimilarity =
    getBestSimilarity(
      vision.productName,
      productNames,
    );

  if (nameSimilarity >= 30) {
    addSignal(
      signals,
      {
        reason:
          "name_similarity",
        label:
          "Product name or keyword similarity",
        score:
          nameSimilarity *
          0.24,
      },
    );
  }

  const productPrimaryColour =
    productVision?.primary_colour ??
    intelligence.primary_colour ??
    (
      normaliseText(
        product.product_name,
      ).includes(
        normaliseText(
          vision.colour,
        ),
      )
        ? vision.colour
        : null
    );

  if (
    valuesMatch(
      vision.colour,
      productPrimaryColour,
    )
  ) {
    addSignal(
      signals,
      {
        reason:
          "colour_match",
        label:
          productVision
            ? "Primary colour matches Product Vision"
            : "Primary colour match",
        score: 8,
      },
    );
  }

  const productGarment =
    productVision?.subcategory ??
    productVision?.category ??
    intelligence.garment_type ??
    product.product_type;

  if (
    valuesMatch(
      vision.garmentType,
      productGarment,
    )
  ) {
    addSignal(
      signals,
      {
        reason:
          "manual_hint",
        label:
          "Garment type match",
        score: 6,
      },
    );
  }

  const brandAgreement =
    hasBrandAgreement(
      signals,
    );

  const distinctiveEvidence =
    hasDistinctiveEvidence(
      signals,
    );

  const supplierBrandKnown =
    normaliseText(
      vision.brand,
    ).length > 0;

  const strongUnbrandedEvidence =
    hasStrongUnbrandedEvidence(
      signals,
    );

  if (
    !distinctiveEvidence ||
    (
      supplierBrandKnown &&
      !brandAgreement
    ) ||
    (
      !supplierBrandKnown &&
      !strongUnbrandedEvidence
    )
  ) {
    return {
      product,
      confidence: 0,
      signals:
        signals.sort(
          (left, right) =>
            right.score -
            left.score,
        ),
    };
  }

  const confidence =
    clampScore(
      signals.reduce(
        (
          total,
          signal,
        ) =>
          total +
          signal.score,
        0,
      ),
      MAX_NON_MAPPING_CONFIDENCE,
    );

  return {
    product,
    confidence,
    signals:
      signals.sort(
        (left, right) =>
          right.score -
          left.score,
      ),
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
    const vision =
      CatalogueVisionEngine.analyse(
        card,
      );

    const matches =
      products
        .map((product) =>
          buildMatch({
            card,
            product,
            vision,
          }),
        )
        .filter(
          (match) =>
            match.confidence >=
            MINIMUM_SUGGESTED_CONFIDENCE,
        )
        .sort(
          (left, right) =>
            right.confidence -
            left.confidence,
        );

    const bestMatch =
      matches[0] ?? null;

    const alternatives =
      matches.slice(1, 4);

    const status =
      bestMatch === null
        ? "unmatched"
        : bestMatch.confidence >=
            AUTOMATIC_MATCH_CONFIDENCE
          ? "matched"
          : "possible_match";

    return {
      catalogueCardId:
        card.id,

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
    cards:
      SupplierCatalogueCardData[];
    products:
      CatalogueProduct[];
  }): CatalogueMatchingResult[] {
    return cards.map(
      (card) =>
        CatalogueMatchingEngine.matchCatalogueCard({
          card,
          products,
        }),
    );
  },
} as const; 