"use client";

import {
  useRef,
  useState,
} from "react";

type Props = {
  onFileSelected?: (file: File) => void;
};

export function SupplierCatalogueDropzone({
  onFileSelected,
}: Props) {
  const inputRef =
    useRef<HTMLInputElement | null>(null);

  const [isDragging, setIsDragging] =
    useState(false);

  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

  function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      return;
    }

    setSelectedFile(file);
    onFileSelected?.(file);
  }

  return (
    <section
      className={[
        "supplier-catalogue-dropzone",
        isDragging ? "is-dragging" : "",
        selectedFile ? "has-file" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onDragEnter={(event) => {
        event.preventDefault();
        setIsDragging(true);
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
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);

        handleFile(
          event.dataTransfer.files[0],
        );
      }}
    >
      <input
        accept="application/pdf,.pdf"
        aria-label="Upload supplier catalogue PDF"
        hidden
        onChange={(event) =>
          handleFile(
            event.target.files?.[0],
          )
        }
        ref={inputRef}
        type="file"
      />

      <div className="supplier-catalogue-dropzone-icon">
        <span aria-hidden="true">⇧</span>
      </div>

      <div className="supplier-catalogue-dropzone-copy">
        <p className="vault-eyebrow">
          PDF Catalogue Import
        </p>

        <h2>
          {isDragging
            ? "Drop catalogue to begin"
            : selectedFile
              ? "Catalogue selected"
              : "Upload a supplier catalogue"}
        </h2>

        <p>
          {selectedFile
            ? `${selectedFile.name} is ready for the future extraction pipeline.`
            : "Drag a supplier PDF anywhere into this area, or browse your computer to select one."}
        </p>
      </div>

      <button
        className="supplier-catalogue-dropzone-button"
        onClick={() =>
          inputRef.current?.click()
        }
        type="button"
      >
        {selectedFile
          ? "Choose Different PDF"
          : "Browse PDF"}
      </button>

      <div className="supplier-catalogue-dropzone-footer">
        <span>PDF only</span>
        <span>Image-first extraction</span>
        <span>Vault Brain mapping</span>
      </div>
    </section>
  );
}