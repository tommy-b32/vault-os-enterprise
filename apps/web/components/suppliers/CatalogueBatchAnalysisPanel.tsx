"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  VaultBrainOverlay,
} from "@/components/brain/VaultBrainOverlay";

import {
  CatalogueBatchAnalysisEngine,
} from "@/lib/supplier/CatalogueBatchAnalysisEngine";

import {
  CatalogueProductGroupingEngine,
} from "@/lib/supplier/CatalogueProductGroupingEngine";

import type {
  CatalogueAnalysisSession,
} from "@/lib/supplier/catalogue-analysis-types";

import type {
  SupplierExtractionResult,
  SupplierDocumentPage,
} from "@/lib/supplier/types";

type Props = {
  extractionResult: SupplierExtractionResult;
  initialSession?: CatalogueAnalysisSession;
  loadSourcePages?: (pageNumbers: number[]) => Promise<SupplierDocumentPage[]>;
  sourceAvailablePageNumbers?: number[];
  existingReviewItemsReady?: boolean;
  canOpenReviewQueue?: boolean;
  isPreparingReviewQueue?: boolean;
  onSessionChange?: (
    session: CatalogueAnalysisSession,
  ) => void;
  onOpenReviewQueue?: (
    session: CatalogueAnalysisSession,
  ) => void;
};

function LazyCataloguePagePreview({ pageNumber, preview, canLoad, onVisible }: {
  pageNumber: number;
  preview: SupplierDocumentPage["images"][number] | undefined;
  canLoad: boolean;
  onVisible: (pageNumber: number) => void;
}) {
  const elementRef = useRef<HTMLSpanElement | null>(null);
  const requestedRef = useRef(false);
  useEffect(() => {
    if (!canLoad || preview || requestedRef.current || !elementRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      requestedRef.current = true;
      onVisible(pageNumber);
      observer.disconnect();
    }, { rootMargin: "300px" });
    observer.observe(elementRef.current);
    return () => observer.disconnect();
  }, [canLoad, onVisible, pageNumber, preview]);

  if (preview) return <img alt={`Supplier catalogue page ${pageNumber}`} loading="lazy" src={preview.dataUrl} />;
  return <span className="catalogue-page-selection-empty" ref={elementRef}>{canLoad ? "Loading preview..." : "Preview unavailable"}</span>;
}

