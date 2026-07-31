import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

import {
  ProductVisionRepository,
} from "@/lib/vision/ProductVisionRepository";

import type {
  CatalogueProduct,
  CatalogueSupplier,
  ConfigurationState,
  InventoryStrategy,
  PackProfile,
  ProductCommercialCost,
  ProductIntelligenceProfile,
  ProductSalesIntelligence,
} from "@/types/catalogue";

type BrainConfidence =
  | "high"
  | "limited"
  | "untrusted";

type StyleCatalogueRow = {
  style_id: string;

  parent_product_id: string;
  parent_product_name: string;

  product_name: string;
  style_name: string;

  handle: string | null;
  vendor: string | null;
  product_type: string | null;
  shopify_status: string | null;

  supplier_id: string | null;
  supplier_company: string | null;

  inventory_strategy: InventoryStrategy | null;
  restock_enabled: boolean | null;

  pack_profile: PackProfile | null;
  pack_size: number | null;

  supplier_moq_packs: number | null;
  target_stock_days: number | null;

  decision_reason: string | null;
  notes: string | null;

  configuration_score: number | null;
  missing_requirements: string[] | null;
  missing_requirement_count: number | null;

  configuration_state: ConfigurationState | null;
  configuration_trusted: boolean | null;
  trusted_for_reorder: boolean | null;
  brain_confidence: BrainConfidence | null;

  stock_on_hand: number | null;
  committed_stock: number | null;
  incoming_stock: number | null;

  complete_packs: number | null;
  loose_units: number | null;

  small_stock: number | null;
  medium_stock: number | null;
  large_stock: number | null;
  xl_stock: number | null;
  xxl_stock: number | null;
  xxxl_stock: number | null;

  missing_sizes: string[] | null;
  stock_status: string | null;
};

type CommercialRow =
  ProductCommercialCost & {
    product_id: string;
  };

export type CatalogueConfigurationSummary = {
  total_products: number;

  fully_configured_products: number;
  products_needing_configuration: number;
  almost_ready_products: number;

  dropship_products: number;
  do_not_restock_products: number;
  discontinued_products: number;
  service_products: number;

  reorder_ready_products: number;

  average_configuration_score: number;
  catalogue_completion_percentage: number;
};

export type CatalogueData = {
  products: CatalogueProduct[];
  suppliers: CatalogueSupplier[];
  summary: CatalogueConfigurationSummary;
};

const EMPTY_COMMERCIAL_COST:
  ProductCommercialCost = {
    currency: "GBP",
    exchange_rate_to_gbp: 1,

    pack_cost: null,
    shipping_cost_per_pack: null,
    import_cost_per_pack: null,

    units_per_pack: null,

    landed_cost_per_pack: null,
    landed_cost_per_pack_gbp: null,
    landed_cost_per_unit: null,

    average_selling_price: null,

    estimated_gross_profit_per_unit: null,
    estimated_margin_percent: null,

    estimated_return_on_pack_capital_percent:
      null,

    commercial_cost_trusted: false,
    missing_commercial_requirements: [],

    last_supplier_price_update: null,
    commercial_notes: null,
  };

const EMPTY_SALES_INTELLIGENCE:
  ProductSalesIntelligence = {
    average_daily_sales: null,
    average_weekly_sales: null,
    average_monthly_sales: null,

    last_sale_date: null,
    days_since_last_sale: null,

    sales_velocity: "unknown",

    reorder_point: null,
    safety_stock: null,
  };

function normaliseProductVisionId(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /\s*::\s*/g,
      "::",
    )
    .replace(
      /\s+/g,
      " ",
    );
}

