import { CatalogueWorkspace } from "@/components/catalogue/CatalogueWorkspace";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  CatalogueProduct,
  CatalogueSupplier,
  InventoryStrategy,
  PackProfile,
  ProductCommercialCost,
} from "@/types/catalogue";

export const dynamic = "force-dynamic";

type ConfigurationState =
  | "ready"
  | "almost_ready"
  | "needs_configuration"
  | "dropship_ready"
  | "do_not_restock"
  | "discontinued"
  | "service";

type BrainConfidence =
  | "high"
  | "limited"
  | "untrusted";

type ProductMasterRow = {
  product_id: string;
  product_name: string;
  product_type: string | null;
  status: string | null;

  supplier_id: string | null;
  supplier_company: string | null;

  inventory_strategy: InventoryStrategy | null;
  restock_enabled: boolean | null;

  pack_profile: PackProfile | null;
  supplier_moq_packs: number | null;
  target_stock_days: number | null;

  decision_reason: string | null;
  notes: string | null;

  configuration_score: number | null;
  configuration_state: ConfigurationState | null;

  missing_requirements: string[] | null;
  missing_requirement_count: number | null;

  configuration_trusted: boolean | null;
  trusted_for_reorder: boolean | null;

  brain_confidence: BrainConfidence | null;
};

type ConfigurationSummaryRow = {
  total_products: number | null;
  fully_configured_products: number | null;
  products_needing_configuration: number | null;
  almost_ready_products: number | null;
  dropship_products: number | null;
  do_not_restock_products: number | null;
  discontinued_products: number | null;
  service_products: number | null;
  reorder_ready_products: number | null;
  average_configuration_score: number | null;
  catalogue_completion_percentage: number | null;
};

type InventoryRow = {
  product_id: string;
  stock_on_hand: number | null;
};

type PackRow = {
  product_id: string;
  complete_packs: number | null;
  loose_units_after_complete_packs: number | null;
};

type CommercialRow = ProductCommercialCost & {
  product_id: string;
};

