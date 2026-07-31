import {
  CatalogueVisionEngine,
} from "./CatalogueVisionEngine";

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

const MINIMUM_SUGGESTED_CONFIDENCE = 42;
const AUTOMATIC_MATCH_CONFIDENCE = 82;

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
): number {
  return Math.max(
    0,
    Math.min(
      100,
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

function getBestArraySimilarity(
  source: string[],
  candidates: string[],
): number {
  if (
    source.length === 0 ||
    candidates.length === 0
  ) {
    return 0;
  }

  return source.reduce(
    (best, sourceValue) =>
      Math.max(
        best,
        getBestSimilarity(
          sourceValue,
          candidates,
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

function calculateFingerprintSimilarity(
  supplierFingerprint: string[],
  productFingerprint: string[],
): number {
  if (
    supplierFingerprint.length === 0 ||
    productFingerprint.length === 0
  ) {
    return 0;
  }

  const scores =
    supplierFingerprint.map(
      (supplierToken) =>
        getBestSimilarity(
          supplierToken,
          productFingerprint,
        ),
    );

  const usefulScores =
    scores.filter(
      (score) =>
        score >= 35,
    );

  if (
    usefulScores.length === 0
  ) {
    return 0;
  }

  return Math.round(
    usefulScores.reduce(
      (total, score) =>
        total + score,
      0,
    ) /
      Math.max(
        supplierFingerprint.length,
        productFingerprint.length,
      ),
  );
}

function hasIdentityEvidence(
  signals: CatalogueMatchSignal[],
): boolean {
  return signals.some(
    (signal) =>
      signal.reason ===
        "existing_mapping" ||
      signal.reason ===
        "brand_match" ||
      (
        signal.reason ===
          "name_similarity" &&
        signal.score >= 15
      ) ||
      (
        signal.reason ===
          "image_similarity" &&
        signal.score >= 12
      ),
  );
}

function addSignal(
  signals: CatalogueMatchSignal[],
  signal: CatalogueMatchSignal,
): void {
  if (signal.score <= 0) {
    return;
  }

  signals.push({
    ...signal,
    score:
      clampScore(
        signal.score,
      ),
  });
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
        score: 6,
      },
    );
  }

  const supplierBrand =
    normaliseText(
      vision.brand,
    );

  const productBrand =
    normaliseText(
      productVision?.brand ??
      intelligence.brand,
    );

  if (
    supplierBrand &&
    (
      supplierBrand ===
        productBrand ||
      normaliseText(
        product.product_name,
      ).includes(
        supplierBrand,
      )
    )
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
        score: 28,
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

  if (nameSimilarity >= 20) {
    addSignal(
      signals,
      {
        reason:
          "name_similarity",
        label:
          "Product name or keyword similarity",
        score:
          nameSimilarity *
          0.28,
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
        score: 13,
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
        score: 10,
      },
    );
  }

  if (
    productVision &&
    vision.chestLogo &&
    productVision.logo_present
  ) {
    const logoSimilarity =
      getBestSimilarity(
        vision.chestLogo,
        [
          productVision.logo_type,
          productVision.logo_position,
          productVision.logo_size,
          productVision.front_description,
          ...productVision.key_features,
          ...productVision.visual_fingerprint,
        ],
      );

    if (logoSimilarity >= 30) {
      addSignal(
        signals,
        {
          reason:
            "image_similarity",
          label:
            "Logo type and placement similarity",
          score:
            logoSimilarity *
            0.18,
        },
      );
    }
  }

  const graphicSimilarity =
    Math.max(
      getBestSimilarity(
        vision.frontGraphic,
        productVision
          ? [
              productVision.front_description,
              productVision.pattern,
              ...productVision.key_features,
              ...productVision.visual_fingerprint,
            ]
          : [
              intelligence.front_graphic,
              ...intelligence.visual_fingerprint,
            ],
      ),
      getBestSimilarity(
        vision.chestLogo,
        productVision
          ? [
              productVision.logo_type,
              productVision.logo_position,
              productVision.logo_size,
              ...productVision.visual_fingerprint,
            ]
          : [
              intelligence.chest_logo,
              ...intelligence.visual_fingerprint,
            ],
      ),
      getBestSimilarity(
        vision.backGraphic,
        productVision
          ? [
              productVision.back_description,
              ...productVision.key_features,
              ...productVision.visual_fingerprint,
            ]
          : [
              intelligence.back_graphic,
              ...intelligence.visual_fingerprint,
            ],
      ),
    );

  if (graphicSimilarity >= 35) {
    addSignal(
      signals,
      {
        reason:
          "image_similarity",
        label:
          productVision
            ? "Graphic details match Product Vision"
            : "Graphic and logo similarity",
        score:
          graphicSimilarity *
          0.16,
      },
    );
  }

  const productFingerprint =
    productVision?.visual_fingerprint ??
    intelligence.visual_fingerprint;

  const fingerprintSimilarity =
    calculateFingerprintSimilarity(
      vision.visualFingerprint,
      productFingerprint,
    );

  if (
    fingerprintSimilarity >= 28
  ) {
    addSignal(
      signals,
      {
        reason:
          "image_similarity",
        label:
          productVision
            ? "Visual fingerprint similarity"
            : "Legacy fingerprint similarity",
        score:
          fingerprintSimilarity *
          0.24,
      },
    );
  }

  if (productVision) {
    const supplierKeywords = [
      vision.productName,
      vision.colour,
      vision.garmentType,
      vision.chestLogo,
      vision.frontGraphic,
      vision.backGraphic,
      ...vision.visualFingerprint,
    ].filter(
      (value): value is string =>
        Boolean(
          value?.trim(),
        ),
    );

    const productKeywords = [
      ...productVision.matching_keywords,
      ...productVision.key_features,
      ...productVision.visual_fingerprint,
      productVision.pattern,
      productVision.material_appearance,
      productVision.fit,
      productVision.neck_type,
      productVision.sleeve_type,
    ].filter(
      (value): value is string =>
        Boolean(
          value?.trim(),
        ),
    );

    const keywordSimilarity =
      getBestArraySimilarity(
        supplierKeywords,
        productKeywords,
      );

    if (
      keywordSimilarity >= 35
    ) {
      addSignal(
        signals,
        {
          reason:
            "image_similarity",
          label:
            "Product Vision keyword similarity",
          score:
            keywordSimilarity *
            0.14,
        },
      );
    }

    if (
      valuesMatch(
        vision.garmentType,
        productVision.subcategory,
      ) &&
      valuesMatch(
        vision.colour,
        productVision.primary_colour,
      )
    ) {
      addSignal(
        signals,
        {
          reason:
            "manual_hint",
          label:
            "Colour and garment combination match",
          score: 6,
        },
      );
    }
  }

  if (
    card.linkedProductId ===
    product.product_id
  ) {
    addSignal(
      signals,
      {
        reason:
          "existing_mapping",
        label:
          "Existing supplier mapping",
        score: 100,
      },
    );
  }

  const confidence =
    hasIdentityEvidence(
      signals,
    )
      ? clampScore(
          signals.reduce(
            (
              total,
              signal,
            ) =>
              total +
              signal.score,
            0,
          ),
        )
      : 0;

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