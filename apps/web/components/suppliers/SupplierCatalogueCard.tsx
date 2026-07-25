"use client";

import { useMemo, useState } from "react";

import { BrainPill } from "@/components/ui/BrainPill";

import type {
  SupplierCatalogueCardData,
  SupplierCatalogueImage,
} from "@/types/supplier-catalogue";

type Props = {
  card: SupplierCatalogueCardData;
  onOpen?: (
    card: SupplierCatalogueCardData,
  ) => void;
  onLinkProduct?: (
    card: SupplierCatalogueCardData,
  ) => void;
  onAddToOrder?: (
    card: SupplierCatalogueCardData,
  ) => void;
};

function formatCurrency(
  value: number | null,
  currency: string,
): string {
  if (value === null) {
    return "Not set";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function getStatusTone(
  status: SupplierCatalogueCardData["status"],
):
  | "default"
  | "success"
  | "warning"
  | "danger" {
  switch (status) {
    case "linked":
      return "success";

    case "new":
    case "review":
      return "warning";

    case "archived":
      return "danger";

    case "unlinked":
    default:
      return "default";
  }
}

function getStatusLabel(
  status: SupplierCatalogueCardData["status"],
): string {
  switch (status) {
    case "linked":
      return "Linked";

    case "new":
      return "New";

    case "review":
      return "Review";

    case "archived":
      return "Archived";

    case "unlinked":
    default:
      return "Not linked";
  }
}

function getPrimaryImage(
  images: SupplierCatalogueImage[],
): SupplierCatalogueImage | null {
  const priority: SupplierCatalogueImage["role"][] = [
    "supplier",
    "official",
    "detail",
    "back",
    "label",
    "other",
  ];

  for (const role of priority) {
    const match = images.find(
      (image) => image.role === role,
    );

    if (match) {
      return match;
    }
  }

  return images[0] ?? null;
}

function getDisplayTitle(
  card: SupplierCatalogueCardData,
): string {
  return (
    card.officialProductName ??
    card.internalReference ??
    `${card.brand ?? "Supplier"} catalogue item`
  );
}

export function SupplierCatalogueCard({
  card,
  onOpen,
  onLinkProduct,
  onAddToOrder,
}: Props) {
  const primaryImage = useMemo(
    () => getPrimaryImage(card.images),
    [card.images],
  );

  const [activeImageId, setActiveImageId] =
    useState<string | null>(
      primaryImage?.id ?? null,
    );

  const activeImage =
    card.images.find(
      (image) => image.id === activeImageId,
    ) ??
    primaryImage;

  const unitCost =
    card.packCost !== null &&
    card.packSize !== null &&
    card.packSize > 0
      ? card.packCost / card.packSize
      : null;

  const title = getDisplayTitle(card);

  return (
    <article
      className={[
        "supplier-catalogue-item-card",
        card.isPreferredSource
          ? "is-preferred"
          : "",
        `status-${card.status}`,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="supplier-catalogue-item-media">
        {activeImage ? (
          <img
            alt={activeImage.alt}
            loading="lazy"
            src={activeImage.url}
          />
        ) : (
          <div className="supplier-catalogue-item-placeholder">
            <span>V</span>

            <p>No catalogue image available</p>
          </div>
        )}

        <div className="supplier-catalogue-item-overlay">
          <BrainPill
            tone={getStatusTone(card.status)}
          >
            {getStatusLabel(card.status)}
          </BrainPill>

          {card.isPreferredSource ? (
            <BrainPill tone="success">
              Preferred
            </BrainPill>
          ) : null}
        </div>

        {card.pageNumber !== null ? (
          <span className="supplier-catalogue-page-number">
            Page {card.pageNumber}
          </span>
        ) : null}
      </div>

      {card.images.length > 1 ? (
        <div className="supplier-catalogue-thumbnails">
          {card.images
            .slice(0, 5)
            .map((image) => {
              const selected =
                image.id === activeImage?.id;

              return (
                <button
                  aria-label={`View ${image.alt}`}
                  className={
                    selected
                      ? "is-active"
                      : ""
                  }
                  key={image.id}
                  onClick={() =>
                    setActiveImageId(image.id)
                  }
                  type="button"
                >
                  <img
                    alt=""
                    loading="lazy"
                    src={image.url}
                  />
                </button>
              );
            })}

          {card.images.length > 5 ? (
            <span>
              +{card.images.length - 5}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="supplier-catalogue-item-content">
        <header className="supplier-catalogue-item-heading">
          <div>
            <span>
              {card.brand ??
                card.supplierName}
            </span>

            <h3>{title}</h3>

            <p>
              {card.colour ??
                "Colour not recorded"}
            </p>
          </div>

          <small>
            {card.supplierName}
          </small>
        </header>

        <div className="supplier-catalogue-item-metrics">
          <div>
            <span>Pack cost</span>

            <strong>
              {formatCurrency(
                card.packCost,
                card.currency,
              )}
            </strong>
          </div>

          <div>
            <span>Pack size</span>

            <strong>
              {card.packSize ??
                "Not set"}
            </strong>
          </div>

          <div>
            <span>Unit cost</span>

            <strong>
              {formatCurrency(
                unitCost,
                card.currency,
              )}
            </strong>
          </div>

          <div>
            <span>Lead time</span>

            <strong>
              {card.leadTimeDays !== null
                ? `${card.leadTimeDays} days`
                : "Not set"}
            </strong>
          </div>
        </div>

        <div className="supplier-catalogue-link-state">
          <span>Fabric Vault product</span>

          <strong>
            {card.linkedProductName ??
              "Not linked"}
          </strong>

          {card.linkedProductId ? (
            <small>
              Supplier source mapping active
            </small>
          ) : (
            <small>
              Link this catalogue card before
              using it in purchasing decisions
            </small>
          )}
        </div>

        {card.notes ? (
          <p className="supplier-catalogue-item-notes">
            {card.notes}
          </p>
        ) : null}

        <footer className="supplier-catalogue-item-actions">
          <button
            onClick={() => onOpen?.(card)}
            type="button"
          >
            Open Card
          </button>

          {card.linkedProductId ? (
            <button
              className="is-primary"
              onClick={() =>
                onAddToOrder?.(card)
              }
              type="button"
            >
              Add to Order
            </button>
          ) : (
            <button
              className="is-primary"
              onClick={() =>
                onLinkProduct?.(card)
              }
              type="button"
            >
              Link Product
            </button>
          )}
        </footer>
      </div>
    </article>
  );
}