export function CatalogueBatchAnalysisPanel({
  extractionResult,
  initialSession,
  loadSourcePages,
  sourceAvailablePageNumbers,
  existingReviewItemsReady = false,
  canOpenReviewQueue = false,
  isPreparingReviewQueue = false,
  onSessionChange,
  onOpenReviewQueue,
}: Props) {
  const [session, setSession] =
    useState<CatalogueAnalysisSession>(() =>
      initialSession ?? CatalogueBatchAnalysisEngine.createSession({
        documentId:
          extractionResult.document.id,
        fileName:
          extractionResult.document.fileName,
        pages:
          extractionResult.pages,
      }),
    );

  const [isRunning, setIsRunning] =
    useState(false);
  const [loadedSourcePages, setLoadedSourcePages] = useState<Record<number, SupplierDocumentPage>>(
    Object.fromEntries(extractionResult.pages.filter((page) => page.images.length > 0).map((page) => [page.pageNumber, page])),
  );
  const previewRequestsRef = useRef<Set<number>>(new Set());

  const [
    overlayTitle,
    setOverlayTitle,
  ] = useState(
    "Analysing supplier catalogue",
  );

  const [
    overlayStatus,
    setOverlayStatus,
  ] = useState(
    "Preparing Vault Vision...",
  );

  const [
    overlayProgress,
    setOverlayProgress,
  ] = useState(0);

  const [
    selectedPageNumbers,
    setSelectedPageNumbers,
  ] = useState<number[]>([]);

  const [
    lastSelectedPageNumber,
    setLastSelectedPageNumber,
  ] = useState<number | null>(null);

  useEffect(() => {
    onSessionChange?.(session);
  }, [onSessionChange, session]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const timer =
      window.setInterval(() => {
        setOverlayProgress(
          (current) => {
            const next =
              Math.min(
                88,
                current +
                  Math.max(
                    2,
                    Math.round(
                      (88 - current) *
                        0.12,
                    ),
                  ),
              );

            if (next >= 70) {
              setOverlayStatus(
                "Grouping catalogue evidence into supplier products...",
              );
            } else if (
              next >= 44
            ) {
              setOverlayStatus(
                "Reading brand, colour and product details...",
              );
            } else if (
              next >= 20
            ) {
              setOverlayStatus(
                "Inspecting rendered PDF images...",
              );
            }

            return next;
          },
        );
      }, 520);

    return () => {
      window.clearInterval(
        timer,
      );
    };
  }, [isRunning]);

  const analysedPages = useMemo(
    () =>
      Object.values(session.pages).filter(
        (record) =>
          record.status === "complete",
      ).length,
    [session.pages],
  );

  const failedPages = useMemo(
    () =>
      Object.values(session.pages).filter(
        (record) =>
          record.status === "failed",
      ).length,
    [session.pages],
  );

  const skippedPages = useMemo(
    () =>
      Object.values(session.pages).filter(
        (record) =>
          record.status === "skipped",
      ).length,
    [session.pages],
  );

  const remainingPages = Math.max(
    0,
    session.progress.totalPages -
      analysedPages -
      failedPages -
      skippedPages,
  );

  const hasDetectedProducts =
    session.productGroups.length > 0;
  const sourceAvailableNumbers = useMemo(
    () => new Set(sourceAvailablePageNumbers ?? extractionResult.pages.filter((page) => page.images.length > 0).map((page) => page.pageNumber)),
    [extractionResult.pages, sourceAvailablePageNumbers],
  );
  const analysablePageNumbers = useMemo(
    () => new Set(Object.values(session.pages).filter((page) =>
      (page.status === "pending" || page.status === "failed") && sourceAvailableNumbers.has(page.pageNumber),
    ).map((page) => page.pageNumber)),
    [session.pages, sourceAvailableNumbers],
  );

  async function resolveSourcePages(pageNumbers: number[]): Promise<SupplierDocumentPage[]> {
    const safePageNumbers = pageNumbers.filter((pageNumber) => analysablePageNumbers.has(pageNumber)).slice(0, 3);
    const cached = safePageNumbers.map((pageNumber) => loadedSourcePages[pageNumber]).filter(Boolean);
    const cachedNumbers = new Set(cached.map((page) => page.pageNumber));
    const missing = safePageNumbers.filter((pageNumber) => !cachedNumbers.has(pageNumber));
    const loaded = loadSourcePages && missing.length > 0 ? await loadSourcePages(missing) : [];
    if (loaded.length > 0) setLoadedSourcePages((current) => ({ ...current, ...Object.fromEntries(loaded.map((page) => [page.pageNumber, page])) }));
    if (loadSourcePages) return [...cached, ...loaded].sort((left, right) => left.pageNumber - right.pageNumber);
    const selected = new Set(safePageNumbers);
    return extractionResult.pages.filter((page) => selected.has(page.pageNumber));
  }

  function loadPreview(pageNumber: number) {
    if (!loadSourcePages || previewRequestsRef.current.has(pageNumber)) return;
    previewRequestsRef.current.add(pageNumber);
    void loadSourcePages([pageNumber]).then((pages) => {
      setLoadedSourcePages((current) => ({ ...current, ...Object.fromEntries(pages.map((page) => [page.pageNumber, page])) }));
    }).catch(() => { previewRequestsRef.current.delete(pageNumber); });
  }

  function togglePageSelection(
    pageNumber: number,
    useRange: boolean,
  ) {
    if (!analysablePageNumbers.has(pageNumber)) return;
    if (
      useRange &&
      lastSelectedPageNumber !== null
    ) {
      const start = Math.min(
        lastSelectedPageNumber,
        pageNumber,
      );

      const end = Math.max(
        lastSelectedPageNumber,
        pageNumber,
      );

      const range =
        extractionResult.pages
          .map((page) => page.pageNumber)
          .filter(
            (candidate) =>
              candidate >= start &&
              candidate <= end &&
              analysablePageNumbers.has(candidate),
          );

      setSelectedPageNumbers((current) =>
        Array.from(
          new Set([
            ...current,
            ...range,
          ]),
        ).sort(
          (left, right) =>
            left - right,
        ),
      );

      setLastSelectedPageNumber(
        pageNumber,
      );

      return;
    }

    setSelectedPageNumbers((current) =>
      current.includes(pageNumber)
        ? current.filter(
            (candidate) =>
              candidate !== pageNumber,
          )
        : [
            ...current,
            pageNumber,
          ].sort(
            (left, right) =>
              left - right,
          ),
    );

    setLastSelectedPageNumber(
      pageNumber,
    );
  }

  function clearSelection() {
    setSelectedPageNumbers([]);
    setLastSelectedPageNumber(null);
  }

  async function completeAnalysis(
    analysedSession: CatalogueAnalysisSession,
  ) {
    setOverlayStatus(
      "Preparing products for Match Review...",
    );

    setOverlayProgress(
      94,
    );

    const groupedSession =
  CatalogueProductGroupingEngine.groupSession(
    analysedSession,
  );

console.log(
  "PAGE 384 GARMENTS",
  analysedSession.pages[384]?.extraction?.garments,
);

console.log(
  "PAGE 384 PRODUCT GROUPS",
  groupedSession.productGroups.filter(
    (group) =>
      group.pageNumbers.includes(384),
  ),
);

    setOverlayStatus(
      `${groupedSession.productGroups.length} ${
        groupedSession.productGroups.length === 1
          ? "product detected"
          : "products detected"
      }. Finalising review queue...`,
    );

    setOverlayProgress(
      100,
    );

    await new Promise<void>(
      (resolve) => {
        window.setTimeout(
          resolve,
          420,
        );
      },
    );

    setSession(
      groupedSession,
    );

    if (
      groupedSession.productGroups.length > 0 &&
      canOpenReviewQueue
    ) {
      onOpenReviewQueue?.(
        groupedSession,
      );
    }
  }

  async function analyseNextBatch() {
    if (isRunning) {
      return;
    }

    setOverlayTitle(
      "Analysing next catalogue pages",
    );

    setOverlayStatus(
      "Preparing the next three rendered pages...",
    );

    setOverlayProgress(
      6,
    );

    setIsRunning(true);

    try {
      const nextPageNumbers = Object.values(session.pages)
        .filter((page) => (page.status === "pending" || page.status === "failed") && sourceAvailableNumbers.has(page.pageNumber))
        .sort((left, right) => left.pageNumber - right.pageNumber)
        .slice(0, 3)
        .map((page) => page.pageNumber);
      const sourcePages = await resolveSourcePages(nextPageNumbers);
      const analysedSession =
        await CatalogueBatchAnalysisEngine.runNextBatch({
          session,
          pages: sourcePages,
          maximumPages: 3,
        });

      await completeAnalysis(
        analysedSession,
      );
    } finally {
      setIsRunning(false);
    }
  }

  async function analyseSelectedPages() {
    if (
      isRunning ||
      selectedPageNumbers.length === 0
    ) {
      return;
    }

    setOverlayTitle(
      `Analysing ${selectedPageNumbers.length} selected ${
        selectedPageNumbers.length === 1
          ? "page"
          : "pages"
      }`,
    );

    setOverlayStatus(
      "Preparing selected supplier evidence...",
    );

    setOverlayProgress(
      6,
    );

    setIsRunning(true);

    try {
      const sourcePages = await resolveSourcePages(selectedPageNumbers);
      const analysedSession =
        await CatalogueBatchAnalysisEngine.runSelectedPages({
          session,
          pages: sourcePages,
          pageNumbers:
            selectedPageNumbers,
        });

      clearSelection();

      await completeAnalysis(
        analysedSession,
      );
    } finally {
      setIsRunning(false);
    }
  }

  function openReviewQueue() {
    if (
      !hasDetectedProducts ||
      !canOpenReviewQueue
    ) {
      return;
    }

    onOpenReviewQueue?.(session);
  }

  return (
    <>
      <VaultBrainOverlay
        progress={
          overlayProgress
        }
        status={
          overlayStatus
        }
        title={
          overlayTitle
        }
        visible={
          isRunning
        }
      />

      <section className="catalogue-batch-analysis-panel">
      <header className="catalogue-batch-analysis-header">
        <div>
          <p className="vault-eyebrow">
            Vault Vision Pipeline
          </p>

          <h3>
            Catalogue product detection
          </h3>

          <p>
            Select only the catalogue pages you want to
            analyse, or continue through the PDF three pages
            at a time.
          </p>
        </div>

        <span>
          {session.progress.state}
        </span>
      </header>

      <div className="catalogue-batch-analysis-stats">
        <article>
          <span>Total pages</span>
          <strong>
            {session.progress.totalPages}
          </strong>
        </article>

        <article>
          <span>Analysed</span>
          <strong>{analysedPages}</strong>
        </article>

        <article>
          <span>Selected</span>
          <strong>
            {selectedPageNumbers.length}
          </strong>
        </article>

        <article>
          <span>Remaining</span>
          <strong>{remainingPages}</strong>
        </article>

        <article>
          <span>Products detected</span>
          <strong>
            {session.productGroups.length}
          </strong>
        </article>
      </div>

      <section className="catalogue-page-selection-panel">
        <header className="catalogue-page-selection-header">
          <div>
            <p className="vault-eyebrow">
              Quick Selection
            </p>

            <h4>
              Choose pages to analyse
            </h4>

            <p>
              Click individual pages. Hold Shift while
              clicking another page to select the complete
              range between them.
            </p>
          </div>

          <div>
            <span>
              {selectedPageNumbers.length} selected
            </span>

            <button
              className="catalogue-page-selection-clear"
              disabled={
                selectedPageNumbers.length === 0
              }
              onClick={clearSelection}
              type="button"
            >
              Clear Selection
            </button>
          </div>
        </header>

        <div className="catalogue-page-selection-grid">
          {extractionResult.pages.map(
            (page) => {
              const preview =
                loadedSourcePages[page.pageNumber]?.images[0] ?? page.images[0];

              const isSelected =
                selectedPageNumbers.includes(
                  page.pageNumber,
                );

              const record =
                session.pages[
                  page.pageNumber
                ];
              const isAnalysable = analysablePageNumbers.has(page.pageNumber);

              return (
                <button
                  aria-pressed={isSelected}
                  className={[
                    "catalogue-page-selection-card",
                    isSelected
                      ? "is-selected"
                      : "",
                    record?.status ===
                    "complete"
                      ? "is-analysed"
                      : "",
                    !isAnalysable && record?.status !== "complete" ? "is-unavailable" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={page.pageNumber}
                  disabled={!isAnalysable}
                  onClick={(event) =>
                    togglePageSelection(
                      page.pageNumber,
                      event.shiftKey,
                    )
                  }
                  type="button"
                >
                  <span className="catalogue-page-selection-number">
                    Page {page.pageNumber}
                  </span>

                  <LazyCataloguePagePreview
                    canLoad={sourceAvailableNumbers.has(page.pageNumber)}
                    onVisible={loadPreview}
                    pageNumber={page.pageNumber}
                    preview={preview}
                  />

                  <span className="catalogue-page-selection-state">
                    {isSelected
                      ? "✓ Selected"
                      : record?.status ===
                          "complete"
                        ? "Analysed"
                        : isAnalysable
                          ? "Select"
                          : "Unavailable"}
                  </span>
                </button>
              );
            },
          )}
        </div>

        <footer className="catalogue-page-selection-actions">
          <div>
            <strong>
              {selectedPageNumbers.length > 0
                ? `Pages ${selectedPageNumbers.join(", ")}`
                : "No pages selected"}
            </strong>

            <span>
              Select every page belonging to the product,
              including close-ups, labels and supplier
              photographs.
            </span>
          </div>

          <button
            className="brain-button"
            disabled={
              isRunning ||
              selectedPageNumbers.length === 0
            }
            onClick={() => {
              void analyseSelectedPages();
            }}
            type="button"
          >
            {isRunning
              ? "Analysing selected pages..."
              : `Analyse Selected Pages (${selectedPageNumbers.length})`}
          </button>
        </footer>
      </section>

      {session.productGroups.length > 0 ? (
        <div className="catalogue-product-group-preview">
          <div className="catalogue-product-group-preview-header">
            <div>
              <p className="vault-eyebrow">
                Detected Products
              </p>

              <h4>
                Ready for catalogue matching
              </h4>
            </div>

            <span>
              {session.productGroups.length}{" "}
              {session.productGroups.length === 1
                ? "product"
                : "products"}
            </span>
          </div>

          {session.productGroups.map(
            (group) => (
              <article key={group.id}>
                <div>
                  <strong>
                    {group.productName ??
                      "Product name pending"}
                  </strong>

                  <span>
                    {[
                      group.brand,
                      group.colour,
                      group.productType,
                    ]
                      .filter(Boolean)
                      .join(" · ") ||
                      "Product details require review"}
                  </span>
                </div>

                <div>
                  <span>
                    Pages {group.startPage}
                    {group.endPage !==
                    group.startPage
                      ? `–${group.endPage}`
                      : ""}
                  </span>

                  <strong>
                    {group.confidence}%
                  </strong>
                </div>
              </article>
            ),
          )}
        </div>
      ) : null}

      <footer className="catalogue-batch-analysis-footer">
        <div>
          <p>
            {selectedPageNumbers.length > 0
              ? `${selectedPageNumbers.length} selected ${
                  selectedPageNumbers.length === 1
                    ? "page is"
                    : "pages are"
                } ready for analysis.`
              : "Select specific product pages above, or use the sequential scan to work through the catalogue in order."}
          </p>

          {!canOpenReviewQueue ? (
            <span>
              Select the supplier and confirm the catalogue
              details before opening Match Review.
            </span>
          ) : null}

          {failedPages > 0 ? (
            <span>
              Some pages failed analysis and can be retried.
            </span>
          ) : null}
        </div>

        <div className="catalogue-batch-analysis-actions">
          <button
            className="brain-button brain-button-secondary"
            disabled={
              isRunning ||
              isPreparingReviewQueue ||
              (!hasDetectedProducts && !existingReviewItemsReady) ||
              !canOpenReviewQueue
            }
            onClick={openReviewQueue}
            type="button"
          >
            {isPreparingReviewQueue
              ? "Preparing Review Queue..."
              : "Open Review Queue →"}
          </button>

          <button
            className="brain-button"
            disabled={
              isRunning ||
              (
                selectedPageNumbers.length === 0 &&
                (remainingPages === 0 || analysablePageNumbers.size === 0)
              )
            }
            onClick={() => {
              if (
                selectedPageNumbers.length > 0
              ) {
                void analyseSelectedPages();
                return;
              }

              void analyseNextBatch();
            }}
            type="button"
          >
            {isRunning
              ? selectedPageNumbers.length > 0
                ? "Analysing selected pages..."
                : "Analysing next 3 pages..."
              : selectedPageNumbers.length > 0
                ? `Analyse Selected Pages (${selectedPageNumbers.length})`
                : remainingPages === 0
                  ? "Catalogue analysis complete"
                  : analysablePageNumbers.size === 0
                    ? "No durable pages available"
                    : "Analyse Next 3 Pages"}
          </button>
        </div>
      </footer>
      </section>
    </>
  );
}
