import "server-only";

import OpenAI from "openai";

import type {
  ProductVisionData,
  ProductVisionInput,
} from "@/lib/brain/ProductVisionEngine";

export type ProductVisionAnalysis = {
  vision: ProductVisionData;
  model: string;
};

const PRODUCT_VISION_SCHEMA = {
  type: "object",
  additionalProperties: false,

  properties: {
    brand: {
      type: [
        "string",
        "null",
      ],
    },

    category: {
      type: [
        "string",
        "null",
      ],
    },

    subcategory: {
      type: [
        "string",
        "null",
      ],
    },

    primaryColour: {
      type: [
        "string",
        "null",
      ],
    },

    secondaryColours: {
      type: "array",
      items: {
        type: "string",
      },
    },

    fit: {
      type: [
        "string",
        "null",
      ],
    },

    neckType: {
      type: [
        "string",
        "null",
      ],
    },

    sleeveType: {
      type: [
        "string",
        "null",
      ],
    },

    logoPresent: {
      type: "boolean",
    },

    logoType: {
      type: [
        "string",
        "null",
      ],
    },

    logoPosition: {
      type: [
        "string",
        "null",
      ],
    },

    logoSize: {
      type: [
        "string",
        "null",
      ],
    },

    pattern: {
      type: [
        "string",
        "null",
      ],
    },

    materialAppearance: {
      type: [
        "string",
        "null",
      ],
    },

    styleClassification: {
      type: "array",
      items: {
        type: "string",
      },
    },

    seasonality: {
      type: "array",
      items: {
        type: "string",
      },
    },

    genderPresentation: {
      type: [
        "string",
        "null",
      ],
    },

    frontDescription: {
      type: [
        "string",
        "null",
      ],
    },

    backDescription: {
      type: [
        "string",
        "null",
      ],
    },

    keyFeatures: {
      type: "array",
      items: {
        type: "string",
      },
    },

    matchingKeywords: {
      type: "array",
      items: {
        type: "string",
      },
    },

    visualFingerprint: {
      type: "array",
      items: {
        type: "string",
      },
    },

    confidence: {
      type: "number",
      minimum: 0,
      maximum: 100,
    },
  },

  required: [
    "brand",
    "category",
    "subcategory",
    "primaryColour",
    "secondaryColours",
    "fit",
    "neckType",
    "sleeveType",
    "logoPresent",
    "logoType",
    "logoPosition",
    "logoSize",
    "pattern",
    "materialAppearance",
    "styleClassification",
    "seasonality",
    "genderPresentation",
    "frontDescription",
    "backDescription",
    "keyFeatures",
    "matchingKeywords",
    "visualFingerprint",
    "confidence",
  ],
} as const;

function createOpenAIClient(): OpenAI {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is missing from apps/web/.env.local.",
    );
  }

  return new OpenAI({
    apiKey,
  });
}

function isValidImageUrl(
  value: string,
): boolean {
  return (
    value.startsWith(
      "https://",
    ) ||
    value.startsWith(
      "http://",
    ) ||
    value.startsWith(
      "data:image/",
    )
  );
}

function cleanNullableString(
  value: unknown,
): string | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const cleaned =
    value.trim();

  return cleaned || null;
}

