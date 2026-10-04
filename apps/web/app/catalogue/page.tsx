import Link from "next/link";

import ProductVisionWorkspace from "@/components/brain/ProductVisionWorkspace";
import { CatalogueWorkspace } from "@/components/catalogue/CatalogueWorkspace";
import VaultAppShell from "@/components/layout/VaultAppShell";
import { getCatalogueData } from "@/lib/catalogue";
import { getCommercialDecisionTimeline } from "@/lib/brain/getCommercialDecisionTimeline";
import { isCatalogueRemediationBlocker, remediationProductIds } from "@/lib/brain/CommercialDecisionTimeline";

export const dynamic = "force-dynamic";

async function loadCataloguePage() {
  try { return { data: await getCatalogueData(), error: null }; } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "An unknown catalogue error occurred." };
  }
}

export default async function CataloguePage({ searchParams }: { searchParams: Promise<{ attention?: string; products?: string }> }) {
  const query = await searchParams;
  const attention = isCatalogueRemediationBlocker(query.attention) ? query.attention : null;
  const [result, timeline] = await Promise.all([loadCataloguePage(), attention ? getCommercialDecisionTimeline(new Date().toISOString()) : Promise.resolve(null)]);
  const attentionProductIds = attention ? remediationProductIds(timeline, attention) : [];

  if (!result.data) return <VaultAppShell searchPlaceholder="Search catalogue..." systemStatusLabel="Catalogue intelligence unavailable"><main className="catalogue-error"><h1>Catalogue unavailable</h1><p>{result.error}</p></main></VaultAppShell>;

  const { products, suppliers, costProfiles, packProfiles, summary } = result.data;
  if (attention) {
    const attentionStyleCount = products.filter((product) => attentionProductIds.includes(product.parent_product_id)).length;
    const remediationDetails = {
      reorder_approval_missing: { title: "Review reorder approvals", explanation: "These products need an explicit operator approval before Vault Brain can use them for reordering." },
      target_stock_days_missing: { title: "Set target stock days", explanation: "Vault Brain needs a target stock-days rule before it can assess replenishment coverage." },
      invalid_or_missing_commercial_cost: { title: "Complete commercial costs", explanation: "These products need valid commercial cost data before Vault Brain can evaluate commercial readiness." },
    }[attention];
    return <VaultAppShell searchPlaceholder="Search affected products..." notificationCount={attentionProductIds.length} systemStatusLabel="Catalogue remediation active"><main className="catalogue-page catalogue-remediation-page"><header className="catalogue-remediation-header"><div><p className="vault-eyebrow">VAULT BRAIN REMEDIATION</p><h1>{remediationDetails.title}</h1><p>{remediationDetails.explanation}</p><strong>{attentionProductIds.length} product{attentionProductIds.length === 1 ? "" : "s"} / {attentionStyleCount} style{attentionStyleCount === 1 ? "" : "s"} require attention.</strong></div><Link className="catalogue-remediation-back" href="/catalogue">Back to full Catalogue</Link></header><CatalogueWorkspace products={products} suppliers={suppliers} costProfiles={costProfiles} packProfiles={packProfiles} attention={attention} attentionProductIds={attentionProductIds} remediationTitle={remediationDetails.title} /></main></VaultAppShell>;
  }

  const totalProducts = summary.total_products ?? products.length;
  const readyProducts = products.filter((product) => product.configuration_trusted).length;
  const productsNeedingConfiguration = summary.products_needing_configuration ?? 0;
  const missingSupplier = products.filter((product) => !product.supplier_id).length;
  const missingCommercialCost = products.filter((product) => !product.commercial_cost.commercial_cost_trusted).length;

  return <VaultAppShell searchPlaceholder="Search catalogue..." notificationCount={productsNeedingConfiguration} systemStatusLabel="Catalogue workspace online"><main className="catalogue-page"><header className="catalogue-header"><div><p className="vault-eyebrow">PRODUCT MANAGEMENT</p><h1>Catalogue</h1><p>Find products, complete their configuration, and maintain the commercial master data that operations depend on.</p></div></header>
    <section aria-labelledby="catalogue-readiness-title" className="catalogue-readiness-summary"><div className="catalogue-readiness-summary-heading"><div><p className="vault-eyebrow">SETUP READINESS</p><h2 id="catalogue-readiness-title">Complete product setup</h2></div><p>Use the product workspace to resolve supplier and attribute setup gaps; downstream buying and profitability analysis stays in its own workspace.</p></div><div className="catalogue-readiness-summary-metrics"><article><span>Total products</span><strong>{totalProducts}</strong></article><article><span>Ready</span><strong>{readyProducts}</strong></article><article><span>Needs attention</span><strong>{productsNeedingConfiguration}</strong></article><article><span>Missing supplier</span><strong>{missingSupplier}</strong></article><article><span>Missing commercial cost</span><strong>{missingCommercialCost}</strong></article></div><div className="catalogue-remediation-links" aria-label="Configuration remediation workflows"><a href="#product-workspace">Open product workspace</a><Link href="/catalogue?attention=invalid_or_missing_commercial_cost">Complete commercial costs</Link><Link href="/catalogue?attention=reorder_approval_missing">Review reorder approvals</Link><Link href="/catalogue?attention=target_stock_days_missing">Set target stock days</Link></div></section>
    <section className="catalogue-intelligence-section catalogue-product-workspace" id="product-workspace" aria-labelledby="product-workspace-title"><div className="catalogue-section-heading"><div><p className="vault-eyebrow">PRODUCT WORKSPACE</p><h2 id="product-workspace-title">Find, edit, and configure products</h2></div></div><CatalogueWorkspace products={products} suppliers={suppliers} costProfiles={costProfiles} packProfiles={packProfiles} /></section>
    <details className="catalogue-secondary-details"><summary><span><b>Product Vision</b><small>Optional catalogue-wide image and attribute intelligence</small></span><i>⌄</i></summary><div><ProductVisionWorkspace /></div></details>
  </main></VaultAppShell>;
}