export default async function CataloguePage() {
  const [
    productResponse,
    supplierResponse,
    inventoryResponse,
    packResponse,
    summaryResponse,
    commercialResponse,
  ] = await Promise.all([
    supabaseAdmin
      .from("vault_configuration_intelligence")
      .select(`
        product_id,
        product_name,
        product_type,
        shopify_status,
        supplier_id,
        supplier_company,
        inventory_strategy,
        restock_enabled,
        pack_profile,
        supplier_moq_packs,
        target_stock_days,
        decision_reason,
        notes,
        configuration_score,
        configuration_state,
        missing_requirements,
        missing_requirement_count,
        configuration_trusted,
        trusted_for_reorder,
        brain_confidence
      `)
      .order("product_name", {
        ascending: true,
      }),

    supabaseAdmin
      .from("vault_suppliers")
      .select("id, supplier_name")
      .eq("is_active", true)
      .order("supplier_name", {
        ascending: true,
      }),

    supabaseAdmin
      .from("vault_inventory_intelligence")
      .select("product_id, stock_on_hand"),

    supabaseAdmin
      .from("vault_pack_inventory_intelligence")
      .select(`
        product_id,
        complete_packs,
        loose_units_after_complete_packs
      `),

    supabaseAdmin
      .from("vault_configuration_summary")
      .select("*")
      .single(),

    supabaseAdmin
      .from("vault_product_commercial_intelligence")
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
  ]);

  const error =
    productResponse.error ??
    supplierResponse.error ??
    inventoryResponse.error ??
    packResponse.error ??
    summaryResponse.error ??
    commercialResponse.error;

  if (error) {
    return (
      <main className="catalogue-error">
        <h1>Catalogue unavailable</h1>
        <p>{error.message}</p>
      </main>
    );
  }

  const productRows =
    (productResponse.data ?? []).map((row) => ({
      ...row,
      status: row.shopify_status,
    })) as ProductMasterRow[];

  const suppliers =
    (supplierResponse.data ?? []) as CatalogueSupplier[];

  const inventoryRows =
    (inventoryResponse.data ?? []) as InventoryRow[];

  const packRows =
    (packResponse.data ?? []) as PackRow[];

  const commercialRows =
    (commercialResponse.data ?? []) as CommercialRow[];

  const summary =
    summaryResponse.data as ConfigurationSummaryRow;

  const stockByProduct = new Map<string, number>();

  for (const row of inventoryRows) {
    stockByProduct.set(
      row.product_id,
      Math.max(0, row.stock_on_hand ?? 0),
    );
  }

  /*
   * Pack intelligence may contain several rows for one
   * product because each colour/design has its own size run.
   */
  const packTotalsByProduct = new Map<
    string,
    {
      completePacks: number;
      looseUnits: number;
    }
  >();

  for (const row of packRows) {
    const current =
      packTotalsByProduct.get(row.product_id) ?? {
        completePacks: 0,
        looseUnits: 0,
      };

    current.completePacks += Math.max(
      0,
      row.complete_packs ?? 0,
    );

    current.looseUnits += Math.max(
      0,
      row.loose_units_after_complete_packs ?? 0,
    );

    packTotalsByProduct.set(
      row.product_id,
      current,
    );
  }

  const commercialByProduct = new Map<
    string,
    ProductCommercialCost
  >();

  for (const row of commercialRows) {
    commercialByProduct.set(row.product_id, {
      currency: row.currency ?? "GBP",

      exchange_rate_to_gbp:
        row.exchange_rate_to_gbp ?? 1,

      pack_cost: row.pack_cost,

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
        row.commercial_cost_trusted ?? false,

      missing_commercial_requirements:
        row.missing_commercial_requirements ?? [],

      last_supplier_price_update:
        row.last_supplier_price_update,

      commercial_notes:
        row.commercial_notes,
    });
  }

  const emptyCommercialCost: ProductCommercialCost = {
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

    estimated_return_on_pack_capital_percent: null,

    commercial_cost_trusted: false,
    missing_commercial_requirements: [],

    last_supplier_price_update: null,
    commercial_notes: null,
  };

  const products: CatalogueProduct[] =
    productRows.map((product) => {
      const packTotals =
        packTotalsByProduct.get(product.product_id);

      const commercialCost =
        commercialByProduct.get(product.product_id) ??
        emptyCommercialCost;

      return {
        product_id: product.product_id,
        product_name: product.product_name,
        product_type: product.product_type,
        status: product.status,

        supplier_id: product.supplier_id,
        supplier_company:
          product.supplier_company,

        inventory_strategy:
          product.inventory_strategy ?? "stocked",

        restock_enabled:
          product.restock_enabled ?? true,

        pack_profile: product.pack_profile,

        supplier_moq_packs:
          product.supplier_moq_packs,

        target_stock_days:
          product.target_stock_days,

        decision_reason:
          product.decision_reason,

        notes: product.notes,

        stock_on_hand:
          stockByProduct.get(product.product_id) ?? 0,

        complete_packs:
          packTotals?.completePacks ?? 0,

        loose_units:
          packTotals?.looseUnits ?? 0,

        configuration_score:
          product.configuration_score ?? 0,

        configuration_state:
          product.configuration_state ??
          "needs_configuration",

        missing_requirements:
          product.missing_requirements ?? [],

        missing_requirement_count:
          product.missing_requirement_count ?? 0,

        configuration_trusted:
          product.configuration_trusted ?? false,

        trusted_for_reorder:
          product.trusted_for_reorder ?? false,

        brain_confidence:
          product.brain_confidence ?? "untrusted",

        commercial_cost: commercialCost,
      };
    });

  const totalProducts =
    summary?.total_products ?? products.length;

  const fullyConfiguredProducts =
    summary?.fully_configured_products ?? 0;

  const productsNeedingConfiguration =
    summary?.products_needing_configuration ?? 0;

  const almostReadyProducts =
    summary?.almost_ready_products ?? 0;

  const completionPercentage =
    summary?.catalogue_completion_percentage ?? 0;

  return (
    <main className="catalogue-page">
      <header className="catalogue-header">
        <div>
          <p className="vault-eyebrow">
            Vault Product Master
          </p>

          <h1>Product Intelligence</h1>

          <p>
            Search, configure and review every Shopify
            product from one workspace.
          </p>
        </div>

        <a className="catalogue-back" href="/">
          ← Command Centre
        </a>
      </header>

      <section className="catalogue-summary">
        <article>
          <span>Total products</span>
          <strong>{totalProducts}</strong>
        </article>

        <article>
          <span>Fully configured</span>
          <strong>{fullyConfiguredProducts}</strong>
        </article>

        <article>
          <span>Almost ready</span>
          <strong>{almostReadyProducts}</strong>
        </article>

        <article>
          <span>Catalogue health</span>
          <strong>{completionPercentage}%</strong>
        </article>
      </section>

      {productsNeedingConfiguration > 0 && (
        <section className="catalogue-alert">
          <div>
            <strong>
              {productsNeedingConfiguration} products need
              configuring
            </strong>

            <p>
              {fullyConfiguredProducts} ready and{" "}
              {almostReadyProducts} almost ready. Complete
              the missing business rules before Vault Brain
              uses these products for recommendations.
            </p>
          </div>

          <span>Configuration required</span>
        </section>
      )}

      <CatalogueWorkspace
        products={products}
        suppliers={suppliers}
      />
    </main>
  );
}