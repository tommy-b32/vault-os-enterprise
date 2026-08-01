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
  CatalogueIntelligenceDashboard,
} from "@/components/suppliers/CatalogueIntelligenceDashboard";

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
    isPreparingIntelligence,
    setIsPreparingIntelligence,
  ] =
    useState(false);

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
    setIsPreparingIntelligence(false);
    setIsOpeningReview(false);

    void CatalogueReviewQueueRepository.clear();
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

      const queue =
        CatalogueReviewQueueEngine.buildQueue({
          session,
          extractionResult,
          details,
          products,
          memories,
        });

      setAnalysisSession(
        session,
      );

      setCatalogueDetails(
        details,
      );

      setReviewItems(
        queue,
      );

      /*
       * Do not redirect yet.
       * The Catalogue Intelligence Dashboard now decides
       * whether to open only required review items or the
       * complete queue.
       */
      await CatalogueReviewQueueRepository.clear();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Vault OS could not analyse this supplier catalogue.";

      setQueueSaveError(
        message,
      );
    } finally {
      setIsPreparingIntelligence(
        false,
      );
    }
  }

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
      const saved =
        await CatalogueReviewQueueRepository.save({
          items:
            itemsToReview,

          details:
            catalogueDetails,

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

          void CatalogueReviewQueueRepository.clear();
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