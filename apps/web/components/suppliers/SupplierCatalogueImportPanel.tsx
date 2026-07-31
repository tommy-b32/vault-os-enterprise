"use client";

import {
  useMemo,
  useState,
} from "react";

import {
  CatalogueBatchAnalysisPanel,
} from "@/components/suppliers/CatalogueBatchAnalysisPanel";

import type {
  CatalogueAnalysisSession,
} from "@/lib/supplier/catalogue-analysis-types";

import type {
  SupplierExtractionResult,
} from "@/lib/supplier/types";

type CataloguePageExtraction = {
  pageNumber: number;
  brand: string | null;
  productName: string | null;
  productType: string | null;
  colour: string | null;
  displayedPrice: number | null;
  currency: string | null;
  supplierSku: string | null;
  sizes: string[];
  packQuantity: number | null;
  imageCount: number;
  pageRole:
    | "official-product"
    | "supplier-product"
    | "detail"
    | "label"
    | "mixed"
    | "unknown";
  possibleSameProductAsPreviousPage: boolean;
  rawVisibleText: string[];
  confidence: number;
  warnings: string[];
};

type ExtractPageResponse = {
  extraction?: CataloguePageExtraction;
  error?: string;
};

type CatalogueDetails = {
  supplierName: string;
  collectionName: string;
  catalogueType:
    | "products"
    | "footwear"
    | "accessories";
  leadTimeDays: number | null;
};

type Props = {
  fileName: string;
  extractionResult: SupplierExtractionResult;

  onCancel?: () => void;

  onAnalysisSessionChange?: (
    session: CatalogueAnalysisSession,
  ) => void;

  onOpenReviewQueue?: (
    session: CatalogueAnalysisSession,
    details: CatalogueDetails,
  ) => void;

  onContinue?: (
    details: CatalogueDetails,
  ) => void;
};

type ImportStage =
  | "summary"
  | "details"
  | "analysis";

function removePdfExtension(
  fileName: string,
): string {
  return fileName.replace(
    /\.pdf$/i,
    "",
  );
}

