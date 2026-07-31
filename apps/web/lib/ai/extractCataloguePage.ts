import "server-only";

import OpenAI from "openai";

export type CataloguePageExtraction = {
  pageNumber: number;

  brand: string | null;
  productName: string | null;
  productType: string | null;
  garmentType: string | null;

  colour: string | null;
  secondaryColours: string[];

  chestLogo: string | null;
  frontGraphic: string | null;
  backGraphic: string | null;
  sleeveDetail: string | null;
  neckLabel: string | null;

  fit: string | null;
  collection: string | null;

  displayedPrice: number | null;
  currency: string | null;
  supplierSku: string | null;

  sizes: string[];
  packQuantity: number | null;
  imageCount: number;

  pageRole:
    | "official-product"
    | "supplier-product"
    | "detail"
    | "label"
    | "mixed"
    | "unknown";

  possibleSameProductAsPreviousPage: boolean;

  rawVisibleText: string[];
  visualFingerprint: string[];

  confidence: number;
  warnings: string[];
};

type ExtractCataloguePageInput = {
  pageNumber: number;
  imageDataUrl: string;
};

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

function removeCodeFence(
  value: string,
): string {
  return value
    .replace(
      /^```json\s*/i,
      "",
    )
    .replace(
      /^```\s*/i,
      "",
    )
    .replace(
      /\s*```$/i,
      "",
    )
    .trim();
}

function toNullableString(
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

function toNullableNumber(
  value: unknown,
): number | null {
  if (
    typeof value ===
      "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const cleaned =
    value
      .replace(
        /[^0-9.,-]/g,
        "",
      )
      .replace(
        ",",
        ".",
      );

  const parsed =
    Number.parseFloat(
      cleaned,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null;
}

function toStringArray(
  value: unknown,
): string[] {
  if (
    !Array.isArray(value)
  ) {
    return [];
  }

  return value
    .filter(
      (
        item,
      ): item is string =>
        typeof item ===
        "string",
    )
    .map(
      (item) =>
        item.trim(),
    )
    .filter(Boolean);
}

function clampConfidence(
  value: unknown,
): number {
  const confidence =
    toNullableNumber(
      value,
    ) ?? 0;

  return Math.round(
    Math.max(
      0,
      Math.min(
        100,
        confidence,
      ),
    ),
  );
}

function normalisePageRole(
  value: unknown,
): CataloguePageExtraction["pageRole"] {
  const allowedRoles:
    CataloguePageExtraction["pageRole"][] =
    [
      "official-product",
      "supplier-product",
      "detail",
      "label",
      "mixed",
      "unknown",
    ];

  if (
    allowedRoles.includes(
      value as CataloguePageExtraction["pageRole"],
    )
  ) {
    return value as CataloguePageExtraction["pageRole"];
  }

  return "unknown";
}

export async function extractCataloguePage({
  pageNumber,
  imageDataUrl,
}: ExtractCataloguePageInput): Promise<CataloguePageExtraction> {
  if (
    !imageDataUrl.startsWith(
      "data:image/",
    )
  ) {
    throw new Error(
      "A valid page image data URL is required.",
    );
  }

  const openai =
    createOpenAIClient();

  const response =
    await openai.responses.create({
      model:
        process.env.OPENAI_CATALOGUE_VISION_MODEL ||
        "gpt-5",

      store: false,

      input: [
        {
          role: "user",

          content: [
            {
              type: "input_text",

              text: [
                "You are Vault Vision, a specialist clothing catalogue analyst.",
                "Analyse the supplied supplier-catalogue page as a visual product expert.",
                "Return one valid JSON object only. Do not wrap it in Markdown.",
                "",
                "Identify the product from all visible evidence, including logos, typography, artwork, garment shape, labels, colour and page text.",
                "A brand can be identified from a clearly visible logo or wordmark even when the page does not explicitly label it as a brand.",
                "When no official product name is printed, create a short descriptive product name based only on visible evidence, for example: 'Rainbow Logo T-Shirt' or 'Small Badge Polo'.",
                "Do not invent a brand when the logo or wording is unclear.",
                "Do not claim that a visual design is an exact match to an existing retail product.",
                "",
                "Return exactly this structure:",
                "{",
                '  "brand": string | null,',
                '  "productName": string | null,',
                '  "productType": string | null,',
                '  "garmentType": string | null,',
                '  "colour": string | null,',
                '  "secondaryColours": string[],',
                '  "chestLogo": string | null,',
                '  "frontGraphic": string | null,',
                '  "backGraphic": string | null,',
                '  "sleeveDetail": string | null,',
                '  "neckLabel": string | null,',
                '  "fit": string | null,',
                '  "collection": string | null,',
                '  "displayedPrice": number | null,',
                '  "currency": string | null,',
                '  "supplierSku": string | null,',
                '  "sizes": string[],',
                '  "packQuantity": number | null,',
                '  "imageCount": number,',
                '  "pageRole": "official-product" | "supplier-product" | "detail" | "label" | "mixed" | "unknown",',
                '  "possibleSameProductAsPreviousPage": boolean,',
                '  "rawVisibleText": string[],',
                '  "visualFingerprint": string[],',
                '  "confidence": number,',
                '  "warnings": string[]',
                "}",
                "",
                "Field guidance:",
                "- brand: the clearly visible brand or wordmark. Use null if genuinely uncertain.",
                "- productName: a concise visible or descriptive product name. Do not include the colour unless needed to distinguish the item.",
                "- productType and garmentType: use practical clothing categories such as T-Shirt, Polo Shirt, Hoodie, Sweatshirt, Jacket, Gilet, Trousers, Shorts, Footwear or Accessory.",
                "- colour: the dominant garment colour.",
                "- secondaryColours: other important visible colours in logos, prints or panels.",
                "- chestLogo: describe a visible chest logo, badge or wordmark and its approximate position.",
                "- frontGraphic: describe the main front artwork, print or pattern.",
                "- backGraphic: describe visible rear artwork only when shown.",
                "- sleeveDetail: describe visible sleeve branding, stripes, patches or trims.",
                "- neckLabel: record visible neck-label wording only when readable.",
                "- fit: use values such as regular, slim, oversized, relaxed or null when unsupported.",
                "- collection: record a visible collection or range name only.",
                "- visualFingerprint: provide 3 to 8 short stable visual identifiers, for example 'white base', 'rainbow arched wordmark', 'small left chest print', 'crew neck', 'short sleeve'.",
                "- rawVisibleText: include useful visible words exactly as seen, excluding repeated browser chrome where possible.",
                "- warnings: explain uncertainty, obstructed logos, multiple products, unreadable text or conflicting visual evidence.",
                "",
                "Accuracy rules:",
                "- Use only evidence visibly supported by the image.",
                "- Prefer null over guessing.",
                "- A visible retail website price is not a supplier cost.",
                "- Do not invent prices, sizes, SKUs, pack quantities, labels or collection names.",
                "- If multiple distinct products appear, describe the dominant product and set pageRole to mixed.",
                "- Confidence must be between 0 and 100 and should reflect confidence in the overall extraction, not image quality alone.",
              ].join(
                "\n",
              ),
            },

            {
              type:
                "input_image",

              image_url:
                imageDataUrl,

              detail:
                "high",
            },
          ],
        },
      ],
    });

  const outputText =
    removeCodeFence(
      response.output_text,
    );

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
      "Invalid Vault Vision output:",
      outputText,
    );

    throw new Error(
      "Vault Vision returned invalid JSON.",
    );
  }

  const productType =
    toNullableString(
      parsed.productType,
    );

  const garmentType =
    toNullableString(
      parsed.garmentType,
    ) ??
    productType;

  return {
    pageNumber,

    brand:
      toNullableString(
        parsed.brand,
      ),

    productName:
      toNullableString(
        parsed.productName,
      ),

    productType:
      productType ??
      garmentType,

    garmentType,

    colour:
      toNullableString(
        parsed.colour,
      ),

    secondaryColours:
      toStringArray(
        parsed.secondaryColours,
      ),

    chestLogo:
      toNullableString(
        parsed.chestLogo,
      ),

    frontGraphic:
      toNullableString(
        parsed.frontGraphic,
      ),

    backGraphic:
      toNullableString(
        parsed.backGraphic,
      ),

    sleeveDetail:
      toNullableString(
        parsed.sleeveDetail,
      ),

    neckLabel:
      toNullableString(
        parsed.neckLabel,
      ),

    fit:
      toNullableString(
        parsed.fit,
      ),

    collection:
      toNullableString(
        parsed.collection,
      ),

    displayedPrice:
      toNullableNumber(
        parsed.displayedPrice,
      ),

    currency:
      toNullableString(
        parsed.currency,
      ),

    supplierSku:
      toNullableString(
        parsed.supplierSku,
      ),

    sizes:
      toStringArray(
        parsed.sizes,
      ),

    packQuantity:
      toNullableNumber(
        parsed.packQuantity,
      ),

    imageCount:
      Math.max(
        0,
        Math.round(
          toNullableNumber(
            parsed.imageCount,
          ) ?? 0,
        ),
      ),

    pageRole:
      normalisePageRole(
        parsed.pageRole,
      ),

    possibleSameProductAsPreviousPage:
      parsed.possibleSameProductAsPreviousPage ===
      true,

    rawVisibleText:
      toStringArray(
        parsed.rawVisibleText,
      ),

    visualFingerprint:
      toStringArray(
        parsed.visualFingerprint,
      ),

    confidence:
      clampConfidence(
        parsed.confidence,
      ),

    warnings:
      toStringArray(
        parsed.warnings,
      ),
  };
}