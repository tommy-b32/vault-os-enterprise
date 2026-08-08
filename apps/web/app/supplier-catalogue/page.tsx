import Link from "next/link";

import VaultAppShell from "@/components/layout/VaultAppShell";
import { SupplierCatalogueImportWorkspace } from "@/components/suppliers/SupplierCatalogueImportWorkspace";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import { getCatalogueData } from "@/lib/catalogue";
import { SupplierCatalogueArchiveRepository } from "@/lib/supplier/SupplierCatalogueArchiveRepository";

export const dynamic = "force-dynamic";

function date(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function status(value: string) {
  return value.replaceAll("_", " ").toUpperCase();
}

export default async function SupplierCataloguePage() {
  await requireAuthenticatedOperator();
  let loaded: Awaited<ReturnType<typeof getCatalogueData>> | null = null;
  let archives: Awaited<ReturnType<typeof SupplierCatalogueArchiveRepository.list>> = [];
  let loadError: string | null = null;
  try {
    [loaded, archives] = await Promise.all([getCatalogueData(), SupplierCatalogueArchiveRepository.list()]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Canonical supplier archives could not be loaded.";
  }

  if (!loaded || loadError) {
    return <VaultAppShell systemStatusLabel="Supplier archive unavailable"><main className="catalogue-error"><h1>Supplier catalogue unavailable</h1><p>{loadError}</p></main></VaultAppShell>;
  }

  const products = loaded.products;
  const stats = {
      archives: archives.length,
      pages: archives.reduce((sum, archive) => sum + archive.pageCount, 0),
      matched: archives.reduce((sum, archive) => sum + archive.matchedProductCount, 0),
      pending: archives.reduce((sum, archive) => sum + archive.unmatchedProductCount, 0),
    };

  return <VaultAppShell searchPlaceholder="Search supplier catalogues..." systemStatusLabel="Canonical supplier archives available">
      <main className="supplier-catalogue-page">
        <header className="supplier-catalogue-hero"><div><p className="vault-eyebrow">SUPPLIER CATALOGUE INTELLIGENCE</p><h1>Supplier Catalogue</h1><p>Durable supplier imports, product evidence and resumable Match Review.</p></div></header>
        <section className="supplier-catalogue-import"><SupplierCatalogueImportWorkspace products={products} /></section>
        <section className="supplier-catalogue-intelligence">
          <div className="supplier-catalogue-intelligence-header"><div><p className="vault-eyebrow">CANONICAL ARCHIVE</p><h2>Catalogue Intelligence</h2><p>Counts below are derived from persisted archives and review items.</p></div></div>
          <div className="supplier-catalogue-stat-grid">
            {[['Supplier Catalogues', stats.archives], ['Catalogue Pages', stats.pages], ['Matched Products', stats.matched], ['Unmatched / Pending', stats.pending]].map(([label, value]) => <article className="supplier-catalogue-stat" key={label}><span>{label}</span><strong>{value}</strong></article>)}
          </div>
        </section>
        <section className="supplier-catalogue-archive">
          <header className="supplier-catalogue-section-header"><div><p className="vault-eyebrow">SUPPLIER ARCHIVES</p><h2>Your catalogues</h2><p>Open an archive to inspect its canonical state or continue unresolved review items.</p></div><span>{archives.length} archives</span></header>
          {archives.length === 0 ? <div className="supplier-review-workspace-empty"><h3>No supplier catalogues archived yet</h3><p>Upload and analyse a real supplier PDF to create the first canonical archive.</p></div> :
            <div className="supplier-catalogue-grid">{archives.map((archive) => <article className="supplier-catalogue-card" key={archive.id}><header><div><p className="vault-eyebrow">{archive.supplierName}</p><h3>{archive.displayName}</h3></div><span>{status(archive.status)}</span></header><div className="supplier-catalogue-card-metrics"><div><span>Pages</span><strong>{archive.pageCount}</strong></div><div><span>Detected</span><strong>{archive.detectedProductCount}</strong></div><div><span>Matched</span><strong>{archive.matchedProductCount}</strong></div><div><span>Unmatched</span><strong>{archive.unmatchedProductCount}</strong></div></div><footer><div><span>Created</span><strong>{date(archive.createdAt)}</strong></div><Link href={`/supplier-catalogue/${archive.id}`}>Open Catalogue →</Link></footer></article>)}</div>}
        </section>
      </main>
    </VaultAppShell>;
}
