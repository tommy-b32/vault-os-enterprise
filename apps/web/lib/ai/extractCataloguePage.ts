import "server-only";

import OpenAI from "openai";

export type CatalogueGarmentBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CataloguePageGarmentExtraction = {
  id: string;

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

  visualFingerprint: string[];

  boundingBox: CatalogueGarmentBoundingBox;

  confidence: number;
  warnings: string[];
};

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

  garments: CataloguePageGarmentExtraction[];

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

function clampUnitInterval(
  value: unknown,
): number {
  const number =
    toNullableNumber(
      value,
    ) ?? 0;

  return Math.max(
    0,
    Math.min(
      1,
      number,
    ),
  );
}

function normaliseBoundingBox(
  value: unknown,
): CatalogueGarmentBoundingBox {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    };
  }

  const box =
    value as Record<
      string,
      unknown
    >;

  const x =
    clampUnitInterval(
      box.x,
    );

  const y =
    clampUnitInterval(
      box.y,
    );

  const width =
    clampUnitInterval(
      box.width,
    );

  const height =
    clampUnitInterval(
      box.height,
    );

  return {
    x,
    y,
    width:
      Math.min(
        width || 1,
        1 - x,
      ),

    height:
      Math.min(
        height || 1,
        1 - y,
      ),
  };
}

function normaliseGarments(
  value: unknown,
  pageNumber: number,
): CataloguePageGarmentExtraction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(
      (
        item,
        index,
      ) => {
        if (
          typeof item !== "object" ||
          item === null
        ) {
          return null;
        }

        const garment =
          item as Record<
            string,
            unknown
          >;

        const productType =
          toNullableString(
            garment.productType,
          );

        const garmentType =
          toNullableString(
            garment.garmentType,
          ) ??
          productType;

        return {
          id:
            toNullableString(
              garment.id,
            ) ??
            `page-${pageNumber}-garment-${index + 1}`,

          brand:
            toNullableString(
              garment.brand,
            ),

          productName:
            toNullableString(
              garment.productName,
            ),

          productType:
            productType ??
            garmentType,

          garmentType,

          colour:
            toNullableString(
              garment.colour,
            ),

          secondaryColours:
            toStringArray(
              garment.secondaryColours,
            ),

          chestLogo:
            toNullableString(
              garment.chestLogo,
            ),

          frontGraphic:
            toNullableString(
              garment.frontGraphic,
            ),

          backGraphic:
            toNullableString(
              garment.backGraphic,
            ),

          sleeveDetail:
            toNullableString(
              garment.sleeveDetail,
            ),

          neckLabel:
            toNullableString(
              garment.neckLabel,
            ),

          visualFingerprint:
            toStringArray(
              garment.visualFingerprint,
            ),

          boundingBox:
            normaliseBoundingBox(
              garment.boundingBox,
            ),

          confidence:
            clampConfidence(
              garment.confidence,
            ),

          warnings:
            toStringArray(
              garment.warnings,
            ),
        };
      },
    )
    .filter(
      (
        garment,
      ): garment is CataloguePageGarmentExtraction =>
        garment !== null,
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
                '  "garments": [',
                '    {',
                '      "id": string,',
                '      "brand": string | null,',
                '      "productName": string | null,',
                '      "productType": string | null,',
                '      "garmentType": string | null,',
                '      "colour": string | null,',
                '      "secondaryColours": string[],',
                '      "chestLogo": string | null,',
                '      "frontGraphic": string | null,',
                '      "backGraphic": string | null,',
                '      "sleeveDetail": string | null,',
                '      "neckLabel": string | null,',
                '      "visualFingerprint": string[],',
                '      "boundingBox": {',
                '        "x": number,',
                '        "y": number,',
                '        "width": number,',
                '        "height": number',
                '      },',
                '      "confidence": number,',
                '      "warnings": string[]',
                '    }',
                '  ],',
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
                "- Detect every distinct garment shown on the page and return each one in garments.",
                "- Analyse every garment independently. Never copy the dominant garment's colour, logo description, name or bounding box into another garment.",
                "- For every garment, colour must describe that garment itself, not the page background or another nearby garment.",
                "- When garments are side by side, explicitly distinguish them by position and appearance, for example left black T-Shirt and right white T-Shirt.",
                "- Every garment must have its own accurate boundingBox tightly surrounding that garment only.",
                "- Do not return identical bounding boxes for separate garments.",
                "- Before returning the JSON, verify that each garment's colour agrees with the pixels inside its own boundingBox.",
                "- If two garments share the same design but have different colours, return two separate garment records with their respective colours.",
                "- Include position wording such as left, centre or right inside each garment's visualFingerprint.",
                "- A garment visualFingerprint must include its dominant colour, garment type, visible logo or graphic, and relative page position.",
                "- Do not merge separate garments, colour variants or side-by-side products into one garment record.",
                "- Return garments in visual reading order from left to right, then top to bottom.",
                "- boundingBox values must be percentages from 0 to 1 relative to the full page image.",
                "- x and y are the top-left position; width and height are the size of the garment region.",
                "- Include one garment record even when the page contains only one garment.",
                "- Keep the existing top-level product fields as a summary of the dominant garment for backward compatibility.",
                "- Set pageRole to mixed when multiple distinct garments or products appear.",
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

    garments:
      normaliseGarments(
        parsed.garments,
        pageNumber,
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