"use client";

import {
  useState,
} from "react";

import {
  SupplierCatalogueDropzone,
} from "@/components/suppliers/SupplierCatalogueDropzone";

import {
  SupplierCatalogueImportPanel,
} from "@/components/suppliers/SupplierCatalogueImportPanel";

import {
  CatalogueReviewQueueEngine,
  type CatalogueReviewQueueDetails,
  type CatalogueReviewQueueItem,
} from "@/lib/supplier/CatalogueReviewQueueEngine";

import {
  CatalogueReviewQueueRepository,
} from "@/lib/supplier/CatalogueReviewQueueRepository";

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

export function SupplierCatalogueImportWorkspace({
  products = [],
}: Props) {
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
    isOpeningReview,
    setIsOpeningReview,
  ] =
    useState(false);

  function resetImport() {
    setSelectedFile(null);
    setExtractionResult(null);
    setCatalogueDetails(null);
    setAnalysisSession(null);
    setReviewItems([]);
    setQueueSaveError(null);
    setIsOpeningReview(false);

    void CatalogueReviewQueueRepository.clear();
  }

  async function openReviewQueue(
    session: CatalogueAnalysisSession,
    details: CatalogueReviewQueueDetails,
  ) {
    if (
      !extractionResult ||
      isOpeningReview
    ) {
      return;
    }

    setIsOpeningReview(true);
    setQueueSaveError(null);

    try {
      const memories =
        await VaultMemoryRepository.getAll();

      const queue =
        CatalogueReviewQueueEngine.buildQueue({
          session,
          extractionResult,
          details,
          products,
          memories,
        });

      setAnalysisSession(session);
      setCatalogueDetails(details);
      setReviewItems(queue);

      const saved =
        await CatalogueReviewQueueRepository.save({
          items: queue,
          details,
          savedAt:
            new Date().toISOString(),
        });

      if (!saved) {
        setQueueSaveError(
          "Vault OS could not save this review queue. Please try again.",
        );

        return;
      }

      window.location.href =
        "/supplier-catalogue/review";
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Vault OS could not prepare this review queue.";

      setQueueSaveError(message);
    } finally {
      setIsOpeningReview(false);
    }
  }

  return (
    <div className="supplier-catalogue-import-workspace">
      <SupplierCatalogueDropzone
        onFileSelected={(file) => {
          setSelectedFile(file);
          setExtractionResult(null);
          setCatalogueDetails(null);
          setAnalysisSession(null);
          setReviewItems([]);
          setQueueSaveError(null);
          setIsOpeningReview(false);

          void CatalogueReviewQueueRepository.clear();
        }}
        onExtractionComplete={(
          result,
          file,
        ) => {
          setSelectedFile(file);
          setExtractionResult(result);
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
            setAnalysisSession
          }
          onCancel={
            resetImport
          }
          onContinue={
            setCatalogueDetails
          }
          onOpenReviewQueue={(
            session,
            details,
          ) => {
            void openReviewQueue(
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
            Review queue could not be opened
          </strong>

          <p>
            {queueSaveError}
          </p>
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
              Loading Vault Brain Memory and preparing review items...
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
              Catalogue ready for visual analysis
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
              are ready to be grouped into supplier
              products.
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
      !isOpeningReview ? (
        <section className="supplier-review-queue-ready">
          <div>
            <p className="vault-eyebrow">
              Match Review
            </p>

            <h3>
              {reviewItems.length}{" "}
              {reviewItems.length === 1
                ? "product is"
                : "products are"}{" "}
              ready for review
            </h3>
          </div>

          <a
            className="brain-button"
            href="/supplier-catalogue/review"
          >
            Open Match Review →
          </a>
        </section>
      ) : null}
    </div>
  );
}