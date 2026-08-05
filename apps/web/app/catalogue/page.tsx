import Link from "next/link";

import ProductVisionWorkspace from "@/components/brain/ProductVisionWorkspace";
import { CatalogueWorkspace } from "@/components/catalogue/CatalogueWorkspace";
import VaultAppShell from "@/components/layout/VaultAppShell";
import { getCatalogueData } from "@/lib/catalogue";

export const dynamic = "force-dynamic";

function percentage(value: number, total: number): number {
  return total > 0
    ? Math.round((value / total) * 100)
    : 0;
}

async function loadCataloguePage() {
  try {
    return {
      data: await getCatalogueData(),
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : "An unknown catalogue error occurred.",
    };
  }
}

export default async function CataloguePage() {
  const result = await loadCataloguePage();

  if (!result.data) {
    return (
      <VaultAppShell
        searchPlaceholder="Search catalogue..."
        systemStatusLabel="Catalogue intelligence unavailable"
      >
        <main className="catalogue-error">
          <h1>Catalogue unavailable</h1>
          <p>{result.error}</p>
        </main>
      </VaultAppShell>
    );
  }

  const {
    products,
    suppliers,
    summary,
  } = result.data;

    const totalProducts =
      summary.total_products ?? products.length;
    const productsNeedingConfiguration =
      summary.products_needing_configuration ?? 0;
    const analysedProducts = products.filter(
      (product) => product.product_vision !== null,
    ).length;
    const commercialDataComplete = products.filter((product) =>
      product.commercial_cost.estimated_margin_percent !== null &&
      product.commercial_cost.estimated_return_on_pack_capital_percent !== null &&
      product.commercial_cost.estimated_gross_profit_per_unit !== null
    ).length;
    const supplierAssigned = products.filter((product) => Boolean(product.supplier_id)).length;
    const advisorDiagnostics = {
      supplierAssigned,
      configurationTrusted: products.filter((product) => product.configuration_trusted).length,
      commercialCostTrusted: products.filter((product) =>
        product.commercial_cost.commercial_cost_trusted).length,
      restockEnabled: products.filter((product) => product.restock_enabled).length,
      marginThresholdPassed: products.filter((product) =>
        product.commercial_cost.estimated_margin_percent !== null &&
        product.commercial_cost.estimated_margin_percent >= 45).length,
      returnThresholdPassed: products.filter((product) =>
        product.commercial_cost.estimated_return_on_pack_capital_percent !== null &&
        product.commercial_cost.estimated_return_on_pack_capital_percent >= 100).length,
    };
    const productsRequiringReview = products.filter(
      (product) => !product.configuration_trusted,
    ).length;
    const attentionProducts = [...products]
      .filter(
        (product) => product.missing_requirement_count > 0,
      )
      .sort(
        (left, right) =>
          right.missing_requirement_count -
            left.missing_requirement_count ||
          left.configuration_score -
            right.configuration_score,
      )
      .slice(0, 5);

    const qualityMetrics = [
      {
        label: "Missing product attributes",
        value: productsNeedingConfiguration,
        detail: `${totalProducts - productsNeedingConfiguration} products have complete configuration`,
      },
      {
        label: "Incomplete commercial data",
        value: products.length - commercialDataComplete,
        detail: `${commercialDataComplete} products have complete commercial data`,
      },
      {
        label: "Image and vision coverage",
        value: `${percentage(analysedProducts, totalProducts)}%`,
        detail: `${analysedProducts} of ${totalProducts} products analysed`,
      },
      {
        label: "Supplier assignment coverage",
        value: `${percentage(supplierAssigned, totalProducts)}%`,
        detail: `${advisorDiagnostics.supplierAssigned} products assigned`,
      },
      {
        label: "Products requiring review",
        value: productsRequiringReview,
        detail: `${advisorDiagnostics.configurationTrusted} configurations trusted`,
      },
    ];

    const readinessMetrics = [
      {
        label: "Trusted cost-data coverage",
        value: percentage(
          advisorDiagnostics.commercialCostTrusted,
          totalProducts,
        ),
        count: advisorDiagnostics.commercialCostTrusted,
      },
      {
        label: "Supplier coverage",
        value: percentage(
          advisorDiagnostics.supplierAssigned,
          totalProducts,
        ),
        count: advisorDiagnostics.supplierAssigned,
      },
      {
        label: "Restock configuration coverage",
        value: percentage(
          advisorDiagnostics.restockEnabled,
          totalProducts,
        ),
        count: advisorDiagnostics.restockEnabled,
      },
      {
        label: "Margin-rule readiness",
        value: percentage(
          advisorDiagnostics.marginThresholdPassed,
          totalProducts,
        ),
        count: advisorDiagnostics.marginThresholdPassed,
      },
      {
        label: "Return-rule readiness",
        value: percentage(
          advisorDiagnostics.returnThresholdPassed,
          totalProducts,
        ),
        count: advisorDiagnostics.returnThresholdPassed,
      },
    ];

  return (
      <VaultAppShell
        searchPlaceholder="Search catalogue..."
        notificationCount={productsNeedingConfiguration}
        systemStatusLabel="Catalogue intelligence online"
      >
        <main className="catalogue-page">
          <header className="catalogue-header">
            <div>
              <p className="vault-eyebrow">CATALOGUE</p>
              <h1>Catalogue</h1>
              <p>
                Product intelligence, commercial readiness and
                catalogue quality.
              </p>
            </div>
          </header>

          <section className="catalogue-intelligence-section">
            <div className="catalogue-section-heading">
              <div>
                <p className="vault-eyebrow">Catalogue Overview</p>
                <h2>Catalogue Health</h2>
              </div>
            </div>

            <div className="catalogue-overview-panel">
              <article className="catalogue-health-primary">
                <span>Catalogue Health</span>
                <strong>
                  {summary.catalogue_completion_percentage}%
                </strong>
                <p>Trusted product configuration coverage</p>
              </article>

              <div className="catalogue-overview-metrics">
                <article>
                  <span>Total products</span>
                  <strong>{totalProducts}</strong>
                </article>
                <article>
                  <span>Products analysed</span>
                  <strong>{analysedProducts}</strong>
                </article>
                <article>
                  <span>Requiring attention</span>
                  <strong>{productsNeedingConfiguration}</strong>
                </article>
                <article>
                  <span>Commercially ready</span>
                  <strong>
                    {advisorDiagnostics.commercialCostTrusted}
                  </strong>
                </article>
              </div>
            </div>
          </section>

          <section className="catalogue-intelligence-section">
            <ProductVisionWorkspace />
          </section>

          <section className="catalogue-intelligence-section">
            <div className="catalogue-section-heading">
              <div>
                <p className="vault-eyebrow">Catalogue Quality</p>
                <h2>Product information coverage</h2>
                <p>
                  Canonical catalogue signals that determine how
                  completely Vault OS understands each product.
                </p>
              </div>
            </div>

            <div className="catalogue-quality-grid">
              {qualityMetrics.map((metric) => (
                <article key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <p>{metric.detail}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="catalogue-intelligence-section">
            <div className="catalogue-section-heading">
              <div>
                <p className="vault-eyebrow">Commercial Readiness</p>
                <h2>Decision-data coverage</h2>
                <p>
                  Diagnostic coverage for trusted commercial rules.
                  Buying recommendations remain in Advisor.
                </p>
              </div>
            </div>

            <div className="catalogue-readiness-grid">
              {readinessMetrics.map((metric) => (
                <article key={metric.label}>
                  <div>
                    <span>{metric.label}</span>
                    <strong>{metric.value}%</strong>
                  </div>
                  <div
                    aria-label={`${metric.label}: ${metric.value}%`}
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={metric.value}
                    className="catalogue-readiness-track"
                    role="progressbar"
                  >
                    <span style={{ width: `${metric.value}%` }} />
                  </div>
                  <p>
                    {metric.count} of {totalProducts} products
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section
            className="catalogue-intelligence-section"
            id="product-catalogue"
          >
            <div className="catalogue-section-heading">
              <div>
                <p className="vault-eyebrow">
                  Product Intelligence Actions
                </p>
                <h2>Catalogue workflows</h2>
              </div>
            </div>

            <nav
              aria-label="Product intelligence actions"
              className="catalogue-action-grid"
            >
              <a href="#product-catalogue">Open product catalogue</a>
              <a href="#attention-required">
                Review missing attributes
              </a>
              <Link href="/commercial">Review commercial data</Link>
              <Link href="/supplier-catalogue/review">
                Open Match Review
              </Link>
              <a href="#product-catalogue">
                Review supplier assignments
              </a>
            </nav>

            <CatalogueWorkspace
              products={products}
              suppliers={suppliers}
            />
          </section>

          <section
            className="catalogue-intelligence-section"
            id="attention-required"
          >
            <div className="catalogue-section-heading">
              <div>
                <p className="vault-eyebrow">Attention Required</p>
                <h2>Highest-impact catalogue gaps</h2>
              </div>
            </div>

            {attentionProducts.length > 0 ? (
              <div className="catalogue-attention-list">
                {attentionProducts.map((product) => (
                  <article key={product.style_id}>
                    <div>
                      <strong>{product.product_name}</strong>
                      <p>
                        {product.missing_requirements
                          .map((requirement) =>
                            requirement.replaceAll("_", " "),
                          )
                          .join(" · ")}
                      </p>
                    </div>
                    <span>
                      {product.configuration_score}% configured
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="catalogue-attention-empty">
                No catalogue configuration issues require attention.
              </div>
            )}
          </section>
        </main>
      </VaultAppShell>
  );
}
