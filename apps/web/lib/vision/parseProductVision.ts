import type {
  ProductVision,
} from "@/types/product-vision";

type ProductVisionSource = {
  productId: string;

  visionJson: unknown;

  analysedAt: string | null;
  imageUrl: string | null;
  imageHash: string | null;
  model: string | null;
  visionVersion: number | null;
};

type JsonRecord = Record<string, unknown>;

function isJsonRecord(
  value: unknown,
): value is JsonRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function readString(
  record: JsonRecord,
  key: string,
): string | null {
  const value = record[key];

  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0
    ? trimmedValue
    : null;
}

function readStringArray(
  record: JsonRecord,
  key: string,
): string[] {
  const value = record[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter(
          (item): item is string =>
            typeof item === "string",
        )
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function readBoolean(
  record: JsonRecord,
  key: string,
): boolean {
  const value = record[key];

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalisedValue =
      value.trim().toLowerCase();

    if (normalisedValue === "true") {
      return true;
    }

    if (normalisedValue === "false") {
      return false;
    }
  }

  return false;
}

function readNumber(
  record: JsonRecord,
  key: string,
): number {
  const value = record[key];

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value === "string") {
    const parsedValue = Number(value);

    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }

  return 0;
}

export function parseProductVision({
  productId,
  visionJson,
  analysedAt,
  imageUrl,
  imageHash,
  model,
  visionVersion,
}: ProductVisionSource): ProductVision {
  const vision = isJsonRecord(visionJson)
    ? visionJson
    : {};

  return {
    product_id: productId,

    analysed_at: analysedAt,
    image_url: imageUrl,
    image_hash: imageHash,
    model,
    vision_version: visionVersion ?? 1,

    brand:
      readString(
        vision,
        "brand",
      ),

    category:
      readString(
        vision,
        "category",
      ),

    subcategory:
      readString(
        vision,
        "subcategory",
      ),

    primary_colour:
      readString(
        vision,
        "primaryColour",
      ),

    secondary_colours:
      readStringArray(
        vision,
        "secondaryColours",
      ),

    fit:
      readString(
        vision,
        "fit",
      ),

    neck_type:
      readString(
        vision,
        "neckType",
      ),

    sleeve_type:
      readString(
        vision,
        "sleeveType",
      ),

    logo_present:
      readBoolean(
        vision,
        "logoPresent",
      ),

    logo_type:
      readString(
        vision,
        "logoType",
      ),

    logo_position:
      readString(
        vision,
        "logoPosition",
      ),

    logo_size:
      readString(
        vision,
        "logoSize",
      ),

    logo_fingerprint: null,

    pattern:
      readString(
        vision,
        "pattern",
      ),

    material_appearance:
      readString(
        vision,
        "materialAppearance",
      ),

    style_classification:
      readString(
        vision,
        "styleClassification",
      ),

    seasonality:
      readStringArray(
        vision,
        "seasonality",
      ),

    gender_presentation:
      readString(
        vision,
        "genderPresentation",
      ),

    front_description:
      readString(
        vision,
        "frontDescription",
      ),

    back_description:
      readString(
        vision,
        "backDescription",
      ),

    key_features:
      readStringArray(
        vision,
        "keyFeatures",
      ),

    matching_keywords:
      readStringArray(
        vision,
        "matchingKeywords",
      ),

    visual_fingerprint:
      readStringArray(
        vision,
        "visualFingerprint",
      ),

    confidence:
      readNumber(
        vision,
        "confidence",
      ),
  };
}
