"use client";

import type {
  PDFPageProxy,
} from "pdfjs-dist";

import type {
  SupplierDocumentPage,
  SupplierExtractedImage,
  SupplierExtractionResult,
} from "@/lib/supplier/types";

export type PDFExtractionOptions = {
  renderPageImages?: boolean;
  pageImageScale?: number;
  maximumPages?: number | null;
};

function createId(prefix: string): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function normaliseExtractedText(
  value: string,
): string {
  return value
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getTextFromItems(
  items: unknown[],
): string {
  const lines: string[] = [];

  for (const item of items) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("str" in item)
    ) {
      continue;
    }

    const textValue = Reflect.get(
      item,
      "str",
    );

    if (typeof textValue !== "string") {
      continue;
    }

    const cleanedText =
      textValue.trim();

    if (cleanedText) {
      lines.push(cleanedText);
    }
  }

  return normaliseExtractedText(
    lines.join(" "),
  );
}

async function renderPageImage({
  page,
  pageNumber,
  scale,
}: {
  page: PDFPageProxy;

  pageNumber: number;
  scale: number;
}): Promise<SupplierExtractedImage | null> {
  if (
    typeof document === "undefined"
  ) {
    return null;
  }

  const viewport =
    page.getViewport({
      scale,
    });

  const canvas =
    document.createElement("canvas");

  canvas.width =
    Math.ceil(viewport.width);

  canvas.height =
    Math.ceil(viewport.height);

  const context =
    canvas.getContext("2d", {
      alpha: false,
    });

  if (!context) {
    return null;
  }

  await page.render({
    canvas: null,
    canvasContext: context,
    viewport,
  }).promise;

  return {
    id: createId(
      `supplier-page-${pageNumber}`,
    ),

    pageNumber,

    width: canvas.width,
    height: canvas.height,

    mimeType: "image/png",

    /*
     * This first milestone stores a rendered preview of
     * the complete PDF page. Individual embedded product
     * images will be detected in a later extraction stage.
     */
    dataUrl:
      canvas.toDataURL(
        "image/png",
        0.92,
      ),
  };
}

function calculateConfidence({
  extractedPages,
  totalPages,
}: {
  extractedPages: SupplierDocumentPage[];
  totalPages: number;
}): number {
  if (
    totalPages === 0 ||
    extractedPages.length === 0
  ) {
    return 0;
  }

  const pagesWithText =
    extractedPages.filter(
      (page) =>
        page.text.trim().length > 0,
    ).length;

  const textCoverage =
    pagesWithText /
    extractedPages.length;

  const pageCoverage =
    extractedPages.length /
    totalPages;

  return Math.round(
    Math.min(
      100,
      textCoverage * 75 +
        pageCoverage * 25,
    ),
  );
}

export const PDFExtractionEngine = {
  async extract(
    file: File,
    options: PDFExtractionOptions = {},
  ): Promise<SupplierExtractionResult> {
    if (
      typeof window === "undefined"
    ) {
      throw new Error(
        "PDF extraction must run in the browser.",
      );
    }

    if (!(file instanceof File)) {
      throw new Error(
        "A valid PDF file is required.",
      );
    }

    const isPdf =
      file.type === "application/pdf" ||
      file.name
        .toLowerCase()
        .endsWith(".pdf");

    if (!isPdf) {
      throw new Error(
        "The selected file is not a PDF.",
      );
    }

    const {
      renderPageImages = true,
      pageImageScale = 1.35,
      maximumPages = null,
    } = options;

    const warnings: string[] = [];

    /*
     * Dynamic import prevents PDF.js browser APIs from
     * being evaluated during Next.js server rendering.
     */
    const pdfjs =
      await import("pdfjs-dist");

    /*
     * Bundle the PDF.js worker through Next.js rather
     * than relying on an external CDN.
     */
    pdfjs.GlobalWorkerOptions.workerSrc =
      new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();

    const fileBuffer =
      await file.arrayBuffer();

    const loadingTask =
      pdfjs.getDocument({
        data: new Uint8Array(
          fileBuffer,
        ),

        /*
         * Standard browser fonts are sufficient for the
         * first extraction milestone.
         */
        useSystemFonts: true,
      });

    const pdfDocument =
      await loadingTask.promise;

    const totalPages =
      pdfDocument.numPages;

    const pagesToExtract =
      maximumPages === null
        ? totalPages
        : Math.min(
            totalPages,
            Math.max(
              1,
              maximumPages,
            ),
          );

    if (
      pagesToExtract < totalPages
    ) {
      warnings.push(
        `Only ${pagesToExtract} of ${totalPages} pages were extracted because a page limit was applied.`,
      );
    }

    const pages: SupplierDocumentPage[] =
      [];

    for (
      let pageNumber = 1;
      pageNumber <= pagesToExtract;
      pageNumber += 1
    ) {
      try {
        const page =
          await pdfDocument.getPage(
            pageNumber,
          );

        const textContent =
          await page.getTextContent();

        const text =
          getTextFromItems(
            textContent.items,
          );

        const images:
          SupplierExtractedImage[] = [];

        if (renderPageImages) {
          try {
            const pageImage =
              await renderPageImage({
                page,
                pageNumber,
                scale:
                  pageImageScale,
              });

            if (pageImage) {
              images.push(pageImage);
            }
          } catch (imageError) {
            const message =
              imageError instanceof Error
                ? imageError.message
                : "Unknown page rendering error.";

            warnings.push(
              `Page ${pageNumber} text was extracted, but its preview image could not be rendered: ${message}`,
            );
          }
        }

        if (!text) {
          warnings.push(
            `Page ${pageNumber} contained no extractable text. It may be scanned or image-based.`,
          );
        }

        pages.push({
          pageNumber,
          text,
          images,
        });

        page.cleanup();
      } catch (pageError) {
        const message =
          pageError instanceof Error
            ? pageError.message
            : "Unknown extraction error.";

        warnings.push(
          `Page ${pageNumber} could not be extracted: ${message}`,
        );
      }
    }

    const confidence =
      calculateConfidence({
        extractedPages: pages,
        totalPages:
          pagesToExtract,
      });

    if (
      pages.length === 0
    ) {
      warnings.push(
        "No PDF pages were successfully extracted.",
      );
    }

    return {
      document: {
        id: createId(
          "supplier-document",
        ),

        fileName: file.name,
        pageCount: totalPages,
        uploadedAt:
          new Date().toISOString(),
      },

      pages,

      successful:
        pages.length > 0,

      confidence,

      warnings,
    };
  },
} as const;
