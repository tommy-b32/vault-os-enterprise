import Link from "next/link";
import { notFound } from "next/navigation";
import VaultAppShell from "@/components/layout/VaultAppShell";
import { SupplierReviewWorkspace } from "@/components/suppliers/SupplierReviewWorkspace";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import { SupplierCatalogueArchiveRepository } from "@/lib/supplier/SupplierCatalogueArchiveRepository";

export const dynamic = "force-dynamic";

export default async function SupplierCatalogueArchiveReviewPage({ params }: { params: Promise<{ catalogueId: string }> }) {
  await requireAuthenticatedOperator();
  const { catalogueId } = await params;
  const [archive, items] = await Promise.all([SupplierCatalogueArchiveRepository.get(catalogueId), SupplierCatalogueArchiveRepository.getPendingReviewItems(catalogueId)]);
  if (!archive) notFound();
  return <VaultAppShell searchPlaceholder="Search catalogue review..." systemStatusLabel={`Match Review: ${archive.status}`}>{items.length > 0 ? <SupplierReviewWorkspace archiveId={archive.id} items={items} /> : <section className="supplier-review-workspace-empty"><p className="vault-eyebrow">MATCH REVIEW</p><h1>No unresolved products</h1><p>{archive.status === "completed" ? "Every canonical review item in this archive has been resolved." : "This archive has no pending review items."}</p><Link href={`/supplier-catalogue/${archive.id}`}>← Open archive</Link></section>}</VaultAppShell>;
}
