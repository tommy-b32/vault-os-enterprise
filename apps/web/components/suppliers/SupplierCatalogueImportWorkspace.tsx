"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  SupplierCatalogueDropzone,
} from "@/components/suppliers/SupplierCatalogueDropzone";

import {
  SupplierCatalogueImportPanel,
} from "@/components/suppliers/SupplierCatalogueImportPanel";

import {
  CatalogueIntelligenceDashboard,
} from "@/components/suppliers/CatalogueIntelligenceDashboard";

import {
  CatalogueReviewQueueEngine,
  type CatalogueReviewQueueDetails,
  type CatalogueReviewQueueItem,
} from "@/lib/supplier/CatalogueReviewQueueEngine";

import {
  VaultMemoryRepository,
} from "@/lib/brain/VaultMemoryRepository";

import type {
  CatalogueAnalysisSession,
} from "@/lib/supplier/catalogue-analysis-types";

import type {
  SupplierExtractionResult,
} from "@/lib/supplier/types";

import type {
  CatalogueProduct,
} from "@/types/catalogue";

type Props = {
  products?: CatalogueProduct[];
};

const SOURCE_PAGE_BATCH_SIZE = 2;
const REVIEW_ITEM_BATCH_SIZE = 5;

function batches<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export function SupplierCatalogueImportWorkspace({
  products = [],
}: Props) {
  const archiveIdRef = useRef<string | null>(null);
  const archiveRequestRef = useRef<Promise<string> | null>(null);
  const checkpointAnalysisRef = useRef<
    ((session: CatalogueAnalysisSession) => Promise<void>) | null
  >(null);
  const persistedPageSignaturesRef = useRef<Record<number, string>>({});
  const [
    selectedFile,
    setSelectedFile,
  ] = useState<File | null>(
    null,
  );

  const [
    extractionResult,
    setExtractionResult,
  ] =
    useState<SupplierExtractionResult | null>(
      null,
    );

  const [
    catalogueDetails,
    setCatalogueDetails,
  ] =
    useState<CatalogueReviewQueueDetails | null>(
      null,
    );

  const [
    analysisSession,
    setAnalysisSession,
  ] =
    useState<CatalogueAnalysisSession | null>(
      null,
    );

  const [
    reviewItems,
    setReviewItems,
  ] =
    useState<CatalogueReviewQueueItem[]>(
      [],
    );

  const [
    queueSaveError,
    setQueueSaveError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    isPreparingIntelligence,
    setIsPreparingIntelligence,
  ] =
    useState(false);

  const [
    isOpeningReview,
    setIsOpeningReview,
  ] =
    useState(false);

  async function ensureArchive(details: CatalogueReviewQueueDetails): Promise<string> {
    if (archiveIdRef.current) return archiveIdRef.current;
    if (archiveRequestRef.current) return archiveRequestRef.current;
    if (!selectedFile || !extractionResult) throw new Error("Extract the catalogue before creating its archive.");

    const request = fetch("/api/supplier-catalogue/archives", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: extractionResult.document.id,
        originalFilename: selectedFile.name,
        sourceDocumentId: extractionResult.document.id,
        pageCount: extractionResult.pages.length,
        details,
      }),
    }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok || !payload.archiveId) throw new Error(payload.error ?? "Catalogue archive could not be created.");
      const archiveId = payload.archiveId as string;
      for (const pages of batches(extractionResult.pages, SOURCE_PAGE_BATCH_SIZE)) {
        const pageResponse = await fetch(`/api/supplier-catalogue/archives/${archiveId}/pages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pages }),
        });
        const pagePayload = await pageResponse.json();
        if (!pageResponse.ok) throw new Error(pagePayload.error ?? "Catalogue source pages could not be saved.");
      }
      archiveIdRef.current = archiveId;
      return archiveId;
    }).finally(() => { archiveRequestRef.current = null; });

    archiveRequestRef.current = request;
    return request;
  }

  function resetImport() {
    setSelectedFile(null);
    setExtractionResult(null);
    setCatalogueDetails(null);
    setAnalysisSession(null);
    setReviewItems([]);
    setQueueSaveError(null);
    setIsPreparingIntelligence(false);
    setIsOpeningReview(false);

    archiveIdRef.current = null;
    archiveRequestRef.current = null;
    persistedPageSignaturesRef.current = {};
  }

  async function prepareCatalogueIntelligence(
    session: CatalogueAnalysisSession,
    details: CatalogueReviewQueueDetails,
  ) {
    if (
      !extractionResult ||
      isPreparingIntelligence ||
      isOpeningReview
    ) {
      return;
    }

    setIsPreparingIntelligence(
      true,
    );

    setQueueSaveError(
      null,
    );

    try {
      const memories =
        await VaultMemoryRepository.getAll();

      const archiveId = await ensureArchive(details);
      const previewItems: CatalogueReviewQueueItem[] = [];
      for (const productGroups of batches(session.productGroups, REVIEW_ITEM_BATCH_SIZE)) {
        const queue = CatalogueReviewQueueEngine.buildQueue({
          session: { ...session, productGroups }, extractionResult, details, products, memories,
        });
        for (const items of batches(queue, REVIEW_ITEM_BATCH_SIZE)) {
          const archiveResponse = await fetch(`/api/supplier-catalogue/archives/${archiveId}`, {
            method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }),
          });
          const archivePayload = await archiveResponse.json();
          if (!archiveResponse.ok) throw new Error(archivePayload.error ?? "Catalogue review items could not be archived.");
          if (previewItems.length < REVIEW_ITEM_BATCH_SIZE) previewItems.push(...items.slice(0, REVIEW_ITEM_BATCH_SIZE - previewItems.length));
        }
      }

      setAnalysisSession(
        session,
      );

      setCatalogueDetails(
        details,
      );

      setReviewItems(
        previewItems,
      );

    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Vault OS could not analyse this supplier catalogue.";

      setQueueSaveError(
        message,
      );
      if (archiveIdRef.current) {
        try {
          await fetch(`/api/supplier-catalogue/archives/${archiveIdRef.current}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ failed: true, reason: message }),
          });
        } catch {
          // Preserve the original processing error when failure-state persistence is unavailable.
        }
      }
    } finally {
      setIsPreparingIntelligence(
        false,
      );
    }
  }

  async function checkpointAnalysis(
    session: CatalogueAnalysisSession,
  ) {
    setAnalysisSession(session);
    if (!catalogueDetails || !extractionResult) return;

    try {
      const archiveId = await ensureArchive(catalogueDetails);
      const memories = await VaultMemoryRepository.getAll();
      const changedPages = Object.fromEntries(
        Object.values(session.pages)
          .filter((page) => {
            const signature = `${page.status}:${page.attempts}:${page.analysedAt ?? ""}:${page.error ?? ""}`;
            if (persistedPageSignaturesRef.current[page.pageNumber] === signature) return false;
            persistedPageSignaturesRef.current[page.pageNumber] = signature;
            return page.status !== "pending";
          })
          .map((page) => [page.pageNumber, page]),
      );
      if (Object.keys(changedPages).length > 0) {
        const response = await fetch(`/api/supplier-catalogue/archives/${archiveId}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session: { ...session, pages: changedPages, productGroups: [] } }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Catalogue progress could not be archived.");
      }
      for (const productGroups of batches(session.productGroups, REVIEW_ITEM_BATCH_SIZE)) {
        const queue = CatalogueReviewQueueEngine.buildQueue({
          session: { ...session, productGroups }, extractionResult, details: catalogueDetails, products, memories,
        });
        for (const items of batches(queue, REVIEW_ITEM_BATCH_SIZE)) {
          const itemResponse = await fetch(`/api/supplier-catalogue/archives/${archiveId}`, {
            method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }),
          });
          if (!itemResponse.ok) {
            const itemPayload = await itemResponse.json();
            throw new Error(itemPayload.error ?? "Catalogue review items could not be archived.");
          }
        }
      }
    } catch (error) {
      setQueueSaveError(error instanceof Error ? error.message : "Catalogue progress could not be archived.");
    }
  }

  useEffect(() => {
    checkpointAnalysisRef.current = checkpointAnalysis;
  });

  const handleAnalysisSessionChange = useCallback(
    (session: CatalogueAnalysisSession) => {
      setAnalysisSession(session);
      void checkpointAnalysisRef.current?.(session);
    },
    [],
  );

  async function saveAndOpenReview(
    itemsToReview:
      CatalogueReviewQueueItem[],
  ) {
    if (
      !catalogueDetails ||
      isOpeningReview ||
      itemsToReview.length === 0
    ) {
      return;
    }

    setIsOpeningReview(
      true,
    );

    setQueueSaveError(
      null,
    );

    try {
      const archiveId = await ensureArchive(catalogueDetails);
      window.location.href = `/supplier-catalogue/${archiveId}/review`;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Vault OS could not open Match Review.";

      setQueueSaveError(
        message,
      );
    } finally {
      setIsOpeningReview(
        false,
      );
    }
  }

  return (
    <div className="supplier-catalogue-import-workspace">
      <SupplierCatalogueDropzone
        onFileSelected={(file) => {
          setSelectedFile(
            file,
          );

          setExtractionResult(
            null,
          );

          setCatalogueDetails(
            null,
          );

          setAnalysisSession(
            null,
          );

          setReviewItems(
            [],
          );

          setQueueSaveError(
            null,
          );

          setIsPreparingIntelligence(
            false,
          );

          setIsOpeningReview(
            false,
          );

          archiveIdRef.current = null;
          archiveRequestRef.current = null;
          persistedPageSignaturesRef.current = {};
        }}
        onExtractionComplete={(
          result,
          file,
        ) => {
          setSelectedFile(
            file,
          );

          setExtractionResult(
            result,
          );
        }}
      />

      {selectedFile &&
      extractionResult ? (
        <SupplierCatalogueImportPanel
          extractionResult={
            extractionResult
          }
          fileName={
            selectedFile.name
          }
          onAnalysisSessionChange={
            handleAnalysisSessionChange
          }
          onCancel={
            resetImport
          }
          onContinue={(details) => {
            setCatalogueDetails(details);
            void ensureArchive(details).catch((error) => {
              setQueueSaveError(error instanceof Error ? error.message : "Catalogue archive could not be created.");
            });
          }}
          onOpenReviewQueue={(
            session,
            details,
          ) => {
            void prepareCatalogueIntelligence(
              session,
              details,
            );
          }}
        />
      ) : null}

      {queueSaveError ? (
        <div
          className="supplier-review-queue-error"
          role="alert"
        >
          <strong>
            Catalogue intelligence unavailable
          </strong>

          <p>
            {queueSaveError}
          </p>
        </div>
      ) : null}

      {isPreparingIntelligence ? (
        <div
          className="supplier-review-queue-ready"
          role="status"
        >
          <div>
            <p className="vault-eyebrow">
              Catalogue Intelligence
            </p>

            <h3>
              Loading Vault Brain Memory and analysing the full catalogue...
            </h3>
          </div>
        </div>
      ) : null}

      {isOpeningReview ? (
        <div
          className="supplier-review-queue-ready"
          role="status"
        >
          <div>
            <p className="vault-eyebrow">
              Match Review
            </p>

            <h3>
              Saving the selected review queue...
            </h3>
          </div>
        </div>
      ) : null}

      {catalogueDetails ? (
        <section className="supplier-import-ready-panel">
          <div>
            <p className="vault-eyebrow">
              Product Detection
            </p>

            <h2>
              Catalogue analysis complete
            </h2>

            <p>
              {extractionResult?.pages.length ??
                0}{" "}
              rendered pages from{" "}
              <strong>
                {
                  catalogueDetails.collectionName
                }
              </strong>{" "}
              have been grouped and compared with Vault Brain
              Memory.
            </p>
          </div>

          <div className="supplier-import-ready-details">
            <span>
              Supplier

              <strong>
                {
                  catalogueDetails.supplierName
                }
              </strong>
            </span>

            <span>
              Catalogue type

              <strong>
                {
                  catalogueDetails.catalogueType
                }
              </strong>
            </span>

            <span>
              Lead time

              <strong>
                {catalogueDetails.leadTimeDays
                  ? `${catalogueDetails.leadTimeDays} days`
                  : "Not entered"}
              </strong>
            </span>
          </div>
        </section>
      ) : null}

      {analysisSession &&
      reviewItems.length > 0 &&
      !isPreparingIntelligence ? (
        <CatalogueIntelligenceDashboard
          items={
            reviewItems
          }
          onOpenFullReview={() => {
            void saveAndOpenReview(
              reviewItems,
            );
          }}
          onOpenReview={(
            itemsToReview,
          ) => {
            void saveAndOpenReview(
              itemsToReview,
            );
          }}
        />
      ) : null}
    </div>
  );
}
