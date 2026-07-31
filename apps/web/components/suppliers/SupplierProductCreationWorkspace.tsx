"use client";

import {
  useMemo,
  useState,
} from "react";

import type {
  SupplierCatalogueCardData,
} from "@/types/supplier-catalogue";

export type SupplierProductDraft = {
  id: string;
  supplierId: string;
  supplierName: string;
  catalogueId: string;
  catalogueName: string;
  brand: string;
  productName: string;
  productType: string;
  colour: string;
  supplierReference: string;
  packCost: number | null;
  packSize: number | null;
  currency: string;
  leadTimeDays: number | null;
  imageUrls: string[];
  sourcePageNumber: number | null;
  notes: string;
};

type Props = {
  card: SupplierCatalogueCardData;
  onCancel: () => void;
  onSave: (draft: SupplierProductDraft) => void;
};

function getInitialProductType(
  card: SupplierCatalogueCardData,
): string {
  const name =
    card.officialProductName?.toLowerCase() ?? "";

  if (name.includes("polo")) return "Polo";
  if (name.includes("hoodie")) return "Hoodie";
  if (name.includes("jacket")) return "Jacket";
  if (name.includes("gilet")) return "Gilet";
  if (name.includes("short")) return "Shorts";
  if (
    name.includes("trainer") ||
    name.includes("shoe")
  ) {
    return "Footwear";
  }

  return "T-Shirt";
}

