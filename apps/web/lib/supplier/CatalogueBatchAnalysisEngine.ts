import type {
  SupplierDocumentPage,
} from "@/lib/supplier/types";

import type {
  CatalogueAnalysisSession,
  CataloguePageAnalysisRecord,
} from "@/lib/supplier/catalogue-analysis-types";

type AnalysePageResponse = {
  extraction?: CataloguePageAnalysisRecord["extraction"];
  error?: string;
};

type AnalyseBatchInput = {
  session: CatalogueAnalysisSession;
  pages: SupplierDocumentPage[];
  maximumPages?: number;
};

type AnalyseSelectedPagesInput = {
  session: CatalogueAnalysisSession;
  pages: SupplierDocumentPage[];
  pageNumbers: number[];
};

function createPendingRecord(
  pageNumber: number,
): CataloguePageAnalysisRecord {
  return {
    pageNumber,
    status: "pending",
    extraction: null,
    error: null,
    attempts: 0,
    analysedAt: null,
  };
}

function getPagePreview(
  page: SupplierDocumentPage,
): string | null {
  return page.images[0]?.dataUrl ?? null;
}

function getNextPages({
  session,
  pages,
  maximumPages,
}: {
  session: CatalogueAnalysisSession;
  pages: SupplierDocumentPage[];
  maximumPages: number;
}): SupplierDocumentPage[] {
  return pages
    .filter((page) => {
      const record =
        session.pages[page.pageNumber];

      return (
        !record ||
        record.status === "pending" ||
        record.status === "failed"
      );
    })
    .filter(
      (page) =>
        getPagePreview(page) !== null,
    )
    .slice(0, maximumPages);
}

function getSelectedPages({
  pages,
  pageNumbers,
}: {
  pages: SupplierDocumentPage[];
  pageNumbers: number[];
}): SupplierDocumentPage[] {
  const selectedNumbers =
    new Set(pageNumbers);

  return pages
    .filter((page) =>
      selectedNumbers.has(
        page.pageNumber,
      ),
    )
    .filter(
      (page) =>
        getPagePreview(page) !== null,
    )
    .sort(
      (left, right) =>
        left.pageNumber - right.pageNumber,
    );
}

async function analysePage(
  page: SupplierDocumentPage,
): Promise<CataloguePageAnalysisRecord> {
  const preview =
    getPagePreview(page);

  if (!preview) {
    return {
      pageNumber: page.pageNumber,
      status: "skipped",
      extraction: null,
      error:
        "No rendered page preview is available.",
      attempts: 0,
      analysedAt:
        new Date().toISOString(),
    };
  }

  try {
    const response = await fetch(
      "/api/supplier-catalogue/extract-page",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          pageNumber:
            page.pageNumber,

          imageDataUrl:
            preview,
        }),
      },
    );

    const payload =
      (await response.json()) as AnalysePageResponse;

    if (
      !response.ok ||
      !payload.extraction
    ) {
      throw new Error(
        payload.error ??
          "Vault Brain could not analyse this page.",
      );
    }

    return {
      pageNumber:
        page.pageNumber,

      status: "complete",

      extraction:
        payload.extraction,

      error: null,

      attempts: 1,

      analysedAt:
        new Date().toISOString(),
    };
  } catch (error) {
    return {
      pageNumber:
        page.pageNumber,

      status: "failed",

      extraction: null,

      error:
        error instanceof Error
          ? error.message
          : "An unknown page-analysis error occurred.",

      attempts: 1,

      analysedAt:
        new Date().toISOString(),
    };
  }
}

