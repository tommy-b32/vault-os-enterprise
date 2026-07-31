import type {
  CatalogueVisionData,
} from "@/types/catalogue-vision";

import type {
  CatalogueProduct,
  ProductIntelligenceProfile,
} from "@/types/catalogue";

import type {
  ProductVision,
} from "@/types/product-vision";

export type IdentityConflictReason =
  | "brand_conflict"
  | "visible_text_brand_conflict"
  | "garment_type_conflict";

export type IdentityConflict = {
  reason: IdentityConflictReason;
  label: string;
  supplierValue: string | null;
  productValue: string | null;
};

export type IdentityVerificationResult = {
  valid: boolean;
  conflicts: IdentityConflict[];
  supplierBrand: string | null;
  productBrand: string | null;
  visibleBrands: string[];
};

type VerifyIdentityInput = {
  supplierVision: CatalogueVisionData;
  product: CatalogueProduct;
  productVision: ProductVision | null;
  productIntelligence: ProductIntelligenceProfile;
};

const BRAND_ALIASES: Record<string, string[]> = {
  amiri: ["amiri"],
  balmain: ["balmain"],
  burberry: ["burberry"],
  casablanca: ["casablanca", "casa blanca"],
  dior: ["dior", "christian dior"],
  "dolce & gabbana": [
    "dolce gabbana",
    "dolce and gabbana",
    "d g",
    "d&g",
  ],
  dsquared2: [
    "dsquared",
    "dsquared2",
    "d squared",
  ],
  essentials: [
    "essentials",
    "fear of god essentials",
  ],
  "fred perry": ["fred perry"],
  "louis vuitton": [
    "louis vuitton",
    "lv",
  ],
  moncler: [
    "moncler",
    "mnclr",
  ],
  "off-white": [
    "off white",
    "offwhite",
  ],
  prada: ["prada"],
  "stone island": ["stone island"],
};

function normaliseText(
  value: string | null | undefined,
): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalBrand(
  value: string | null | undefined,
): string | null {
  const normalised =
    normaliseText(value);

  if (!normalised) {
    return null;
  }

  for (
    const [
      canonical,
      aliases,
    ] of Object.entries(
      BRAND_ALIASES,
    )
  ) {
    const matches =
      aliases.some(
        (alias) => {
          const normalisedAlias =
            normaliseText(alias);

          return (
            normalised ===
              normalisedAlias ||
            normalised.includes(
              normalisedAlias,
            )
          );
        },
      );

    if (matches) {
      return canonical;
    }
  }

  return normalised;
}

function extractVisibleBrands(
  values: string[],
): string[] {
  const combined =
    normaliseText(
      values.join(" "),
    );

  if (!combined) {
    return [];
  }

  const brands =
    new Set<string>();

  for (
    const [
      canonical,
      aliases,
    ] of Object.entries(
      BRAND_ALIASES,
    )
  ) {
    const found =
      aliases.some(
        (alias) => {
          const normalisedAlias =
            normaliseText(alias);

          if (!normalisedAlias) {
            return false;
          }

          return (
            combined ===
              normalisedAlias ||
            combined.includes(
              ` ${normalisedAlias} `,
            ) ||
            combined.startsWith(
              `${normalisedAlias} `,
            ) ||
            combined.endsWith(
              ` ${normalisedAlias}`,
            )
          );
        },
      );

    if (found) {
      brands.add(canonical);
    }
  }

  return [
    ...brands,
  ];
}

function garmentFamily(
  value: string | null | undefined,
): string | null {
  const normalised =
    normaliseText(value);

  if (!normalised) {
    return null;
  }

  if (normalised.includes("polo")) {
    return "polo";
  }

  if (
    normalised.includes("t shirt") ||
    normalised.includes("tee")
  ) {
    return "t-shirt";
  }

  if (
    normalised.includes("hoodie") ||
    normalised.includes("hooded")
  ) {
    return "hoodie";
  }

  if (
    normalised.includes("sweatshirt") ||
    normalised.includes("sweater")
  ) {
    return "sweatshirt";
  }

  if (
    normalised.includes("gilet") ||
    normalised.includes("bodywarmer")
  ) {
    return "gilet";
  }

  if (
    normalised.includes("jacket") ||
    normalised.includes("coat")
  ) {
    return "jacket";
  }

  if (normalised.includes("shorts")) {
    return "shorts";
  }

  if (
    normalised.includes("trousers") ||
    normalised.includes("pants") ||
    normalised.includes("joggers")
  ) {
    return "trousers";
  }

  if (
    normalised.includes("trainer") ||
    normalised.includes("shoe") ||
    normalised.includes("footwear")
  ) {
    return "footwear";
  }

  if (
    normalised.includes("cap") ||
    normalised.includes("hat")
  ) {
    return "headwear";
  }

  return normalised;
}

function pushConflict(
  conflicts: IdentityConflict[],
  conflict: IdentityConflict,
): void {
  const duplicate =
    conflicts.some(
      (item) =>
        item.reason ===
          conflict.reason &&
        item.supplierValue ===
          conflict.supplierValue &&
        item.productValue ===
          conflict.productValue,
    );

  if (!duplicate) {
    conflicts.push(
      conflict,
    );
  }
}

export const IdentityConflictEngine = {
  verify({
    supplierVision,
    product,
    productVision,
    productIntelligence,
  }: VerifyIdentityInput): IdentityVerificationResult {
    const conflicts:
      IdentityConflict[] = [];

    const supplierBrand =
      canonicalBrand(
        supplierVision.brand,
      );

    const productBrand =
      canonicalBrand(
        productVision?.brand ??
        productIntelligence.brand ??
        product.product_name,
      );

    const visibleBrands =
      extractVisibleBrands([
        ...supplierVision.extractedText,
        supplierVision.productName ?? "",
        supplierVision.chestLogo ?? "",
        supplierVision.frontGraphic ?? "",
        supplierVision.backGraphic ?? "",
        ...supplierVision.visualFingerprint,
      ]);

    if (
      supplierBrand &&
      productBrand &&
      supplierBrand !==
        productBrand
    ) {
      pushConflict(
        conflicts,
        {
          reason:
            "brand_conflict",
          label:
            "Supplier brand conflicts with catalogue brand",
          supplierValue:
            supplierBrand,
          productValue:
            productBrand,
        },
      );
    }

    for (
      const visibleBrand of
      visibleBrands
    ) {
      if (
        productBrand &&
        visibleBrand !==
          productBrand
      ) {
        pushConflict(
          conflicts,
          {
            reason:
              "visible_text_brand_conflict",
            label:
              "Visible garment wording conflicts with catalogue brand",
            supplierValue:
              visibleBrand,
            productValue:
              productBrand,
          },
        );
      }
    }

    const supplierGarment =
      garmentFamily(
        supplierVision.garmentType,
      );

    const productGarment =
      garmentFamily(
        productVision?.subcategory ??
        productVision?.category ??
        productIntelligence.garment_type ??
        product.product_type,
      );

    if (
      supplierGarment &&
      productGarment &&
      supplierGarment !==
        productGarment
    ) {
      pushConflict(
        conflicts,
        {
          reason:
            "garment_type_conflict",
          label:
            "Supplier garment type conflicts with catalogue garment type",
          supplierValue:
            supplierGarment,
          productValue:
            productGarment,
        },
      );
    }

    return {
      valid:
        conflicts.length === 0,

      conflicts,

      supplierBrand,
      productBrand,
      visibleBrands,
    };
  },
} as const;