function parseNullableNumber(
  value: string,
): number | null {
  const cleaned = value.trim();

  if (!cleaned) return null;

  const parsed = Number.parseFloat(cleaned);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

export function SupplierProductCreationWorkspace({
  card,
  onCancel,
  onSave,
}: Props) {
  const [brand, setBrand] =
    useState(card.brand ?? "");

  const [productName, setProductName] =
    useState(
      card.officialProductName ??
        card.internalReference ??
        "",
    );

  const [productType, setProductType] =
    useState(getInitialProductType(card));

  const [colour, setColour] =
    useState(card.colour ?? "");

  const [
    supplierReference,
    setSupplierReference,
  ] = useState(
    card.internalReference ?? "",
  );

  const [packCost, setPackCost] =
    useState(
      card.packCost?.toString() ?? "",
    );

  const [packSize, setPackSize] =
    useState(
      card.packSize?.toString() ?? "",
    );

  const [currency, setCurrency] =
    useState(card.currency || "GBP");

  const [leadTimeDays, setLeadTimeDays] =
    useState(
      card.leadTimeDays?.toString() ?? "",
    );

  const [notes, setNotes] =
    useState(card.notes ?? "");

  const images = useMemo(
    () => card.images,
    [card.images],
  );

  const canSave =
    productName.trim().length > 0 &&
    card.supplierName.trim().length > 0;

  function handleSave() {
    if (!canSave) return;

    onSave({
      id: card.id,
      supplierId: card.supplierId,
      supplierName: card.supplierName,
      catalogueId: card.catalogueId,
      catalogueName: card.catalogueName,
      brand: brand.trim(),
      productName: productName.trim(),
      productType: productType.trim(),
      colour: colour.trim(),
      supplierReference:
        supplierReference.trim(),
      packCost:
        parseNullableNumber(packCost),
      packSize:
        parseNullableNumber(packSize),
      currency:
        currency.trim() || "GBP",
      leadTimeDays:
        parseNullableNumber(
          leadTimeDays,
        ),
      imageUrls:
        images.map((image) => image.url),
      sourcePageNumber:
        card.pageNumber,
      notes: notes.trim(),
    });
  }

  return (
    <main className="supplier-product-creation-workspace">
      <header className="supplier-product-creation-header">
        <div>
          <p className="vault-eyebrow">
            Vault Brain Product Draft
          </p>

          <h1>
            Confirm new catalogue product
          </h1>

          <p>
            Vault Brain has pre-filled the product using the
            supplier catalogue. Review the details before
            saving it to the product master.
          </p>
        </div>

        <span>{card.supplierName}</span>
      </header>

      <div className="supplier-product-creation-layout">
        <section className="supplier-product-creation-images">
          <header>
            <div>
              <p className="vault-eyebrow">
                Supplier Images
              </p>

              <h2>
                Extracted catalogue evidence
              </h2>
            </div>

            <span>
              {images.length}{" "}
              {images.length === 1
                ? "image"
                : "images"}
            </span>
          </header>

          {images.length > 0 ? (
            <div className="supplier-product-creation-image-grid">
              {images.map((image) => (
                <article key={image.id}>
                  <img
                    alt={image.alt}
                    src={image.url}
                  />

                  <span>{image.role}</span>
                </article>
              ))}
            </div>
          ) : (
            <div className="supplier-product-creation-image-empty">
              No supplier images were extracted for this
              product.
            </div>
          )}

          <div className="supplier-product-creation-source">
            <span>Source catalogue</span>

            <strong>
              {card.catalogueName}
            </strong>

            <small>
              {card.pageNumber !== null
                ? `Starting on page ${card.pageNumber}`
                : "Page number unavailable"}
            </small>
          </div>
        </section>

        <section className="supplier-product-creation-form">
          <header>
            <p className="vault-eyebrow">
              Product Master
            </p>

            <h2>
              Review detected details
            </h2>
          </header>

          <div className="supplier-product-creation-grid">
            <label>
              <span>Brand</span>
              <input
                onChange={(event) =>
                  setBrand(event.target.value)
                }
                value={brand}
              />
            </label>

            <label className="supplier-product-creation-wide">
              <span>Product name</span>
              <input
                onChange={(event) =>
                  setProductName(
                    event.target.value,
                  )
                }
                value={productName}
              />
            </label>

            <label>
              <span>Product type</span>
              <select
                onChange={(event) =>
                  setProductType(
                    event.target.value,
                  )
                }
                value={productType}
              >
                <option>T-Shirt</option>
                <option>Polo</option>
                <option>Hoodie</option>
                <option>Sweatshirt</option>
                <option>Jacket</option>
                <option>Gilet</option>
                <option>Shorts</option>
                <option>Tracksuit</option>
                <option>Footwear</option>
                <option>Accessories</option>
              </select>
            </label>

            <label>
              <span>Colour</span>
              <input
                onChange={(event) =>
                  setColour(
                    event.target.value,
                  )
                }
                value={colour}
              />
            </label>

            <label className="supplier-product-creation-wide">
              <span>Supplier reference</span>
              <input
                onChange={(event) =>
                  setSupplierReference(
                    event.target.value,
                  )
                }
                value={supplierReference}
              />
            </label>

            <label>
              <span>Pack cost</span>
              <input
                inputMode="decimal"
                onChange={(event) =>
                  setPackCost(
                    event.target.value,
                  )
                }
                value={packCost}
              />
            </label>

            <label>
              <span>Currency</span>
              <select
                onChange={(event) =>
                  setCurrency(
                    event.target.value,
                  )
                }
                value={currency}
              >
                <option>GBP</option>
                <option>EUR</option>
                <option>USD</option>
              </select>
            </label>

            <label>
              <span>Pack size</span>
              <input
                inputMode="numeric"
                onChange={(event) =>
                  setPackSize(
                    event.target.value,
                  )
                }
                value={packSize}
              />
            </label>

            <label>
              <span>Lead time in days</span>
              <input
                inputMode="numeric"
                onChange={(event) =>
                  setLeadTimeDays(
                    event.target.value,
                  )
                }
                value={leadTimeDays}
              />
            </label>

            <label className="supplier-product-creation-wide">
              <span>Notes</span>
              <textarea
                onChange={(event) =>
                  setNotes(
                    event.target.value,
                  )
                }
                rows={5}
                value={notes}
              />
            </label>
          </div>

          <section className="supplier-product-creation-summary">
            <article>
              <span>Supplier</span>
              <strong>
                {card.supplierName}
              </strong>
            </article>

            <article>
              <span>Catalogue</span>
              <strong>
                {card.catalogueName}
              </strong>
            </article>

            <article>
              <span>Images</span>
              <strong>
                {images.length}
              </strong>
            </article>

            <article>
              <span>Status</span>
              <strong>Draft</strong>
            </article>
          </section>

          <footer className="supplier-product-creation-actions">
            <button
              className="brain-button brain-button-secondary"
              onClick={onCancel}
              type="button"
            >
              ← Return to Review
            </button>

            <button
              className="brain-button"
              disabled={!canSave}
              onClick={handleSave}
              type="button"
            >
              Save Product →
            </button>
          </footer>
        </section>
      </div>
    </main>
  );
}