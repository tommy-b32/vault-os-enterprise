"use client";

import { useRef, useState } from "react";
import { CatalogueBatchAnalysisPanel } from "@/components/suppliers/CatalogueBatchAnalysisPanel";
import { VaultMemoryRepository } from "@/lib/brain/VaultMemoryRepository";
import { CatalogueReviewQueueEngine, type CatalogueReviewQueueDetails } from "@/lib/supplier/CatalogueReviewQueueEngine";
import type { CatalogueAnalysisSession } from "@/lib/supplier/catalogue-analysis-types";
import type { SupplierCatalogueArchive, SupplierCataloguePageState } from "@/lib/supplier/SupplierCatalogueArchiveRepository";
import type { SupplierDocumentPage, SupplierExtractionResult } from "@/lib/supplier/types";
import type { CatalogueProduct } from "@/types/catalogue";

type Props = {
  archive: SupplierCatalogueArchive;
  pageStates: SupplierCataloguePageState[];
  products: CatalogueProduct[];
};

const REVIEW_ITEM_BATCH_SIZE = 5;

function batches<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

export function SupplierCatalogueResumeWorkspace({ archive, pageStates, products }: Props) {
  const sourcePagesRef = useRef<Record<number, SupplierDocumentPage>>({});
  const persistedSignaturesRef = useRef<Record<number, string>>(
    Object.fromEntries(pageStates.map((page) => [page.pageNumber, `${page.status}:0:${page.analysedAt ?? ""}:${page.error ?? ""}`])),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const initialSession: CatalogueAnalysisSession = {
    documentId: archive.sourceDocumentId,
    fileName: archive.originalFilename,
    pages: Object.fromEntries(pageStates.map((page) => [page.pageNumber, {
      pageNumber: page.pageNumber,
      status: page.status,
      extraction: null,
      error: page.error,
      attempts: 0,
      analysedAt: page.analysedAt,
    }])),
    productGroups: [],
    progress: {
      state: "paused",
      totalPages: pageStates.length,
      completedPages: pageStates.filter((page) => page.status === "complete").length,
      failedPages: pageStates.filter((page) => page.status === "failed").length,
      skippedPages: pageStates.filter((page) => page.status === "skipped").length,
      currentPageNumber: null,
      startedAt: null,
      completedAt: null,
      error: null,
    },
  };

  const extractionResult: SupplierExtractionResult = {
    document: { id: archive.sourceDocumentId, fileName: archive.originalFilename, pageCount: archive.pageCount, uploadedAt: archive.createdAt },
    pages: pageStates.map((page) => ({ pageNumber: page.pageNumber, text: "", images: [] })),
    successful: true,
    confidence: 0,
    warnings: [],
  };

  const details: CatalogueReviewQueueDetails = {
    supplierName: archive.supplierName,
    collectionName: archive.displayName,
    catalogueType: archive.catalogueType,
    leadTimeDays: archive.leadTimeDays,
  };

  async function loadSourcePages(pageNumbers: number[]): Promise<SupplierDocumentPage[]> {
    const query = new URLSearchParams();
    pageNumbers.slice(0, 3).forEach((pageNumber) => query.append("page", String(pageNumber)));
    const response = await fetch(`/api/supplier-catalogue/archives/${archive.id}/pages?${query.toString()}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Catalogue source pages could not be loaded.");
    const pages = (payload.pages ?? []) as SupplierDocumentPage[];
    pages.forEach((page) => { sourcePagesRef.current[page.pageNumber] = page; });
    if (pages.length !== pageNumbers.slice(0, 3).length) throw new Error("Persisted rendered evidence is unavailable for one or more selected pages.");
    return pages;
  }

  async function persistSession(session: CatalogueAnalysisSession): Promise<void> {
    const changedPages = Object.fromEntries(Object.values(session.pages).filter((page) => {
      const signature = `${page.status}:${page.attempts}:${page.analysedAt ?? ""}:${page.error ?? ""}`;
      return page.status !== "pending" && persistedSignaturesRef.current[page.pageNumber] !== signature;
    }).map((page) => [page.pageNumber, page]));
    if (Object.keys(changedPages).length === 0) return;
    const response = await fetch(`/api/supplier-catalogue/archives/${archive.id}`, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ session: { ...session, pages: changedPages, productGroups: [] } }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Catalogue progress could not be saved.");
    Object.values(changedPages).forEach((page) => {
      persistedSignaturesRef.current[page.pageNumber] = `${page.status}:${page.attempts}:${page.analysedAt ?? ""}:${page.error ?? ""}`;
    });
  }

  async function openReviewQueue(session: CatalogueAnalysisSession) {
    setIsSaving(true);
    setMessage(null);
    try {
      await persistSession(session);
      const sourcePages = Object.values(sourcePagesRef.current);
      const memories = await VaultMemoryRepository.getForSupplier(archive.supplierName);
      const queue = CatalogueReviewQueueEngine.buildQueue({
        session,
        extractionResult: { ...extractionResult, pages: sourcePages },
        details,
        products,
        memories,
      });
      if (queue.length === 0) {
        setMessage("Analysis was saved, but no new review items were detected in these pages.");
        return;
      }
      for (const items of batches(queue, REVIEW_ITEM_BATCH_SIZE)) {
        const response = await fetch(`/api/supplier-catalogue/archives/${archive.id}`, {
          method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "New catalogue review items could not be saved.");
      }
      window.location.assign(`/supplier-catalogue/${archive.id}/review`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Catalogue analysis could not be resumed.");
    } finally {
      setIsSaving(false);
    }
  }

  return <section>
    {message ? <div className="supplier-review-queue-error" role="alert"><strong>Catalogue analysis update</strong><p>{message}</p></div> : null}
    {isSaving ? <p role="status">Saving analysis and preparing new review items...</p> : null}
    <CatalogueBatchAnalysisPanel
      canOpenReviewQueue
      extractionResult={extractionResult}
      initialSession={initialSession}
      isPreparingReviewQueue={isSaving}
      loadSourcePages={loadSourcePages}
      onOpenReviewQueue={(session) => { void openReviewQueue(session); }}
      onSessionChange={(session) => { void persistSession(session).catch((error) => setMessage(error instanceof Error ? error.message : "Catalogue progress could not be saved.")); }}
    />
  </section>;
}