function createProductIntelligence(
  row: StyleCatalogueRow,
): ProductIntelligenceProfile {
  const styleName =
    row.style_name?.trim() || null;

  const parentName =
    row.parent_product_name?.trim() || null;

  const aliases = Array.from(
    new Set(
      [
        styleName,
        parentName,
        row.product_name,
      ].filter(
        (value): value is string =>
          Boolean(value?.trim()),
      ),
    ),
  );

  return {
    brand:
      row.vendor?.trim() || null,

    official_product_name:
      styleName,

    aliases,

    /*
     * Shopify option_1 currently contains the
     * style or design name rather than a
     * guaranteed colour value.
     *
     * Product Vision V2 now provides the
     * visually detected colour separately.
     */
    primary_colour: null,

    secondary_colours: [],

    garment_type:
      row.product_type?.trim() || null,

    chest_logo: null,

    front_graphic:
      styleName,

    back_graphic: null,
    sleeve_detail: null,
    neck_label: null,

    fit: null,
    collection: null,

    visual_fingerprint:
      styleName
        ? [
            styleName,
            row.product_name,
          ]
        : [
            row.product_name,
          ],

    confidence:
      styleName &&
      styleName !== "Default"
        ? 45
        : 10,

    reviewed: false,
  };
}

function buildSummary(
  products: CatalogueProduct[],
): CatalogueConfigurationSummary {
  const totalProducts =
    products.length;

  const fullyConfiguredProducts =
    products.filter(
      (product) =>
        product.configuration_score === 100,
    ).length;

  const almostReadyProducts =
    products.filter(
      (product) =>
        product.configuration_state ===
        "almost_ready",
    ).length;

  const dropshipProducts =
    products.filter(
      (product) =>
        product.configuration_state ===
        "dropship_ready",
    ).length;

  const doNotRestockProducts =
    products.filter(
      (product) =>
        product.configuration_state ===
        "do_not_restock",
    ).length;

  const discontinuedProducts =
    products.filter(
      (product) =>
        product.configuration_state ===
        "discontinued",
    ).length;

  const serviceProducts =
    products.filter(
      (product) =>
        product.configuration_state ===
        "service",
    ).length;

  const reorderReadyProducts =
    products.filter(
      (product) =>
        product.trusted_for_reorder,
    ).length;

  const averageConfigurationScore =
    totalProducts > 0
      ? Number(
          (
            products.reduce(
              (total, product) =>
                total +
                product.configuration_score,
              0,
            ) /
            totalProducts
          ).toFixed(1),
        )
      : 0;

  const completionPercentage =
    totalProducts > 0
      ? Number(
          (
            (
              fullyConfiguredProducts /
              totalProducts
            ) *
            100
          ).toFixed(1),
        )
      : 0;

  return {
    total_products:
      totalProducts,

    fully_configured_products:
      fullyConfiguredProducts,

    products_needing_configuration:
      totalProducts -
      fullyConfiguredProducts,

    almost_ready_products:
      almostReadyProducts,

    dropship_products:
      dropshipProducts,

    do_not_restock_products:
      doNotRestockProducts,

    discontinued_products:
      discontinuedProducts,

    service_products:
      serviceProducts,

    reorder_ready_products:
      reorderReadyProducts,

    average_configuration_score:
      averageConfigurationScore,

    catalogue_completion_percentage:
      completionPercentage,
  };
}

