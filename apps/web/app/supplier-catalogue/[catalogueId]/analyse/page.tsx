import { notFound } from "next/navigation";
import VaultAppShell from "@/components/layout/VaultAppShell";
import { SupplierCatalogueResumeWorkspace } from "@/components/suppliers/SupplierCatalogueResumeWorkspace";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import { getCatalogueData } from "@/lib/catalogue";
import { SupplierCatalogueArchiveRepository } from "@/lib/supplier/SupplierCatalogueArchiveRepository";

export const dynamic = "force-dynamic";

export default async function ResumeSupplierCataloguePage({ params }: { params: Promise<{ catalogueId: string }> }) {
  await requireAuthenticatedOperator();
  const { catalogueId } = await params;
  const [archive, pageStates, pageSummary, catalogue] = await Promise.all([
    SupplierCatalogueArchiveRepository.get(catalogueId),
    SupplierCatalogueArchiveRepository.getPageStates(catalogueId),
    SupplierCatalogueArchiveRepository.getPageSummary(catalogueId),
    getCatalogueData(),
  ]);
  if (!archive) notFound();
  const persistedByNumber = new Map(pageStates.map((page) => [page.pageNumber, page]));
  const completePageStates = Array.from({ length: archive.pageCount }, (_, index) => persistedByNumber.get(index + 1) ?? {
    pageNumber: index + 1,
    status: "pending" as const,
    error: null,
    analysedAt: null,
    hasSourceEvidence: false,
  });
  return <VaultAppShell systemStatusLabel="Catalogue analysis in progress">
    <main className="supplier-catalogue-page">
      <header className="supplier-catalogue-hero"><div><p className="vault-eyebrow">{archive.supplierName}</p><h1>Continue Catalogue Analysis</h1><p>{archive.displayName} · {pageStates.filter((page) => page.status === "complete" || page.status === "skipped").length} of {archive.pageCount} pages analysed</p></div></header>
      <SupplierCatalogueResumeWorkspace archive={archive} hasPendingReviewItems={pageSummary.pendingReviewItems > 0} pageStates={completePageStates} products={catalogue.products} />
    </main>
  </VaultAppShell>;
}