function cleanStringArray(
  value: unknown,
): string[] {
  if (
    !Array.isArray(value)
  ) {
    return [];
  }

  const seen =
    new Set<string>();

  const result: string[] =
    [];

  for (const item of value) {
    if (
      typeof item !==
      "string"
    ) {
      continue;
    }

    const cleaned =
      item.trim();

    const key =
      cleaned.toLowerCase();

    if (
      !cleaned ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function cleanBoolean(
  value: unknown,
): boolean {
  if (
    typeof value ===
    "boolean"
  ) {
    return value;
  }

  if (
    typeof value ===
    "string"
  ) {
    return (
      value.trim().toLowerCase() ===
      "true"
    );
  }

  return Boolean(value);
}

function clampConfidence(
  value: unknown,
): number {
  const numericValue =
    typeof value ===
    "number"
      ? value
      : Number(value);

  if (
    !Number.isFinite(
      numericValue,
    )
  ) {
    return 0;
  }

  return Math.round(
    Math.max(
      0,
      Math.min(
        100,
        numericValue,
      ),
    ),
  );
}

function parseVision(
  outputText: string,
): ProductVisionData {
  let parsed:
    Record<
      string,
      unknown
    >;

  try {
    parsed =
      JSON.parse(
        outputText,
      ) as Record<
        string,
        unknown
      >;
  } catch {
    console.error(
      "Invalid Product Vision output:",
      outputText,
    );

    throw new Error(
      "Product Vision returned invalid JSON.",
    );
  }

  const logoPresent =
    cleanBoolean(
      parsed.logoPresent,
    );

  return {
    brand:
      cleanNullableString(
        parsed.brand,
      ),

    category:
      cleanNullableString(
        parsed.category,
      ),

    subcategory:
      cleanNullableString(
        parsed.subcategory,
      ),

    primaryColour:
      cleanNullableString(
        parsed.primaryColour,
      ),

    secondaryColours:
      cleanStringArray(
        parsed.secondaryColours,
      ),

    fit:
      cleanNullableString(
        parsed.fit,
      ),

    neckType:
      cleanNullableString(
        parsed.neckType,
      ),

    sleeveType:
      cleanNullableString(
        parsed.sleeveType,
      ),

    logoPresent,

    logoType:
      logoPresent
        ? cleanNullableString(
            parsed.logoType,
          )
        : null,

    logoPosition:
      logoPresent
        ? cleanNullableString(
            parsed.logoPosition,
          )
        : null,

    logoSize:
      logoPresent
        ? cleanNullableString(
            parsed.logoSize,
          )
        : null,

    pattern:
      cleanNullableString(
        parsed.pattern,
      ),

    materialAppearance:
      cleanNullableString(
        parsed.materialAppearance,
      ),

    styleClassification:
      cleanStringArray(
        parsed.styleClassification,
      ),

    seasonality:
      cleanStringArray(
        parsed.seasonality,
      ),

    genderPresentation:
      cleanNullableString(
        parsed.genderPresentation,
      ),

    frontDescription:
      cleanNullableString(
        parsed.frontDescription,
      ),

    backDescription:
      cleanNullableString(
        parsed.backDescription,
      ),

    keyFeatures:
      cleanStringArray(
        parsed.keyFeatures,
      ),

    matchingKeywords:
      cleanStringArray(
        parsed.matchingKeywords,
      ),

    visualFingerprint:
      cleanStringArray(
        parsed.visualFingerprint,
      ),

    confidence:
      clampConfidence(
        parsed.confidence,
      ),
  };
}

export async function analyseProductVision({
  productId,
  productName,
  imageUrl,
}: ProductVisionInput): Promise<ProductVisionAnalysis> {
  const cleanedProductId =
    productId.trim();

  const cleanedProductName =
    productName.trim();

  const cleanedImageUrl =
    imageUrl.trim();

  if (!cleanedProductId) {
    throw new Error(
      "A product ID is required.",
    );
  }

  if (!cleanedProductName) {
    throw new Error(
      "A product name is required.",
    );
  }

  if (
    !isValidImageUrl(
      cleanedImageUrl,
    )
  ) {
    throw new Error(
      "A valid product image URL is required.",
    );
  }

  const openai =
    createOpenAIClient();

  const model =
    process.env.OPENAI_PRODUCT_VISION_MODEL ||
    process.env.OPENAI_CATALOGUE_VISION_MODEL ||
    "gpt-5";

  const response =
    await openai.responses.create({
      model,

      store: false,

      text: {
        format: {
          type:
            "json_schema",

          name:
            "product_vision_analysis_v2",

          description:
            "Structured visual intelligence extracted from one clothing product image.",

          strict: true,

          schema:
            PRODUCT_VISION_SCHEMA,
        },
      },

      input: [
        {
          role:
            "user",

          content: [
            {
              type:
                "input_text",

              text: [
                "You are Vault Product Vision, a specialist clothing-image intelligence system.",
                `Internal product ID: ${cleanedProductId}`,
                `Internal product name: ${cleanedProductName}`,
                "",
                "Analyse the principal clothing product shown in the image and return the required structured data.",
                "Use the internal product name only as supporting context.",
                "Every reported attribute must be supported by the image, or by a clearly visible wordmark, badge, label or recognisable logo.",
                "",
                "General rules:",
                "- Prefer null or an empty array over guessing.",
                "- Analyse the garment itself, not the model, hanger, packaging, background, furniture or photography style.",
                "- Ignore unrelated garments or accessories that appear in the background.",
                "- Do not state or imply that an item is authentic, counterfeit, official, genuine or licensed.",
                "- Keep values concise, consistent and useful for database filtering and visual matching.",
                "",
                "Field rules:",
                "- brand: use the visible brand name only when supported by a wordmark, badge, label or recognisable logo; otherwise null.",
                "- category: use a broad practical category such as Clothing, Footwear or Accessory.",
                "- subcategory: use a specific product type such as T-Shirt, Polo Shirt, Hoodie, Sweatshirt, Jacket, Gilet, Tracksuit Top, Trousers, Shorts, Cap, Trainers or Bag.",
                "- primaryColour: the dominant garment colour using a simple retail colour name.",
                "- secondaryColours: important logo, graphic, panel, stripe, trim or contrast colours, excluding the primary colour.",
                "- fit: use a visually supportable value such as Slim, Regular, Relaxed, Oversized, Tapered or Boxy; otherwise null.",
                "- neckType: use values such as Crew Neck, V-Neck, Polo Collar, Zip Collar, Hooded, Funnel Neck or Spread Collar; otherwise null.",
                "- sleeveType: use values such as Short Sleeve, Long Sleeve, Sleeveless or Raglan Sleeve; otherwise null.",
                "- logoPresent: true only when visible branding, a badge, emblem, monogram or wordmark is present.",
                "- logoType: describe the visible branding format, for example Wordmark, Chest Badge, Embroidered Emblem, Monogram, Graphic Logo or Repeating Logo.",
                "- logoPosition: use a concise position such as Left Chest, Centre Chest, Full Front, Sleeve, Collar, Hem, Upper Back or All Over.",
                "- logoSize: use Small, Medium, Large or All Over.",
                "- When logoPresent is false, logoType, logoPosition and logoSize must all be null.",
                "- pattern: describe the main visual pattern, for example Plain, Striped, Checked, Colour Block, Camouflage, Monogram, Graphic Print or Repeating Pattern.",
                "- materialAppearance: describe only visible material appearance, for example Smooth Jersey, Piqué Knit, Fleece-Backed, Quilted, Puffer, Woven, Denim-Like, Nylon-Like or Technical Fabric.",
                "- styleClassification: provide 1 to 5 concise style labels such as Minimal, Streetwear, Luxury Casual, Sportswear, Smart Casual, Graphic, Heritage or Technical.",
                "- seasonality: use one or more of Spring, Summer, Autumn, Winter or All Season when visually supportable.",
                "- genderPresentation: use Menswear, Womenswear, Unisex or null. Base this on garment presentation only, not the person wearing it.",
                "- frontDescription: briefly describe the visible front layout, branding, panels, graphics, fastenings and defining details.",
                "- backDescription: describe the back only when visible; otherwise null.",
                "- keyFeatures: provide 2 to 8 concise, visible construction or design features.",
                "- matchingKeywords: provide 5 to 15 compact search terms useful for finding the same or a closely related product.",
                "- visualFingerprint: provide 5 to 12 stable visual identifiers useful for comparing this image with supplier catalogue images. Prefer distinctive combinations of colour, garment type, logo placement, graphic layout, trims, panels and construction.",
                "- confidence: score overall extraction confidence from 0 to 100. Reduce it when the product is obscured, low resolution, folded, partially shown or visually ambiguous.",
              ].join(
                "\n",
              ),
            },

            {
              type:
                "input_image",

              image_url:
                cleanedImageUrl,

              detail:
                "high",
            },
          ],
        },
      ],
    });

  if (
    !response.output_text
      .trim()
  ) {
    throw new Error(
      "Product Vision returned an empty response.",
    );
  }

  const vision =
    parseVision(
      response.output_text,
    );

  return {
    vision,
    model,
  };
}