export function SupplierCatalogueImportPanel({
  fileName,
  extractionResult,
  onCancel,
  onAnalysisSessionChange,
  onOpenReviewQueue,
  onContinue,
}: Props) {
  const [stage, setStage] =
    useState<ImportStage>("summary");

  const [supplierName, setSupplierName] =
    useState("");

  const [
    collectionName,
    setCollectionName,
  ] = useState(
    removePdfExtension(fileName),
  );

  const [
    catalogueType,
    setCatalogueType,
  ] = useState<
    "products" | "footwear" | "accessories"
  >("products");

  const [
    leadTimeValue,
    setLeadTimeValue,
  ] = useState("");

  const [
    selectedPageNumber,
    setSelectedPageNumber,
  ] = useState<number | null>(null);

  const [
    isAnalysingPage,
    setIsAnalysingPage,
  ] = useState(false);

  const [
    pageAnalysis,
    setPageAnalysis,
  ] =
    useState<CataloguePageExtraction | null>(
      null,
    );

  const [
    pageAnalysisError,
    setPageAnalysisError,
  ] = useState<string | null>(null);

  const totalPreviews = useMemo(
    () =>
      extractionResult.pages.reduce(
        (total, page) =>
          total + page.images.length,
        0,
      ),
    [extractionResult.pages],
  );

  const selectedPage =
    selectedPageNumber === null
      ? null
      : extractionResult.pages.find(
          (page) =>
            page.pageNumber ===
            selectedPageNumber,
        ) ?? null;

  const selectedPreview =
    selectedPage?.images[0] ?? null;

  const canContinue =
    supplierName.trim().length > 0 &&
    collectionName.trim().length > 0 &&
    extractionResult.successful;

  function getCatalogueDetails(): CatalogueDetails {
    const parsedLeadTime =
      Number.parseInt(
        leadTimeValue,
        10,
      );

    return {
      supplierName:
        supplierName.trim(),

      collectionName:
        collectionName.trim(),

      catalogueType,

      leadTimeDays:
        Number.isFinite(parsedLeadTime) &&
        parsedLeadTime > 0
          ? parsedLeadTime
          : null,
    };
  }

  function confirmDetails() {
    if (!canContinue) {
      return;
    }

    const details =
      getCatalogueDetails();

    onContinue?.(details);

    setStage("analysis");
  }

  function handleOpenReviewQueue(
    session: CatalogueAnalysisSession,
  ) {
    if (!canContinue) {
      return;
    }

    const details =
      getCatalogueDetails();

    onContinue?.(details);

    onOpenReviewQueue?.(
      session,
      details,
    );
  }

  async function analyseSelectedPage() {
    if (
      !selectedPreview ||
      selectedPageNumber === null
    ) {
      return;
    }

    setIsAnalysingPage(true);
    setPageAnalysis(null);
    setPageAnalysisError(null);

    try {
      const response =
        await fetch(
          "/api/supplier-catalogue/extract-page",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              pageNumber:
                selectedPageNumber,

              imageDataUrl:
                selectedPreview.dataUrl,
            }),
          },
        );

      const payload =
        (await response.json()) as ExtractPageResponse;

      if (
        !response.ok ||
        !payload.extraction
      ) {
        throw new Error(
          payload.error ??
            "Vault Brain could not analyse this page.",
        );
      }

      setPageAnalysis(
        payload.extraction,
      );
    } catch (error) {
      setPageAnalysisError(
        error instanceof Error
          ? error.message
          : "An unknown page analysis error occurred.",
      );
    } finally {
      setIsAnalysingPage(false);
    }
  }

  return (
    <section className="supplier-guided-import">
      <nav
        aria-label="Catalogue import progress"
        className="supplier-guided-import-steps"
      >
        {[
          {
            id: "summary",
            label: "Catalogue imported",
          },
          {
            id: "details",
            label: "Supplier details",
          },
          {
            id: "analysis",
            label: "Vault Vision",
          },
        ].map((item, index) => {
          const stageOrder = [
            "summary",
            "details",
            "analysis",
          ];

          const activeIndex =
            stageOrder.indexOf(stage);

          const itemIndex =
            stageOrder.indexOf(
              item.id as ImportStage,
            );

          return (
            <div
              className={[
                "supplier-guided-import-step",
                itemIndex === activeIndex
                  ? "is-active"
                  : "",
                itemIndex < activeIndex
                  ? "is-complete"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={item.id}
            >
              <span>
                {itemIndex < activeIndex
                  ? "✓"
                  : index + 1}
              </span>

              <strong>
                {item.label}
              </strong>
            </div>
          );
        })}
      </nav>

      {stage === "summary" ? (
        <section className="supplier-guided-stage supplier-guided-summary">
          <div className="supplier-guided-success-mark">
            ✓
          </div>

          <p className="vault-eyebrow">
            Step 1 complete
          </p>

          <h2>
            Catalogue imported successfully
          </h2>

          <p className="supplier-guided-stage-copy">
            Vault OS has rendered the document and prepared
            every page for visual catalogue analysis.
          </p>

          <section className="supplier-guided-summary-grid">
            <article className="supplier-guided-summary-document">
              <span>Document</span>

              <strong>
                {
                  extractionResult.document
                    .fileName
                }
              </strong>
            </article>

            <article>
              <span>PDF pages</span>

              <strong>
                {
                  extractionResult.document
                    .pageCount
                }
              </strong>
            </article>

            <article>
              <span>Page previews</span>

              <strong>
                {totalPreviews}
              </strong>
            </article>

            <article>
              <span>Text confidence</span>

              <strong>
                {
                  extractionResult.confidence
                }
                %
              </strong>
            </article>
          </section>

          {extractionResult.warnings.length >
          0 ? (
            <div className="supplier-guided-warning">
              <div>
                <strong>
                  Image-first catalogue detected
                </strong>

                <p>
                  Vault Vision will analyse rendered page
                  images because this PDF contains little or
                  no selectable text.
                </p>
              </div>

              <span>
                {
                  extractionResult.warnings
                    .length
                }{" "}
                notices
              </span>
            </div>
          ) : null}

          <footer className="supplier-guided-stage-actions">
            <button
              className="brain-button brain-button-secondary"
              onClick={onCancel}
              type="button"
            >
              Choose Different PDF
            </button>

            <button
              className="brain-button"
              onClick={() =>
                setStage("details")
              }
              type="button"
            >
              Continue to Supplier Details →
            </button>
          </footer>
        </section>
      ) : null}

      {stage === "details" ? (
        <section className="supplier-guided-stage supplier-guided-details">
          <header className="supplier-guided-stage-header">
            <div>
              <p className="vault-eyebrow">
                Step 2
              </p>

              <h2>
                Confirm catalogue details
              </h2>

              <p>
                These details connect the PDF to the correct
                supplier archive and purchasing rules.
              </p>
            </div>

            <span>
              Required before analysis
            </span>
          </header>

          <div className="supplier-guided-details-grid">
            <label>
              <span>Supplier</span>

              <select
                onChange={(event) =>
                  setSupplierName(
                    event.target.value,
                  )
                }
                value={supplierName}
              >
                <option value="">
                  Select supplier...
                </option>

                <option value="Exclusive">
                  Exclusive
                </option>

                <option value="Icon">
                  Icon
                </option>

                <option value="Tony Footwear">
                  Tony Footwear
                </option>
              </select>
            </label>

            <label className="supplier-guided-wide-field">
              <span>
                Season / Collection
              </span>

              <input
                onChange={(event) =>
                  setCollectionName(
                    event.target.value,
                  )
                }
                value={collectionName}
              />
            </label>

            <label>
              <span>Catalogue Type</span>

              <select
                onChange={(event) =>
                  setCatalogueType(
                    event.target.value as
                      | "products"
                      | "footwear"
                      | "accessories",
                  )
                }
                value={catalogueType}
              >
                <option value="products">
                  Products
                </option>

                <option value="footwear">
                  Footwear
                </option>

                <option value="accessories">
                  Accessories
                </option>
              </select>
            </label>

            <label>
              <span>
                Expected Lead Time
              </span>

              <div className="supplier-guided-number-field">
                <input
                  inputMode="numeric"
                  onChange={(event) =>
                    setLeadTimeValue(
                      event.target.value,
                    )
                  }
                  placeholder="10"
                  value={leadTimeValue}
                />

                <span>days</span>
              </div>
            </label>
          </div>

          <div className="supplier-guided-details-note">
            <strong>
              Why Vault OS needs this
            </strong>

            <p>
              Supplier identity and lead time are used later
              for product matching, stock-risk analysis and
              recommended buying quantities.
            </p>
          </div>

          <footer className="supplier-guided-stage-actions">
            <button
              className="brain-button brain-button-secondary"
              onClick={() =>
                setStage("summary")
              }
              type="button"
            >
              ← Back
            </button>

            <button
              className="brain-button"
              disabled={!canContinue}
              onClick={confirmDetails}
              type="button"
            >
              Save Details & Continue →
            </button>
          </footer>
        </section>
      ) : null}

      {stage === "analysis" ? (
        <section className="supplier-guided-analysis">
          <header className="supplier-guided-analysis-header">
            <div>
              <p className="vault-eyebrow">
                Step 3
              </p>

              <h2>
                Vault Vision catalogue analysis
              </h2>

              <p>
                Analyse pages in controlled batches, inspect
                any page manually and open Match Review when
                products are ready.
              </p>
            </div>

            <button
              className="brain-button brain-button-secondary"
              onClick={() =>
                setStage("details")
              }
              type="button"
            >
              Edit Details
            </button>
          </header>

          <section className="supplier-guided-confirmed-details">
            <article>
              <span>Supplier</span>

              <strong>
                {supplierName}
              </strong>
            </article>

            <article>
              <span>Collection</span>

              <strong>
                {collectionName}
              </strong>
            </article>

            <article>
              <span>Type</span>

              <strong>
                {catalogueType}
              </strong>
            </article>

            <article>
              <span>Lead time</span>

              <strong>
                {leadTimeValue
                  ? `${leadTimeValue} days`
                  : "Not entered"}
              </strong>
            </article>
          </section>

          <CatalogueBatchAnalysisPanel
            canOpenReviewQueue={
              canContinue
            }
            extractionResult={
              extractionResult
            }
            onOpenReviewQueue={
              handleOpenReviewQueue
            }
            onSessionChange={
              onAnalysisSessionChange
            }
          />

          <details className="supplier-guided-page-browser">
            <summary>
              <span>
                Browse rendered PDF pages
              </span>

              <strong>
                {
                  extractionResult.pages
                    .length
                }{" "}
                pages
              </strong>
            </summary>

            <div className="supplier-page-thumbnail-grid">
              {extractionResult.pages.map(
                (page) => {
                  const preview =
                    page.images[0];

                  return (
                    <button
                      aria-label={`Open PDF page ${page.pageNumber}`}
                      className={[
                        "supplier-page-thumbnail",
                        selectedPageNumber ===
                        page.pageNumber
                          ? "is-selected"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={
                        page.pageNumber
                      }
                      onClick={() => {
                        setSelectedPageNumber(
                          page.pageNumber,
                        );

                        setPageAnalysis(
                          null,
                        );

                        setPageAnalysisError(
                          null,
                        );
                      }}
                      type="button"
                    >
                      <span className="supplier-page-thumbnail-number">
                        Page{" "}
                        {page.pageNumber}
                      </span>

                      {preview ? (
                        <img
                          alt={`Rendered supplier catalogue page ${page.pageNumber}`}
                          loading="lazy"
                          src={
                            preview.dataUrl
                          }
                        />
                      ) : (
                        <span className="supplier-page-thumbnail-empty">
                          Preview unavailable
                        </span>
                      )}

                      <span className="supplier-page-thumbnail-footer">
                        {page.text
                          ? "Text detected"
                          : "Image only"}
                      </span>
                    </button>
                  );
                },
              )}
            </div>
          </details>

          <footer className="supplier-guided-analysis-footer">
            <button
              className="brain-button brain-button-secondary"
              onClick={onCancel}
              type="button"
            >
              Cancel Import
            </button>
          </footer>
        </section>
      ) : null}

      {selectedPreview ? (
        <div
          aria-label={`PDF page ${selectedPageNumber} preview`}
          className="supplier-page-preview-modal"
          role="dialog"
        >
          <button
            aria-label="Close page preview"
            className="supplier-page-preview-backdrop"
            onClick={() =>
              setSelectedPageNumber(
                null,
              )
            }
            type="button"
          />

          <article className="supplier-page-preview-panel">
            <header>
              <div>
                <span className="vault-eyebrow">
                  Catalogue Preview
                </span>

                <h3>
                  Page{" "}
                  {selectedPageNumber}
                </h3>
              </div>

              <button
                aria-label="Close page preview"
                onClick={() =>
                  setSelectedPageNumber(
                    null,
                  )
                }
                type="button"
              >
                ×
              </button>
            </header>

            <img
              alt={`Full rendered supplier catalogue page ${selectedPageNumber}`}
              src={
                selectedPreview.dataUrl
              }
            />

            <section className="supplier-page-ai-analysis">
              <div className="supplier-page-ai-analysis-heading">
                <div>
                  <span className="vault-eyebrow">
                    Vault Vision
                  </span>

                  <h4>
                    Analyse this catalogue page
                  </h4>

                  <p>
                    Identify the visible brand, product,
                    colour, price and page role from this
                    rendered page.
                  </p>
                </div>

                <button
                  className="brain-button"
                  disabled={
                    isAnalysingPage
                  }
                  onClick={() => {
                    void analyseSelectedPage();
                  }}
                  type="button"
                >
                  {isAnalysingPage
                    ? "Analysing page..."
                    : pageAnalysis
                      ? "Analyse Again"
                      : "Analyse this page"}
                </button>
              </div>

              {pageAnalysisError ? (
                <div
                  className="supplier-page-ai-error"
                  role="alert"
                >
                  {pageAnalysisError}
                </div>
              ) : null}

              {pageAnalysis ? (
                <div className="supplier-page-ai-result">
                  <header>
                    <div>
                      <span>
                        AI extraction
                      </span>

                      <strong>
                        {pageAnalysis.productName ??
                          "Product name not confirmed"}
                      </strong>
                    </div>

                    <span>
                      {
                        pageAnalysis.confidence
                      }
                      % confidence
                    </span>
                  </header>

                  <div className="supplier-page-ai-result-grid">
                    <article>
                      <span>Brand</span>

                      <strong>
                        {pageAnalysis.brand ??
                          "Not detected"}
                      </strong>
                    </article>

                    <article>
                      <span>
                        Product type
                      </span>

                      <strong>
                        {pageAnalysis.productType ??
                          "Not detected"}
                      </strong>
                    </article>

                    <article>
                      <span>Colour</span>

                      <strong>
                        {pageAnalysis.colour ??
                          "Not detected"}
                      </strong>
                    </article>

                    <article>
                      <span>
                        Displayed price
                      </span>

                      <strong>
                        {pageAnalysis.displayedPrice !==
                        null
                          ? `${pageAnalysis.currency ?? ""} ${pageAnalysis.displayedPrice}`.trim()
                          : "Not shown"}
                      </strong>
                    </article>

                    <article>
                      <span>Page role</span>

                      <strong>
                        {pageAnalysis.pageRole.replaceAll(
                          "-",
                          " ",
                        )}
                      </strong>
                    </article>

                    <article>
                      <span>
                        Visible images
                      </span>

                      <strong>
                        {
                          pageAnalysis.imageCount
                        }
                      </strong>
                    </article>
                  </div>

                  {pageAnalysis.sizes.length >
                  0 ? (
                    <p>
                      <strong>
                        Sizes:
                      </strong>{" "}
                      {pageAnalysis.sizes.join(
                        ", ",
                      )}
                    </p>
                  ) : null}

                  {pageAnalysis.rawVisibleText
                    .length > 0 ? (
                    <p>
                      <strong>
                        Visible text:
                      </strong>{" "}
                      {pageAnalysis.rawVisibleText.join(
                        " · ",
                      )}
                    </p>
                  ) : null}

                  {pageAnalysis.warnings.length >
                  0 ? (
                    <div className="supplier-page-ai-warnings">
                      {pageAnalysis.warnings.map(
                        (warning) => (
                          <p key={warning}>
                            {warning}
                          </p>
                        ),
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            {selectedPage?.text ? (
              <section className="supplier-page-extracted-text">
                <span>
                  Extracted text
                </span>

                <p>
                  {selectedPage.text}
                </p>
              </section>
            ) : null}
          </article>
        </div>
      ) : null}
    </section>
  );
}