function calculateProgress(
  session: CatalogueAnalysisSession,
): CatalogueAnalysisSession["progress"] {
  const records =
    Object.values(session.pages);

  const completedPages =
    records.filter(
      (record) =>
        record.status === "complete",
    ).length;

  const failedPages =
    records.filter(
      (record) =>
        record.status === "failed",
    ).length;

  const skippedPages =
    records.filter(
      (record) =>
        record.status === "skipped",
    ).length;

  const processedPages =
    completedPages +
    failedPages +
    skippedPages;

  const isComplete =
    processedPages >=
    session.progress.totalPages;

  return {
    ...session.progress,

    state:
      isComplete
        ? "complete"
        : "paused",

    completedPages,
    failedPages,
    skippedPages,

    currentPageNumber: null,

    completedAt:
      isComplete
        ? new Date().toISOString()
        : null,

    error: null,
  };
}

async function analysePages({
  session,
  pages,
}: {
  session: CatalogueAnalysisSession;
  pages: SupplierDocumentPage[];
}): Promise<CatalogueAnalysisSession> {
  if (pages.length === 0) {
    return {
      ...session,
      progress:
        calculateProgress(session),
    };
  }

  let workingSession: CatalogueAnalysisSession =
    {
      ...session,

      pages: {
        ...session.pages,
      },

      progress: {
        ...session.progress,

        state: "running",

        startedAt:
          session.progress.startedAt ??
          new Date().toISOString(),

        completedAt: null,
        error: null,
      },
    };

  for (const page of pages) {
    const existingRecord =
      workingSession.pages[
        page.pageNumber
      ];

    workingSession = {
      ...workingSession,

      pages: {
        ...workingSession.pages,

        [page.pageNumber]: {
          ...(existingRecord ??
            createPendingRecord(
              page.pageNumber,
            )),

          status: "analysing",

          error: null,

          attempts:
            (existingRecord?.attempts ??
              0) + 1,
        },
      },

      progress: {
        ...workingSession.progress,

        currentPageNumber:
          page.pageNumber,
      },
    };

    const result =
      await analysePage(page);

    workingSession = {
      ...workingSession,

      pages: {
        ...workingSession.pages,

        [page.pageNumber]: {
          ...result,

          attempts:
            workingSession.pages[
              page.pageNumber
            ].attempts,
        },
      },
    };
  }

  return {
    ...workingSession,

    progress:
      calculateProgress(
        workingSession,
      ),
  };
}

export const CatalogueBatchAnalysisEngine = {
  createSession({
    documentId,
    fileName,
    pages,
  }: {
    documentId: string;
    fileName: string;
    pages: SupplierDocumentPage[];
  }): CatalogueAnalysisSession {
    const pageRecords =
      Object.fromEntries(
        pages.map((page) => [
          page.pageNumber,

          createPendingRecord(
            page.pageNumber,
          ),
        ]),
      );

    return {
      documentId,
      fileName,

      pages:
        pageRecords,

      productGroups: [],

      progress: {
        state: "idle",

        totalPages:
          pages.length,

        completedPages: 0,
        failedPages: 0,
        skippedPages: 0,

        currentPageNumber: null,

        startedAt: null,
        completedAt: null,

        error: null,
      },
    };
  },

  async runNextBatch({
    session,
    pages,
    maximumPages = 3,
  }: AnalyseBatchInput): Promise<CatalogueAnalysisSession> {
    const safeMaximumPages =
      Math.max(
        1,
        Math.min(
          3,
          Math.floor(maximumPages),
        ),
      );

    const nextPages =
      getNextPages({
        session,
        pages,
        maximumPages:
          safeMaximumPages,
      });

    return analysePages({
      session,
      pages:
        nextPages,
    });
  },

  async runSelectedPages({
    session,
    pages,
    pageNumbers,
  }: AnalyseSelectedPagesInput): Promise<CatalogueAnalysisSession> {
    const uniquePageNumbers =
      Array.from(
        new Set(
          pageNumbers.filter(
            Number.isInteger,
          ),
        ),
      );

    const selectedPages =
      getSelectedPages({
        pages,
        pageNumbers:
          uniquePageNumbers,
      });

    return analysePages({
      session,
      pages:
        selectedPages,
    });
  },
} as const;