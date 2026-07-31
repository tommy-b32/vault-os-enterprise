"use client";

import {
  useRef,
  useState,
} from "react";

import {
  PDFExtractionEngine,
} from "@/lib/supplier/PDFExtractionEngine";

import type {
  SupplierExtractionResult,
} from "@/lib/supplier/types";

type ExtractionState =
  | "idle"
  | "extracting"
  | "complete"
  | "failed";

type Props = {
  onFileSelected?: (file: File) => void;

  onExtractionComplete?: (
    result: SupplierExtractionResult,
    file: File,
  ) => void;
};

export function SupplierCatalogueDropzone({
  onFileSelected,
  onExtractionComplete,
}: Props) {
  const inputRef =
    useRef<HTMLInputElement | null>(null);

  const [isDragging, setIsDragging] =
    useState(false);

  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

  const [extractionState, setExtractionState] =
    useState<ExtractionState>("idle");

  const [extractionResult, setExtractionResult] =
    useState<SupplierExtractionResult | null>(
      null,
    );

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  async function handleFile(
    file: File | undefined,
  ) {
    if (!file) {
      return;
    }

    const isPdf =
      file.type === "application/pdf" ||
      file.name
        .toLowerCase()
        .endsWith(".pdf");

    if (!isPdf) {
      setExtractionState("failed");

      setErrorMessage(
        "Please select a valid PDF catalogue.",
      );

      return;
    }

    setSelectedFile(file);
    setExtractionState("extracting");
    setExtractionResult(null);
    setErrorMessage(null);

    /*
     * Preserve the existing callback so any parent component
     * already listening for file selection continues to work.
     */
    onFileSelected?.(file);

    try {
      const result =
        await PDFExtractionEngine.extract(
          file,
          {
            /*
             * This supplier catalogue is image-first, so page
             * previews are required for later visual analysis.
             */
            renderPageImages: true,

            /*
             * A moderate scale gives clear previews without
             * producing unnecessarily large canvas images.
             */
            pageImageScale: 1.2,

            /*
             * Extract the complete catalogue.
             */
            maximumPages: null,
          },
        );

      setExtractionResult(result);

      setExtractionState(
        result.successful
          ? "complete"
          : "failed",
      );

      if (!result.successful) {
        setErrorMessage(
          "Vault OS could not extract any pages from this PDF.",
        );

        return;
      }

      onExtractionComplete?.(
        result,
        file,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "An unknown PDF extraction error occurred.";

      setExtractionState("failed");
      setErrorMessage(message);
    }
  }

  function resetSelection() {
    setSelectedFile(null);
    setExtractionResult(null);
    setExtractionState("idle");
    setErrorMessage(null);

    if (inputRef.current) {
      inputRef.current.value = "";
    }

    inputRef.current?.click();
  }

  const isExtracting =
    extractionState === "extracting";

  const isComplete =
    extractionState === "complete" &&
    extractionResult !== null;

  const heading = isExtracting
    ? "Reading supplier catalogue"
    : isComplete
      ? "Catalogue extraction complete"
      : extractionState === "failed"
        ? "Catalogue extraction failed"
        : isDragging
          ? "Drop catalogue to begin"
          : selectedFile
            ? "Catalogue selected"
            : "Upload a supplier catalogue";

  const supportingText = isExtracting
    ? selectedFile
      ? `Vault OS is rendering and analysing the pages in ${selectedFile.name}. Large catalogues may take a moment.`
      : "Vault OS is preparing the supplier catalogue."
    : isComplete
      ? `${extractionResult.pages.length} of ${extractionResult.document.pageCount} pages were successfully extracted from ${extractionResult.document.fileName}.`
      : extractionState === "failed"
        ? errorMessage ??
          "Vault OS could not process this catalogue."
        : selectedFile
          ? `${selectedFile.name} is ready for extraction.`
          : "Drag a supplier PDF anywhere into this area, or browse your computer to select one.";

  return (
    <section
      aria-busy={isExtracting}
      className={[
        "supplier-catalogue-dropzone",
        isDragging ? "is-dragging" : "",
        selectedFile ? "has-file" : "",
        isExtracting
          ? "is-extracting"
          : "",
        isComplete
          ? "is-complete"
          : "",
        extractionState === "failed"
          ? "has-error"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onDragEnter={(event) => {
        event.preventDefault();

        if (!isExtracting) {
          setIsDragging(true);
        }
      }}
      onDragLeave={(event) => {
        event.preventDefault();

        if (
          event.currentTarget.contains(
            event.relatedTarget as Node | null,
          )
        ) {
          return;
        }

        setIsDragging(false);
      }}
      onDragOver={(event) => {
        event.preventDefault();

        if (!isExtracting) {
          event.dataTransfer.dropEffect =
            "copy";
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);

        if (isExtracting) {
          return;
        }

        void handleFile(
          event.dataTransfer.files[0],
        );
      }}
    >
      <input
        accept="application/pdf,.pdf"
        aria-label="Upload supplier catalogue PDF"
        disabled={isExtracting}
        hidden
        onChange={(event) => {
          void handleFile(
            event.target.files?.[0],
          );
        }}
        ref={inputRef}
        type="file"
      />

      <div className="supplier-catalogue-dropzone-icon">
        <span aria-hidden="true">
          {isExtracting
            ? "◌"
            : isComplete
              ? "✓"
              : extractionState === "failed"
                ? "!"
                : "⇧"}
        </span>
      </div>

      <div className="supplier-catalogue-dropzone-copy">
        <p className="vault-eyebrow">
          PDF Catalogue Import
        </p>

        <h2>{heading}</h2>

        <p>{supportingText}</p>
      </div>

      {isComplete ? (
        <div className="supplier-catalogue-extraction-summary">
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
            <span>Pages extracted</span>

            <strong>
              {extractionResult.pages.length}
            </strong>
          </article>

          <article>
            <span>Page previews</span>

            <strong>
              {extractionResult.pages.reduce(
                (total, page) =>
                  total +
                  page.images.length,
                0,
              )}
            </strong>
          </article>

          <article>
            <span>Extraction confidence</span>

            <strong>
              {extractionResult.confidence}%
            </strong>
          </article>
        </div>
      ) : null}

      {isComplete &&
      extractionResult.warnings.length > 0 ? (
        <div className="supplier-catalogue-extraction-notice">
          <strong>
            Image-first catalogue detected
          </strong>

          <p>
            This PDF contains little or no selectable text.
            Vault OS successfully rendered its pages and will
            use visual product detection in the next stage.
          </p>

          <span>
            {
              extractionResult.warnings
                .length
            }{" "}
            extraction{" "}
            {extractionResult.warnings
              .length === 1
              ? "notice"
              : "notices"}
          </span>
        </div>
      ) : null}

      {extractionState === "failed" ? (
        <div
          className="supplier-catalogue-extraction-error"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      <button
        className="supplier-catalogue-dropzone-button"
        disabled={isExtracting}
        onClick={() => {
          if (selectedFile) {
            resetSelection();
            return;
          }

          inputRef.current?.click();
        }}
        type="button"
      >
        {isExtracting
          ? "Extracting PDF..."
          : selectedFile
            ? "Choose Different PDF"
            : "Browse PDF"}
      </button>

      <div className="supplier-catalogue-dropzone-footer">
        <span>PDF only</span>
        <span>
          {isComplete
            ? `${extractionResult.pages.length} pages ready`
            : "Image-first extraction"}
        </span>
        <span>
          {isComplete
            ? "Ready for visual detection"
            : "Vault Brain mapping"}
        </span>
      </div>
    </section>
  );
}