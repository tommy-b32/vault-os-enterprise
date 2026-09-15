import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

import {
  ProductVisionRepository,
} from "@/lib/vision/ProductVisionRepository";

import type {
  CatalogueProduct,
  CatalogueSupplier,
  SupplierCostProfile,
  ConfigurationState,
  InventoryStrategy,
  PackProfile,
  ProductCommercialCost,
  ProductIntelligenceProfile,
  ProductReorderApproval,
  ReplenishmentIntelligence,
  TradingEvidence,
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

type CommercialRow = Omit<ProductCommercialCost, "realised_asp"> & {
  product_id: string;
  net_revenue_gbp: number | null;
  net_units_sold: number | null;
  order_count: number | null;
  window_start: string | null;
  window_end: string | null;
  latest_sale_at: string | null;
  order_history_freshness: string | null;
  history_complete: boolean | null;
  mapping_complete: boolean | null;
  realised_asp_availability: string | null;
  realised_asp_unavailable_reason: string | null;
};

type ReplenishmentRow = {
  style_id: string;
  parent_product_id: string;
  stock_on_hand: number | null;
  committed_stock: number | null;
  incoming_stock: number | null;
  net_available_stock: number | null;
  average_daily_sales: number | null;
  average_weekly_sales: number | null;
  sales_7_day_units: number | null;
  sales_14_day_units: number | null;
  sales_30_day_units: number | null;
  last_sale_date: string | null;
  days_since_last_sale: number | null;
  sales_history_30_complete: boolean | null;
  sales_history_days: number | null;
  reorder_point: number | null;
  safety_stock: number | null;
  target_stock_days: number | null;
  supplier_lead_time_days: number | null;
  units_per_pack: number | null;
  supplier_moq_packs: number | null;
  freshness: string | null;
  supplier_minimum_order_state: ReplenishmentIntelligence["supplierMinimumOrderState"];
  trusted: boolean;
  missing_requirements: string[] | null;
};

type TradingEvidenceRow = {
  style_id: string;
  maturity_state: TradingEvidence["state"];
  verified_live_days: number | null;
  verified_coverage_days: number | null;
  coverage_complete: boolean | null;
  order_evidence_fresh: boolean | null;
  first_positive_sale_at: string | null;
  selling_days: number | null;
  units_since_live: number | null;
};

type ReorderApprovalRow = {
  product_id: string;
  approval_state: "approved" | "revoked";
  approved_by: string;
  approved_at: string;
  revoked_at: string | null;
};

type OperatorDisplayRow = {
  id: string;
  display_name: string | null;
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
  costProfiles: SupplierCostProfile[];
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
    realised_asp: {
      net_revenue_gbp: 0,
      net_units_sold: 0,
      order_count: 0,
      window_start: null,
      window_end: null,
      latest_sale_at: null,
      order_history_freshness: null,
      history_complete: false,
      mapping_complete: false,
      availability: "unavailable",
      unavailable_reason: "shopify_order_history_unavailable",
    },

    estimated_gross_profit_per_unit: null,
    estimated_margin_percent: null,

    estimated_return_on_pack_capital_percent:
      null,

    commercial_cost_trusted: false,
    missing_commercial_requirements: [],

    last_supplier_price_update: null,
    commercial_notes: null,
    commercial_cost_resolution_mode: "unavailable",
    effective_profile_id: null,
    effective_profile_version_id: null,
    cost_type_id: null,
    pack_cost_source: "unavailable",
    shipping_cost_source: "unavailable",
    import_cost_source: "unavailable",
    units_source: "unavailable",
    fx_source: "unavailable",
    profile_price_updated_at: null,
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
    costProfileResponse,
    commercialResponse,
    replenishmentResponse,
    tradingEvidenceResponse,
    productVisionByProductId,
    approvalResponse,
    operatorResponse,
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
      .from("vault_supplier_product_type_cost_profiles")
      .select("id, supplier_id, supplier_currency, price_updated_at, active, vault_suppliers!inner(supplier_name), vault_cost_types!inner(id, display_name)")
      .eq("active", true),

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
        net_revenue_gbp,
        net_units_sold,
        order_count,
        window_start,
        window_end,
        latest_sale_at,
        order_history_freshness,
        history_complete,
        mapping_complete,
        realised_asp_availability,
        realised_asp_unavailable_reason,
        estimated_gross_profit_per_unit,
        estimated_margin_percent,
        estimated_return_on_pack_capital_percent,
        commercial_cost_trusted,
        missing_commercial_requirements,
        last_supplier_price_update,
        commercial_notes
        ,commercial_cost_resolution_mode,
        effective_profile_id,
        effective_profile_version_id,
        cost_type_id,
        pack_cost_source,
        shipping_cost_source,
        import_cost_source,
        units_source,
        fx_source,
        profile_price_updated_at
      `),

    supabaseAdmin
      .from("vault_style_replenishment_intelligence")
      .select(`
        style_id,
        parent_product_id,
        stock_on_hand,
        committed_stock,
        incoming_stock,
        net_available_stock,
        average_daily_sales,
        average_weekly_sales,
        sales_7_day_units,
        sales_14_day_units,
        sales_30_day_units,
        last_sale_date,
        days_since_last_sale,
        sales_history_30_complete,
        sales_history_days,
        reorder_point,
        safety_stock,
        target_stock_days,
        supplier_lead_time_days,
        units_per_pack,
        supplier_moq_packs,
        freshness,
        supplier_minimum_order_state,
        trusted,
        missing_requirements
      `),

    supabaseAdmin
      .from("vault_style_trading_evidence")
      .select(`
        style_id,
        maturity_state,
        verified_live_days,
        verified_coverage_days,
        coverage_complete,
        order_evidence_fresh,
        first_positive_sale_at,
        selling_days,
        units_since_live
      `),

    ProductVisionRepository
      .getMapByProductId(),

    supabaseAdmin
      .from("vault_product_reorder_approvals")
      .select(`
        product_id,
        approval_state,
        approved_by,
        approved_at,
        revoked_at
      `),

    supabaseAdmin
      .from("vault_operators")
      .select("id, display_name"),
  ]);

  const error =
    styleResponse.error ??
    supplierResponse.error ??
    commercialResponse.error ??
    replenishmentResponse.error ??
    tradingEvidenceResponse.error ??
    approvalResponse.error ??
    operatorResponse.error ?? costProfileResponse.error;

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
  const costProfiles = (costProfileResponse.data ?? []).map((row: any) => ({
    id: row.id,
    supplier_id: row.supplier_id,
    supplier_name: row.vault_suppliers.supplier_name,
    cost_type_id: row.vault_cost_types.id,
    cost_type_name: row.vault_cost_types.display_name,
    active: row.active,
    price_updated_at: row.price_updated_at,
  })) as SupplierCostProfile[];

  const commercialRows =
    (commercialResponse.data ??
      []) as CommercialRow[];

  const replenishmentRows =
    (replenishmentResponse.data ?? []) as ReplenishmentRow[];

  const replenishmentByStyle = new Map(
    replenishmentRows.map((row) => [row.style_id, row]),
  );
  const tradingEvidenceByStyle = new Map(
    ((tradingEvidenceResponse.data ?? []) as TradingEvidenceRow[]).map((row) => [row.style_id, row]),
  );

  const approvalRows =
    (approvalResponse.data ??
      []) as ReorderApprovalRow[];

  const operatorRows =
    (operatorResponse.data ??
      []) as OperatorDisplayRow[];

  const operatorDisplayById = new Map(
    operatorRows.map((operator) => [
      operator.id,
      operator.display_name?.trim() ||
        "Vault operator",
    ]),
  );

  const approvalByParentProduct = new Map<
    string,
    ProductReorderApproval
  >(
    approvalRows.map((approval) => [
      approval.product_id,
      {
        approval_state:
          approval.approval_state,
        approved_at:
          approval.approved_at,
        approved_by_display_name:
          operatorDisplayById.get(
            approval.approved_by,
          ) ?? "Vault operator",
        revoked_at:
          approval.revoked_at,
      },
    ]),
  );

  /*
   * Product Vision IDs should match style_id exactly.
   * The normalised map provides a safe fallback for
   * differences in casing or spacing around "::".
   */
  const normalisedProductVisionByProductId =
    new Map(
      [...productVisionByProductId.entries()].map(
        ([
          styleId,
          productVision,
        ]) => [
          normaliseProductVisionId(
            styleId,
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
        realised_asp: {
          net_revenue_gbp: row.net_revenue_gbp ?? 0,
          net_units_sold: row.net_units_sold ?? 0,
          order_count: row.order_count ?? 0,
          window_start: row.window_start,
          window_end: row.window_end,
          latest_sale_at: row.latest_sale_at,
          order_history_freshness: row.order_history_freshness,
          history_complete: row.history_complete ?? false,
          mapping_complete: row.mapping_complete ?? false,
          availability: row.realised_asp_availability === "available" ? "available" : "unavailable",
          unavailable_reason: row.realised_asp_unavailable_reason,
        },

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
        commercial_cost_resolution_mode:
          row.commercial_cost_resolution_mode === "inherited" || row.commercial_cost_resolution_mode === "mixed" || row.commercial_cost_resolution_mode === "product_override"
            ? row.commercial_cost_resolution_mode
            : "unavailable",
        effective_profile_id: row.effective_profile_id,
        effective_profile_version_id: row.effective_profile_version_id,
        cost_type_id: row.cost_type_id,
        pack_cost_source: row.pack_cost_source ?? "unavailable",
        shipping_cost_source: row.shipping_cost_source ?? "unavailable",
        import_cost_source: row.import_cost_source ?? "unavailable",
        units_source: row.units_source ?? "unavailable",
        fx_source: row.fx_source ?? "unavailable",
        profile_price_updated_at: row.profile_price_updated_at,
      },
    );
  }

  const products:
    CatalogueProduct[] =
    styleRows.map(
      (style) => {
        const replenishment = replenishmentByStyle.get(style.style_id);
        const tradingEvidence = tradingEvidenceByStyle.get(style.style_id);
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
          style_id:
            style.style_id,

          parent_product_id:
            style.parent_product_id,

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

          committed_stock: style.committed_stock,
          incoming_stock: style.incoming_stock,

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

          sales_intelligence: replenishment
            ? {
                ...EMPTY_SALES_INTELLIGENCE,
                average_daily_sales: replenishment.average_daily_sales,
                average_weekly_sales: replenishment.average_weekly_sales,
                average_monthly_sales: replenishment.sales_30_day_units,
                last_sale_date: replenishment.last_sale_date,
                days_since_last_sale: replenishment.days_since_last_sale,
                sales_velocity:
                  replenishment.average_daily_sales === null
                    ? "unknown"
                    : replenishment.average_daily_sales >= 1
                      ? "high"
                      : replenishment.average_daily_sales > 0
                        ? "low"
                        : "very_low",
                reorder_point: replenishment.reorder_point,
                safety_stock: replenishment.safety_stock,
              }
            : { ...EMPTY_SALES_INTELLIGENCE },

          replenishment_intelligence: {
            styleId: style.style_id,
            parentProductId: style.parent_product_id,
            stockOnHand: replenishment?.stock_on_hand ?? null,
            committedStock: replenishment?.committed_stock ?? null,
            incomingStock: replenishment?.incoming_stock ?? null,
            netAvailableStock: replenishment?.net_available_stock ?? null,
            averageDailySales: replenishment?.average_daily_sales ?? null,
            averageWeeklySales: replenishment?.average_weekly_sales ?? null,
            sales7Days: replenishment?.sales_7_day_units ?? null,
            sales14Days: replenishment?.sales_14_day_units ?? null,
            sales30Days: replenishment?.sales_30_day_units ?? null,
            lastSaleDate: replenishment?.last_sale_date ?? null,
            daysSinceLastSale: replenishment?.days_since_last_sale ?? null,
            salesHistory30Complete: replenishment?.sales_history_30_complete ?? false,
            salesHistoryDays: replenishment?.sales_history_days ?? null,
            reorderPoint: replenishment?.reorder_point ?? null,
            safetyStock: replenishment?.safety_stock ?? null,
            targetStockDays: replenishment?.target_stock_days ?? null,
            supplierLeadTimeDays:
              replenishment?.supplier_lead_time_days ?? null,
            unitsPerPack: replenishment?.units_per_pack ?? null,
            supplierMoqPacks:
              replenishment?.supplier_moq_packs ?? null,
            freshness: replenishment?.freshness ?? null,
            supplierMinimumOrderState:
              replenishment?.supplier_minimum_order_state ?? "unknown",
            trusted: replenishment?.trusted ?? false,
            missingRequirements:
              replenishment?.missing_requirements ?? [
                "replenishment_intelligence_unavailable",
              ],
          },

          trading_evidence: {
            state: tradingEvidence?.maturity_state ?? "UNKNOWN",
            reason: tradingEvidence?.maturity_state === "LEARNING"
              ? "Gathering trading evidence."
              : tradingEvidence?.maturity_state === "DEVELOPING_EVIDENCE"
                ? "Trading evidence is still developing."
                : tradingEvidence?.maturity_state === "SUFFICIENT_EVIDENCE"
                  ? "Verified trading evidence is sufficient."
                  : "Trading history not yet verified.",
            verifiedLiveDays: tradingEvidence?.verified_live_days ?? null,
            verifiedCoverageDays: tradingEvidence?.verified_coverage_days ?? null,
            coverageComplete: tradingEvidence?.coverage_complete ?? false,
            orderEvidenceFresh: tradingEvidence?.order_evidence_fresh ?? false,
            firstPositiveSaleAt: tradingEvidence?.first_positive_sale_at ?? null,
            sellingDays: tradingEvidence?.selling_days ?? null,
            unitsSinceLive: tradingEvidence?.units_since_live ?? null,
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

          reorder_approval:
            approvalByParentProduct.get(
              style.parent_product_id,
            ) ?? null,

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
              product.style_id,
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
    costProfiles,

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