export async function getCatalogueData():
  Promise<CatalogueData> {
  const [
    styleResponse,
    supplierResponse,
    commercialResponse,
    productVisionByProductId,
  ] = await Promise.all([
    supabaseAdmin
      .from(
        "vault_style_catalogue_intelligence",
      )
      .select(`
        style_id,
        parent_product_id,
        parent_product_name,
        product_name,
        style_name,
        handle,
        vendor,
        product_type,
        shopify_status,
        supplier_id,
        supplier_company,
        inventory_strategy,
        restock_enabled,
        pack_profile,
        pack_size,
        supplier_moq_packs,
        target_stock_days,
        decision_reason,
        notes,
        configuration_score,
        missing_requirements,
        missing_requirement_count,
        configuration_state,
        configuration_trusted,
        trusted_for_reorder,
        brain_confidence,
        stock_on_hand,
        committed_stock,
        incoming_stock,
        complete_packs,
        loose_units,
        small_stock,
        medium_stock,
        large_stock,
        xl_stock,
        xxl_stock,
        xxxl_stock,
        missing_sizes,
        stock_status
      `)
      .order(
        "product_name",
        {
          ascending: true,
        },
      ),

    supabaseAdmin
      .from("vault_suppliers")
      .select(
        "id, supplier_name",
      )
      .eq(
        "is_active",
        true,
      )
      .order(
        "supplier_name",
        {
          ascending: true,
        },
      ),

    supabaseAdmin
      .from(
        "vault_product_commercial_intelligence",
      )
      .select(`
        product_id,
        currency,
        exchange_rate_to_gbp,
        pack_cost,
        shipping_cost_per_pack,
        import_cost_per_pack,
        units_per_pack,
        landed_cost_per_pack,
        landed_cost_per_pack_gbp,
        landed_cost_per_unit,
        average_selling_price,
        estimated_gross_profit_per_unit,
        estimated_margin_percent,
        estimated_return_on_pack_capital_percent,
        commercial_cost_trusted,
        missing_commercial_requirements,
        last_supplier_price_update,
        commercial_notes
      `),

    ProductVisionRepository
      .getMapByProductId(),
  ]);

  const error =
    styleResponse.error ??
    supplierResponse.error ??
    commercialResponse.error;

  if (error) {
    throw new Error(
      error.message,
    );
  }

  const styleRows =
    (styleResponse.data ??
      []) as StyleCatalogueRow[];

  const suppliers =
    (supplierResponse.data ??
      []) as CatalogueSupplier[];

  const commercialRows =
    (commercialResponse.data ??
      []) as CommercialRow[];

  /*
   * Product Vision IDs should match style_id exactly.
   * The normalised map provides a safe fallback for
   * differences in casing or spacing around "::".
   */
  const normalisedProductVisionByProductId =
    new Map(
      [...productVisionByProductId.entries()].map(
        ([
          productId,
          productVision,
        ]) => [
          normaliseProductVisionId(
            productId,
          ),
          productVision,
        ],
      ),
    );

  const commercialByParentProduct =
    new Map<
      string,
      ProductCommercialCost
    >();

  for (
    const row of
    commercialRows
  ) {
    commercialByParentProduct.set(
      row.product_id,
      {
        currency:
          row.currency ??
          "GBP",

        exchange_rate_to_gbp:
          row.exchange_rate_to_gbp ??
          1,

        pack_cost:
          row.pack_cost,

        shipping_cost_per_pack:
          row.shipping_cost_per_pack,

        import_cost_per_pack:
          row.import_cost_per_pack,

        units_per_pack:
          row.units_per_pack,

        landed_cost_per_pack:
          row.landed_cost_per_pack,

        landed_cost_per_pack_gbp:
          row.landed_cost_per_pack_gbp,

        landed_cost_per_unit:
          row.landed_cost_per_unit,

        average_selling_price:
          row.average_selling_price,

        estimated_gross_profit_per_unit:
          row.estimated_gross_profit_per_unit,

        estimated_margin_percent:
          row.estimated_margin_percent,

        estimated_return_on_pack_capital_percent:
          row.estimated_return_on_pack_capital_percent,

        commercial_cost_trusted:
          row.commercial_cost_trusted ??
          false,

        missing_commercial_requirements:
          row.missing_commercial_requirements ??
          [],

        last_supplier_price_update:
          row.last_supplier_price_update,

        commercial_notes:
          row.commercial_notes,
      },
    );
  }

  const products:
    CatalogueProduct[] =
    styleRows.map(
      (style) => {
        const commercialCost =
          commercialByParentProduct.get(
            style.parent_product_id,
          ) ??
          EMPTY_COMMERCIAL_COST;

        const productVision =
          productVisionByProductId.get(
            style.style_id,
          ) ??
          normalisedProductVisionByProductId.get(
            normaliseProductVisionId(
              style.style_id,
            ),
          ) ??
          null;

        const missingRequirements =
          style.missing_requirements ??
          [];

        return {
          product_id:
            style.style_id,

          product_name:
            style.product_name,

          /*
           * Existing metadata-derived profile.
           * Retained for backwards compatibility
           * while matching migrates to Vision V2.
           */
          product_intelligence:
            createProductIntelligence(
              style,
            ),

          /*
           * AI-generated visual profile loaded
           * from vault_product_vision.
           */
          product_vision:
            productVision,

          product_type:
            style.product_type,

          status:
            style.shopify_status,

          supplier_id:
            style.supplier_id,

          supplier_company:
            style.supplier_company,

          inventory_strategy:
            style.inventory_strategy ??
            "stocked",

          restock_enabled:
            style.restock_enabled ??
            true,

          pack_profile:
            style.pack_profile,

          supplier_moq_packs:
            style.supplier_moq_packs,

          target_stock_days:
            style.target_stock_days,

          decision_reason:
            style.decision_reason,

          notes: [
            style.notes,

            `Parent Shopify product: ${style.parent_product_name}.`,

            `Style: ${style.style_name}.`,

            style.stock_status
              ? `Stock status: ${style.stock_status}.`
              : null,

            style.missing_sizes &&
            style.missing_sizes.length > 0
              ? `Missing sizes: ${style.missing_sizes.join(
                  ", ",
                )}.`
              : null,
          ]
            .filter(
              (
                value,
              ): value is string =>
                Boolean(
                  value,
                ),
            )
            .join(" "),

          stock_on_hand:
            Math.max(
              0,
              style.stock_on_hand ??
              0,
            ),

          complete_packs:
            Math.max(
              0,
              style.complete_packs ??
              0,
            ),

          loose_units:
            Math.max(
              0,
              style.loose_units ??
              0,
            ),

          sales_intelligence: {
            ...EMPTY_SALES_INTELLIGENCE,
          },

          configuration_score:
            style.configuration_score ??
            0,

          configuration_state:
            style.configuration_state ??
            "needs_configuration",

          missing_requirements: [
            ...missingRequirements,
          ],

          missing_requirement_count:
            style.missing_requirement_count ??
            missingRequirements.length,

          configuration_trusted:
            style.configuration_trusted ??
            false,

          trusted_for_reorder:
            style.trusted_for_reorder ??
            false,

          brain_confidence:
            style.brain_confidence ??
            "untrusted",

          commercial_cost: {
            ...commercialCost,

            units_per_pack:
              commercialCost.units_per_pack ??
              style.pack_size,

            missing_commercial_requirements: [
              ...commercialCost
                .missing_commercial_requirements,
            ],
          },
        };
      },
    );

  if (
    process.env.NODE_ENV !==
    "production"
  ) {
    const attachedVisionCount =
      products.filter(
        (product) =>
          product.product_vision !==
          null,
      ).length;

    console.info(
      `[Catalogue] Product Vision attached to ${attachedVisionCount} of ${products.length} catalogue styles.`,
    );

    if (
      attachedVisionCount !==
      products.length
    ) {
      const missingVisionIds =
        products
          .filter(
            (product) =>
              product.product_vision ===
              null,
          )
          .slice(
            0,
            10,
          )
          .map(
            (product) =>
              product.product_id,
          );

      console.warn(
        "[Catalogue] Example styles missing Product Vision:",
        missingVisionIds,
      );
    }
  }

  return {
    products,
    suppliers,

    summary:
      buildSummary(
        products,
      ),
  };
}

export async function getCatalogueProducts():
  Promise<CatalogueProduct[]> {
  const {
    products,
  } = await getCatalogueData();

  return products;
}