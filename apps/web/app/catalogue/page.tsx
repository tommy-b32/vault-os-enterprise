import { CatalogueWorkspace } from "@/components/catalogue/CatalogueWorkspace";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  CatalogueProduct,
  CatalogueSupplier,
  InventoryStrategy,
  PackProfile,
} from "@/types/catalogue";

export const dynamic = "force-dynamic";

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

export default async function CataloguePage() {
  const [
    productResponse,
    supplierResponse,
    inventoryResponse,
    packResponse,
  ] = await Promise.all([
    supabaseAdmin
      .from("vault_product_master")
      .select(`
        product_id,
        product_name,
        product_type,
        status,
        supplier_id,
        supplier_company,
        inventory_strategy,
        restock_enabled,
        pack_profile,
        supplier_moq_packs,
        target_stock_days,
        decision_reason,
        notes
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
  ]);

  const error =
    productResponse.error ??
    supplierResponse.error ??
    inventoryResponse.error ??
    packResponse.error;

  if (error) {
    return (
      <main className="catalogue-error">
        <h1>Catalogue unavailable</h1>
        <p>{error.message}</p>
      </main>
    );
  }

  const productRows =
    (productResponse.data ?? []) as ProductMasterRow[];

  const suppliers =
    (supplierResponse.data ?? []) as CatalogueSupplier[];

  const inventoryRows =
    (inventoryResponse.data ?? []) as InventoryRow[];

  const packRows =
    (packResponse.data ?? []) as PackRow[];

  const stockByProduct = new Map<string, number>();

  for (const row of inventoryRows) {
    stockByProduct.set(
      row.product_id,
      Math.max(0, row.stock_on_hand ?? 0),
    );
  }

  /*
   * Pack intelligence can contain multiple rows per product
   * because each colour/design has its own size run.
   * Add those rows together for the product-level editor.
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

  const products: CatalogueProduct[] =
    productRows.map((product) => {
      const packTotals =
        packTotalsByProduct.get(product.product_id);

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
      };
    });

  const needsConfigurationCount =
    products.filter((product) => {
      if (
        product.inventory_strategy === "dropship" ||
        product.inventory_strategy === "service" ||
        product.inventory_strategy === "discontinued"
      ) {
        return false;
      }

      return (
        !product.supplier_id ||
        !product.pack_profile
      );
    }).length;

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
          <strong>{products.length}</strong>
        </article>

        <article>
          <span>Need configuring</span>
          <strong>{needsConfigurationCount}</strong>
        </article>

        <article>
          <span>Active suppliers</span>
          <strong>{suppliers.length}</strong>
        </article>

        <article>
          <span>Live stock units</span>
          <strong>
            {products.reduce(
              (total, product) =>
                total +
                (product.stock_on_hand ?? 0),
              0,
            )}
          </strong>
        </article>
      </section>

      {needsConfigurationCount > 0 && (
        <section className="catalogue-alert">
          <div>
            <strong>
              {needsConfigurationCount} products need
              configuring
            </strong>

            <p>
              Assign their supplier and pack profile so
              Vault OS can make reliable recommendations.
            </p>
          </div>

          <span>Setup required</span>
        </section>
      )}

      <CatalogueWorkspace
        products={products}
        suppliers={suppliers}
      />
    </main>
  );
}