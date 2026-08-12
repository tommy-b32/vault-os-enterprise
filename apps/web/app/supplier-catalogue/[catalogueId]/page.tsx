import Link from "next/link";
import { notFound } from "next/navigation";
import VaultAppShell from "@/components/layout/VaultAppShell";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import { SupplierCatalogueArchiveRepository } from "@/lib/supplier/SupplierCatalogueArchiveRepository";

export const dynamic = "force-dynamic";

export default async function SupplierCatalogueArchivePage({ params }: { params: Promise<{ catalogueId: string }> }) {
  await requireAuthenticatedOperator();
  const { catalogueId } = await params;
  const [archive, pageSummary] = await Promise.all([SupplierCatalogueArchiveRepository.get(catalogueId), SupplierCatalogueArchiveRepository.getPageSummary(catalogueId)]);
  if (!archive) notFound();
  const unresolvedPages = pageSummary.pending + pageSummary.failed;
  const analysisLabel = pageSummary.catalogueComplete ? "Analysed / complete" : "Analysis in progress";
  return <VaultAppShell systemStatusLabel={analysisLabel}><main className="supplier-catalogue-page"><Link href="/supplier-catalogue">← All supplier catalogues</Link><header className="supplier-catalogue-hero"><div><p className="vault-eyebrow">{archive.supplierName}</p><h1>{archive.displayName}</h1><p>{archive.originalFilename} · {analysisLabel}</p></div></header><section className="supplier-catalogue-intelligence"><div className="supplier-catalogue-stat-grid">{[["Pages", pageSummary.total], ["Pending", pageSummary.pending], ["Analysed", pageSummary.analysed], ["Failed", pageSummary.failed], ["Review pending", pageSummary.pendingReviewItems]].map(([label, value]) => <article className="supplier-catalogue-stat" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
    {unresolvedPages > 0 && pageSummary.resumable === 0 ? <p>The original rendered page evidence was not archived, so this import cannot be resumed safely. Re-import the source PDF to analyse these pages.</p> : null}
    {pageSummary.resumable > 0 && pageSummary.persistedPages < pageSummary.total ? <p>{pageSummary.persistedPages} of {pageSummary.total} rendered pages are currently durable. Analysis can resume for those saved pages; pages without persisted evidence remain unavailable.</p> : null}
    {unresolvedPages > 0 && pageSummary.resumable > 0 ? <Link href={`/supplier-catalogue/${archive.id}/analyse`}>Continue Catalogue Analysis →</Link> : null}
    {pageSummary.pendingReviewItems > 0 ? <Link href={`/supplier-catalogue/${archive.id}/review`}>Continue Match Review →</Link> : <p>All currently detected review items have been resolved.</p>}
    {pageSummary.catalogueComplete ? <p>All persisted catalogue pages have been analysed or skipped.</p> : null}
  </section></main></VaultAppShell>;
}
