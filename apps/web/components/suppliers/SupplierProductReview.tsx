"use client";

import { useEffect } from "react";

import { BrainPill } from "@/components/ui/BrainPill";

import type {
  CatalogueMatchingResult,
} from "@/lib/brain/CatalogueMatchingEngine";

import type {
  SupplierCatalogueCardData,
} from "@/types/supplier-catalogue";

type Props = {
  card: SupplierCatalogueCardData;
  match: CatalogueMatchingResult;

  currentIndex: number;
  totalItems: number;

  onAccept?: () => void;
  onSkip?: () => void;
  onCreateProduct?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
};

function getPrimaryImage(
  card: SupplierCatalogueCardData,
): SupplierCatalogueCardData["images"][number] | null {
  const roles = [
    "supplier",
    "official",
    "detail",
    "back",
    "label",
    "other",
  ] as const;

  for (const role of roles) {
    const image = card.images.find(
      (candidate) =>
        candidate.role === role,
    );

    if (image) {
      return image;
    }
  }

  return card.images[0] ?? null;
}

function getConfidenceTone(
  confidence: number,
):
  | "success"
  | "warning"
  | "danger" {
  if (confidence >= 80) {
    return "success";
  }

  if (confidence >= 50) {
    return "warning";
  }

  return "danger";
}

export function SupplierProductReview({
  card,
  match,
  currentIndex,
  totalItems,
  onAccept,
  onSkip,
  onCreateProduct,
  onPrevious,
  onNext,
}: Props) {
  const image = getPrimaryImage(card);
  const bestMatch = match.bestMatch;

  useEffect(() => {
    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      const target =
        event.target as HTMLElement | null;

      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (isTyping) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case "a":
          if (bestMatch) {
            onAccept?.();
          }
          break;

        case "s":
          onSkip?.();
          break;

        case "n":
          onCreateProduct?.();
          break;

        case "arrowleft":
          onPrevious?.();
          break;

        case "arrowright":
          onNext?.();
          break;
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [
    bestMatch,
    onAccept,
    onCreateProduct,
    onNext,
    onPrevious,
    onSkip,
  ]);

  return (
    <section className="supplier-product-review">
      <header className="supplier-product-review-header">
        <div>
          <p className="vault-eyebrow">
            Supplier Product Review
          </p>

          <h2>
            Review detected catalogue item
          </h2>

          <p>
            Accept Vault Brain&apos;s suggestion,
            link another product or create a new
            catalogue product.
          </p>
        </div>

        <div className="supplier-product-review-progress">
          <span>
            Item {currentIndex + 1}
          </span>

          <strong>
            {totalItems}
          </strong>
        </div>
      </header>

      <div className="supplier-product-review-layout">
        <article className="supplier-product-review-visual">
          <div className="supplier-product-review-image">
            {image ? (
              <img
                alt={image.alt}
                src={image.url}
              />
            ) : (
              <div className="supplier-product-review-placeholder">
                <span>V</span>

                <p>
                  Supplier image will appear here
                  after PDF extraction.
                </p>
              </div>
            )}

            <div className="supplier-product-review-badges">
              <BrainPill tone="default">
                {card.supplierName}
              </BrainPill>

              {card.pageNumber !== null ? (
                <BrainPill tone="default">
                  Page {card.pageNumber}
                </BrainPill>
              ) : null}

              {card.status === "new" ? (
                <BrainPill tone="warning">
                  New item
                </BrainPill>
              ) : null}
            </div>
          </div>

          <div className="supplier-product-review-item-copy">
            <span>
              {card.brand ??
                "Supplier catalogue item"}
            </span>

            <h3>
              {card.officialProductName ??
                card.internalReference ??
                "Unnamed supplier item"}
            </h3>

            <p>
              {card.colour ??
                "Colour not recorded"}
            </p>
          </div>
        </article>

        <article className="supplier-product-review-match">
          <header>
            <div>
              <p className="vault-eyebrow">
                Vault Brain Suggests
              </p>

              <h3>
                {bestMatch
                  ? bestMatch.product
                      .product_name
                  : "No suitable match found"}
              </h3>
            </div>

            {bestMatch ? (
              <BrainPill
                tone={getConfidenceTone(
                  bestMatch.confidence,
                )}
              >
                {bestMatch.confidence}% match
              </BrainPill>
            ) : (
              <BrainPill tone="danger">
                Manual review
              </BrainPill>
            )}
          </header>

          {bestMatch ? (
            <>
              <div className="supplier-product-review-signals">
                {bestMatch.signals.map(
                  (signal) => (
                    <div
                      key={`${signal.reason}-${signal.label}`}
                    >
                      <span aria-hidden="true">
                        ✓
                      </span>

                      <div>
                        <strong>
                          {signal.label}
                        </strong>

                        <small>
                          +{signal.score}
                        </small>
                      </div>
                    </div>
                  ),
                )}
              </div>

              <div className="supplier-product-review-summary">
                <span>
                  Suggested Fabric Vault product
                </span>

                <strong>
                  {
                    bestMatch.product
                      .product_name
                  }
                </strong>

                <small>
                  Vault Brain recommends accepting
                  this match based on the strongest
                  available catalogue signals.
                </small>
              </div>
            </>
          ) : (
            <div className="supplier-product-review-empty">
              <h4>
                Create or link manually
              </h4>

              <p>
                Vault Brain could not identify a
                suitable existing Fabric Vault
                product for this supplier item.
              </p>
            </div>
          )}

          {match.alternatives.length > 0 ? (
            <div className="supplier-product-review-alternatives">
              <span>
                Alternative matches
              </span>

              {match.alternatives.map(
                (alternative) => (
                  <button
                    key={
                      alternative.product
                        .product_id
                    }
                    type="button"
                  >
                    <strong>
                      {
                        alternative.product
                          .product_name
                      }
                    </strong>

                    <small>
                      {alternative.confidence}%
                    </small>
                  </button>
                ),
              )}
            </div>
          ) : null}
        </article>
      </div>

      <footer className="supplier-product-review-actions">
        <button
          className="review-action review-action-ignore"
          onClick={onSkip}
          type="button"
        >
          <span>←</span>

          <div>
            <strong>Ignore</strong>
            <small>S</small>
          </div>
        </button>

        <button
          className="review-action review-action-link"
          disabled={!bestMatch}
          onClick={onAccept}
          type="button"
        >
          <span>✓</span>

          <div>
            <strong>Accept Match</strong>
            <small>A</small>
          </div>
        </button>

        <button
          className="review-action review-action-new"
          onClick={onCreateProduct}
          type="button"
        >
          <span>＋</span>

          <div>
            <strong>Create Product</strong>
            <small>N</small>
          </div>
        </button>
      </footer>

      <div className="supplier-product-review-navigation">
        <button
          disabled={currentIndex <= 0}
          onClick={onPrevious}
          type="button"
        >
          ← Previous
        </button>

        <span>
          Use A, S, N or the arrow keys
        </span>

        <button
          disabled={
            currentIndex >= totalItems - 1
          }
          onClick={onNext}
          type="button"
        >
          Next →
        </button>
      </div>
    </section>
  );
}