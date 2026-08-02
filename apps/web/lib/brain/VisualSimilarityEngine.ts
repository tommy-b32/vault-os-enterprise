import type {
  CatalogueVisionData,
} from "@/types/catalogue-vision";

import type {
  ProductVision,
} from "@/types/product-vision";

import type {
  ProductIntelligenceProfile,
} from "@/types/catalogue";

export type VisualSimilaritySignalReason =
  | "logo_similarity"
  | "graphic_similarity"
  | "fingerprint_similarity"
  | "keyword_similarity"
  | "logo_fingerprint_similarity";

export type VisualSimilaritySignal = {
  reason: VisualSimilaritySignalReason;

  label: string;

  score: number;
};

export type VisualSimilarityResult = {
  score: number;

  signals: VisualSimilaritySignal[];

  logoSimilarity: number;

  graphicSimilarity: number;

  fingerprintSimilarity: number;

  keywordSimilarity: number;

  logoFingerprintSimilarity: number;
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
        score >= 40,
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

function buildLogoFingerprintTokens(
  productVision: ProductVision,
): string[] {
  const fingerprint =
    productVision.logo_fingerprint;

  if (
    !fingerprint ||
    !fingerprint.present
  ) {
    return [];
  }

  return [
    fingerprint.predicted_brand,
    fingerprint.logo_family,
    fingerprint.logo_shape,
    fingerprint.logo_text,
    fingerprint.placement,
    fingerprint.application,
    ...fingerprint.dominant_colours,
    ...fingerprint.visual_features,
  ].filter(
    (value): value is string =>
      Boolean(
        value?.trim(),
      ),
  );
}

function addSignal(
  signals: VisualSimilaritySignal[],
  signal: VisualSimilaritySignal,
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

export const VisualSimilarityEngine = {
  compare({
    supplierVision,
    productVision,
    productIntelligence,
  }: {
    supplierVision: CatalogueVisionData;

    productVision: ProductVision | null;

    productIntelligence: ProductIntelligenceProfile;
  }): VisualSimilarityResult {
    const signals:
      VisualSimilaritySignal[] = [];

    const logoSimilarity =
      productVision &&
      supplierVision.chestLogo &&
      productVision.logo_present
        ? getBestSimilarity(
            supplierVision.chestLogo,
            [
              productVision.logo_type,
              productVision.logo_position,
              productVision.logo_size,
              productVision.front_description,
              ...productVision.key_features,
              ...productVision.visual_fingerprint,
            ],
          )
        : 0;

    if (logoSimilarity >= 40) {
      addSignal(
        signals,
        {
          reason:
            "logo_similarity",

          label:
            "Logo type and placement similarity",

          score:
            logoSimilarity *
            0.18,
        },
      );
    }

    const graphicSimilarity =
      Math.max(
        getBestSimilarity(
          supplierVision.frontGraphic,
          productVision
            ? [
                productVision.front_description,
                productVision.pattern,
                ...productVision.key_features,
                ...productVision.visual_fingerprint,
              ]
            : [
                productIntelligence.front_graphic,
                ...productIntelligence.visual_fingerprint,
              ],
        ),

        getBestSimilarity(
          supplierVision.chestLogo,
          productVision
            ? [
                productVision.logo_type,
                productVision.logo_position,
                productVision.logo_size,
                ...productVision.visual_fingerprint,
              ]
            : [
                productIntelligence.chest_logo,
                ...productIntelligence.visual_fingerprint,
              ],
        ),

        getBestSimilarity(
          supplierVision.backGraphic,
          productVision
            ? [
                productVision.back_description,
                ...productVision.key_features,
                ...productVision.visual_fingerprint,
              ]
            : [
                productIntelligence.back_graphic,
                ...productIntelligence.visual_fingerprint,
              ],
        ),
      );

    if (graphicSimilarity >= 45) {
      addSignal(
        signals,
        {
          reason:
            "graphic_similarity",

          label:
            productVision
              ? "Graphic details match Product Vision"
              : "Graphic and logo similarity",

          score:
            graphicSimilarity *
            0.18,
        },
      );
    }

    const productFingerprint =
      productVision?.visual_fingerprint ??
      productIntelligence.visual_fingerprint;

    const fingerprintSimilarity =
      calculateFingerprintSimilarity(
        supplierVision.visualFingerprint,
        productFingerprint,
      );

    if (
      fingerprintSimilarity >= 35
    ) {
      addSignal(
        signals,
        {
          reason:
            "fingerprint_similarity",

          label:
            productVision
              ? "Visual fingerprint similarity"
              : "Legacy fingerprint similarity",

          score:
            fingerprintSimilarity *
            0.26,
        },
      );
    }

    const supplierKeywords = [
      supplierVision.productName,
      ...supplierVision.extractedText,
      supplierVision.chestLogo,
      supplierVision.frontGraphic,
      supplierVision.backGraphic,
      ...supplierVision.visualFingerprint,
    ].filter(
      (value): value is string =>
        Boolean(
          value?.trim(),
        ),
    );

    const productKeywords =
      productVision
        ? [
            productVision.brand,
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
          )
        : [
            productIntelligence.brand,
            productIntelligence.official_product_name,
            ...productIntelligence.aliases,
            productIntelligence.primary_colour,
            productIntelligence.garment_type,
            productIntelligence.chest_logo,
            productIntelligence.front_graphic,
            productIntelligence.back_graphic,
            productIntelligence.sleeve_detail,
            productIntelligence.neck_label,
            productIntelligence.fit,
            productIntelligence.collection,
            ...productIntelligence.visual_fingerprint,
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
      keywordSimilarity >= 45
    ) {
      addSignal(
        signals,
        {
          reason:
            "keyword_similarity",

          label:
            productVision
              ? "Product Vision keyword similarity"
              : "Product intelligence keyword similarity",

          score:
            keywordSimilarity *
            0.14,
        },
      );
    }

    const logoFingerprintTokens =
      productVision
        ? buildLogoFingerprintTokens(
            productVision,
          )
        : [];

    const supplierLogoTokens = [
      supplierVision.brand,
      supplierVision.chestLogo,
      supplierVision.frontGraphic,
      ...supplierVision.extractedText,
      ...supplierVision.visualFingerprint,
    ].filter(
      (value): value is string =>
        Boolean(
          value?.trim(),
        ),
    );

    const logoFingerprintSimilarity =
      getBestArraySimilarity(
        supplierLogoTokens,
        logoFingerprintTokens,
      );

    if (
      logoFingerprintSimilarity >= 45
    ) {
      addSignal(
        signals,
        {
          reason:
            "logo_fingerprint_similarity",

          label:
            "Logo fingerprint similarity",

          score:
            logoFingerprintSimilarity *
            0.2,
        },
      );
    }

    const score =
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
      );

    return {
      score,

      signals:
        signals.sort(
          (left, right) =>
            right.score -
            left.score,
        ),

      logoSimilarity,

      graphicSimilarity,

      fingerprintSimilarity,

      keywordSimilarity,

      logoFingerprintSimilarity,
    };
  },
} as const;