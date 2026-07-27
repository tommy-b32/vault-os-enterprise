import VaultAppShell from "@/components/layout/VaultAppShell";
import { CatalogueWorkspace } from "@/components/catalogue/CatalogueWorkspace";
import { getCatalogueData } from "@/lib/catalogue";

export const dynamic = "force-dynamic";

export default async function CataloguePage() {
  try {
    const {
      products,
      suppliers,
      summary,
    } = await getCatalogueData();

    const totalProducts =
      summary.total_products ?? products.length;

    const fullyConfiguredProducts =
      summary.fully_configured_products ?? 0;

    const productsNeedingConfiguration =
      summary.products_needing_configuration ?? 0;

    const almostReadyProducts =
      summary.almost_ready_products ?? 0;

    const completionPercentage =
      summary.catalogue_completion_percentage ?? 0;

    return (
      <VaultAppShell
        searchPlaceholder="Search catalogue..."
        notificationCount={
          productsNeedingConfiguration
        }
        systemStatusLabel="Catalogue intelligence online"
      >
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
          </header>

          <section className="catalogue-summary">
            <article>
              <span>Total products</span>
              <strong>{totalProducts}</strong>
            </article>

            <article>
              <span>Fully configured</span>
              <strong>
                {fullyConfiguredProducts}
              </strong>
            </article>

            <article>
              <span>Almost ready</span>
              <strong>
                {almostReadyProducts}
              </strong>
            </article>

            <article>
              <span>Catalogue health</span>
              <strong>
                {completionPercentage}%
              </strong>
            </article>
          </section>

          {productsNeedingConfiguration > 0 ? (
            <section className="catalogue-alert">
              <div>
                <strong>
                  {productsNeedingConfiguration} products
                  need configuring
                </strong>

                <p>
                  {fullyConfiguredProducts} ready and{" "}
                  {almostReadyProducts} almost ready.
                  Complete the missing business rules before
                  Vault Brain uses these products for
                  recommendations.
                </p>
              </div>

              <span>
                Configuration required
              </span>
            </section>
          ) : null}

          <CatalogueWorkspace
            products={products}
            suppliers={suppliers}
          />
        </main>
      </VaultAppShell>
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "An unknown catalogue error occurred.";

    return (
      <VaultAppShell
        searchPlaceholder="Search catalogue..."
        systemStatusLabel="Catalogue intelligence unavailable"
      >
        <main className="catalogue-error">
          <h1>Catalogue unavailable</h1>
          <p>{message}</p>
        </main>
      </VaultAppShell>
    );
  }
}