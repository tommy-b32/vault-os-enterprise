import Link from "next/link";
import { notFound } from "next/navigation";
import VaultAppShell from "@/components/layout/VaultAppShell";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import { SupplierCatalogueArchiveRepository } from "@/lib/supplier/SupplierCatalogueArchiveRepository";

export const dynamic = "force-dynamic";

export default async function SupplierCatalogueArchivePage({ params }: { params: Promise<{ catalogueId: string }> }) {
  await requireAuthenticatedOperator();
  const { catalogueId } = await params;
  const archive = await SupplierCatalogueArchiveRepository.get(catalogueId);
  if (!archive) notFound();
  return <VaultAppShell systemStatusLabel={`Supplier archive: ${archive.status}`}><main className="supplier-catalogue-page"><Link href="/supplier-catalogue">← All supplier catalogues</Link><header className="supplier-catalogue-hero"><div><p className="vault-eyebrow">{archive.supplierName}</p><h1>{archive.displayName}</h1><p>{archive.originalFilename} · {archive.status.replaceAll("_", " ")}</p></div></header><section className="supplier-catalogue-intelligence"><div className="supplier-catalogue-stat-grid">{[['Pages', archive.pageCount], ['Detected', archive.detectedProductCount], ['Matched', archive.matchedProductCount], ['Unmatched / pending', archive.unmatchedProductCount]].map(([label, value]) => <article className="supplier-catalogue-stat" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>{archive.status === "failed" ? <p>This archive failed processing and has not been marked complete.</p> : archive.status === "completed" ? <p>All canonical review items have been resolved.</p> : <Link href={`/supplier-catalogue/${archive.id}/review`}>Continue Match Review →</Link>}</section></main></VaultAppShell>;
}
