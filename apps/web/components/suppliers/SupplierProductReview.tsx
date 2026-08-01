"use client";

import "./SupplierProductReview.css";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "framer-motion";

import {
  CommercialIntelligenceCard,
} from "@/components/brain/CommercialIntelligenceCard";

import {
  AlternativeMatchesCard,
} from "@/components/suppliers/AlternativeMatchesCard";

import {
  MatchSummaryCard,
  VisualComparisonCard,
} from "@/components/suppliers/MatchSummaryCard";

import {
  ManualProductSearch,
} from "@/components/suppliers/ManualProductSearch";

import {
  BrainPill,
} from "@/components/ui/BrainPill";

import type {
  CatalogueMatchingResult,
  CatalogueProductMatch,
} from "@/lib/brain/CatalogueMatchingEngine";

import type {
  SupplierCatalogueCardData,
} from "@/types/supplier-catalogue";

import type {
  CatalogueProduct,
} from "@/types/catalogue";

type Props = {
  card: SupplierCatalogueCardData;
  match: CatalogueMatchingResult;
  products: CatalogueProduct[];

  currentIndex: number;
  totalItems: number;

  onAccept?: (
    selectedMatch: CatalogueProductMatch,
  ) => void;
  onSkip?: () => void;
  onCreateProduct?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
};

function getImageRoleLabel(
  role: SupplierCatalogueCardData["images"][number]["role"],
): string {
  switch (role) {
    case "official":
      return "Official";

    case "supplier":
      return "Supplier";

    case "detail":
      return "Detail";

    case "label":
      return "Label";

    case "back":
      return "Back";

    default:
      return "Other";
  }
}

export function SupplierProductReview({
  card,
  match,
  products,
  currentIndex,
  totalItems,
  onAccept,
  onSkip,
  onCreateProduct,
  onPrevious,
  onNext,
}: Props) {
  const [
    activeImageIndex,
    setActiveImageIndex,
  ] = useState(0);

  const [
    isZoomed,
    setIsZoomed,
  ] = useState(false);

  const [
    isSwiping,
    setIsSwiping,
  ] = useState(false);

  const swipeX =
    useMotionValue(0);

  const swipeY =
    useMotionValue(0);

  const cardRotation =
    useTransform(
      swipeX,
      [-260, 0, 260],
      [-10, 0, 10],
    );

  const linkOpacity =
    useTransform(
      swipeX,
      [30, 150],
      [0, 1],
    );

  const ignoreOpacity =
    useTransform(
      swipeX,
      [-150, -30],
      [1, 0],
    );

  const createOpacity =
    useTransform(
      swipeY,
      [-150, -30],
      [1, 0],
    );

  const [
    selectedMatch,
    setSelectedMatch,
  ] = useState(
    match.bestMatch,
  );

  const [
    isManualSearchOpen,
    setIsManualSearchOpen,
  ] = useState(false);

  useEffect(() => {
    setSelectedMatch(
      match.bestMatch,
    );
  }, [match]);

  useEffect(() => {
    setIsManualSearchOpen(false);
  }, [card.id]);

  const images =
    useMemo(
      () =>
        [...card.images].sort(
          (left, right) => {
            const priority = [
              "supplier",
              "official",
              "detail",
              "back",
              "label",
              "other",
            ];

            return (
              priority.indexOf(left.role) -
              priority.indexOf(right.role)
            );
          },
        ),
      [card.images],
    );

  const activeImage =
    images[activeImageIndex] ??
    null;

  const unitCost =
    card.packCost !== null &&
    card.packSize !== null &&
    card.packSize > 0
      ? card.packCost /
        card.packSize
      : null;

  useEffect(() => {
    setActiveImageIndex(0);
    setIsZoomed(false);
    setIsSwiping(false);
    swipeX.set(0);
    swipeY.set(0);
  }, [
    card.id,
    swipeX,
    swipeY,
  ]);

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

      switch (
        event.key.toLowerCase()
      ) {
        case "a":
          if (selectedMatch) {
            onAccept?.(
              selectedMatch,
            );
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

        case "escape":
          setIsZoomed(false);
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
    selectedMatch,
    onAccept,
    onCreateProduct,
    onNext,
    onPrevious,
    onSkip,
  ]);

  async function handleSwipeEnd() {
    if (isSwiping) {
      return;
    }

    const horizontal =
      swipeX.get();

    const vertical =
      swipeY.get();

    const absHorizontal =
      Math.abs(horizontal);

    if (
      vertical < -120 &&
      absHorizontal < 170
    ) {
      setIsSwiping(true);

      await animate(
        swipeY,
        -window.innerHeight,
        {
          duration: 0.24,
          ease: "easeIn",
        },
      );

      onCreateProduct?.();
      return;
    }

    if (
      horizontal > 140 &&
      selectedMatch
    ) {
      setIsSwiping(true);

      await animate(
        swipeX,
        window.innerWidth,
        {
          duration: 0.24,
          ease: "easeIn",
        },
      );

      onAccept?.(
        selectedMatch,
      );

      return;
    }

    if (horizontal < -140) {
      setIsSwiping(true);

      await animate(
        swipeX,
        -window.innerWidth,
        {
          duration: 0.24,
          ease: "easeIn",
        },
      );

      onSkip?.();
      return;
    }

    await Promise.all([
      animate(
        swipeX,
        0,
        {
          type: "spring",
          stiffness: 420,
          damping: 32,
        },
      ),

      animate(
        swipeY,
        0,
        {
          type: "spring",
          stiffness: 420,
          damping: 32,
        },
      ),
    ]);
  }

  return (
    <>
      <motion.div
        className="supplier-product-review-swipe-shell supplier-product-review-v2-shell"
        drag
        dragConstraints={{
          bottom: 0,
          left: 0,
          right: 0,
          top: 0,
        }}
        dragElastic={0.72}
        dragMomentum={false}
        onDragEnd={() => {
          void handleSwipeEnd();
        }}
        style={{
          rotate: cardRotation,
          x: swipeX,
          y: swipeY,
        }}
      >
        <motion.div
          className="supplier-product-review-swipe-label supplier-product-review-swipe-label-link"
          style={{
            opacity: linkOpacity,
          }}
        >
          ✓ Link Product
        </motion.div>

        <motion.div
          className="supplier-product-review-swipe-label supplier-product-review-swipe-label-ignore"
          style={{
            opacity: ignoreOpacity,
          }}
        >
          Ignore
        </motion.div>

        <motion.div
          className="supplier-product-review-swipe-label supplier-product-review-swipe-label-create"
          style={{
            opacity: createOpacity,
          }}
        >
          ＋ Create Product
        </motion.div>

        <section className="supplier-product-review-v2 supplier-product-review-workstation">
          <header className="supplier-product-review-v2-header">
            <div>
              <p className="vault-eyebrow">
                Vault Brain Review
              </p>

              <h2>
                {card.officialProductName ??
                  card.internalReference ??
                  "Unnamed supplier item"}
              </h2>

              <p>
                {card.brand ??
                  "Supplier catalogue item"}{" "}
                ·{" "}
                {card.colour ??
                  "Colour not recorded"}
              </p>
            </div>

            <div className="supplier-product-review-v2-progress">
              <span>
                Item {currentIndex + 1}
              </span>

              <strong>
                {totalItems}
              </strong>
            </div>
          </header>

          <div className="supplier-product-review-workstation-top">
            <section className="supplier-product-review-v2-visual supplier-product-review-workstation-visual">
              <div className="supplier-product-review-v2-image">
                {activeImage ? (
                  <>
                    <img
                      alt={activeImage.alt}
                      src={activeImage.url}
                    />

                    <button
                      className="supplier-product-review-v2-zoom"
                      onClick={() =>
                        setIsZoomed(true)
                      }
                      type="button"
                    >
                      Zoom
                    </button>
                  </>
                ) : (
                  <div className="supplier-product-review-placeholder">
                    <span>V</span>

                    <p>
                      No supplier image is available for this
                      catalogue item.
                    </p>
                  </div>
                )}

                <div className="supplier-product-review-v2-badges">
                  <BrainPill tone="default">
                    {card.supplierName}
                  </BrainPill>

                  {card.pageNumber !== null ? (
                    <BrainPill tone="default">
                      Page {card.pageNumber}
                    </BrainPill>
                  ) : null}

                  {activeImage ? (
                    <BrainPill tone="default">
                      {getImageRoleLabel(
                        activeImage.role,
                      )}
                    </BrainPill>
                  ) : null}
                </div>
              </div>

              {images.length > 1 ? (
                <div className="supplier-product-review-v2-thumbnails">
                  {images.map(
                    (
                      image,
                      index,
                    ) => (
                      <button
                        aria-label={`Show ${getImageRoleLabel(
                          image.role,
                        )} image`}
                        aria-pressed={
                          activeImageIndex ===
                          index
                        }
                        className={
                          activeImageIndex ===
                          index
                            ? "is-active"
                            : ""
                        }
                        key={image.id}
                        onClick={() =>
                          setActiveImageIndex(
                            index,
                          )
                        }
                        type="button"
                      >
                        <img
                          alt=""
                          src={image.url}
                        />

                        <span>
                          {getImageRoleLabel(
                            image.role,
                          )}
                        </span>
                      </button>
                    ),
                  )}
                </div>
              ) : null}
            </section>

            <section className="supplier-product-review-workstation-summary">
              <MatchSummaryCard
                actions={
                  <div className="supplier-product-review-v3-actions">
                    <button
                      className="review-action review-action-ignore"
                      onClick={onSkip}
                      type="button"
                    >
                      <span>←</span>

                      <div>
                        <strong>
                          Ignore
                        </strong>

                        <small>
                          S
                        </small>
                      </div>
                    </button>

                    <button
                      className="review-action review-action-link"
                      disabled={!selectedMatch}
                      onClick={() => {
                        if (selectedMatch) {
                          onAccept?.(
                            selectedMatch,
                          );
                        }
                      }}
                      type="button"
                    >
                      <span>✓</span>

                      <div>
                        <strong>
                          Link Product
                        </strong>

                        <small>
                          A
                        </small>
                      </div>
                    </button>

                    <button
                      className="review-action review-action-new"
                      onClick={onCreateProduct}
                      type="button"
                    >
                      <span>＋</span>

                      <div>
                        <strong>
                          Create Product
                        </strong>

                        <small>
                          N
                        </small>
                      </div>
                    </button>
                  </div>
                }
                bestMatch={selectedMatch}
              />
            </section>
          </div>

          <section className="supplier-product-review-workstation-alternatives">
            <AlternativeMatchesCard
              alternatives={
                match.alternatives
              }
              selectedProductId={
                selectedMatch?.product.product_id
              }
              onSelect={(alternative) => {
                setSelectedMatch(
                  alternative,
                );
              }}
            />
          </section>

          {selectedMatch ? (
            <section className="supplier-product-review-workstation-commercial">
              <CommercialIntelligenceCard
                onManualReview={() =>
                  setIsManualSearchOpen(true)
                }
                product={selectedMatch.product}
                supplierCard={card}
              />
            </section>
          ) : null}

          <section className="supplier-product-review-workstation-comparison">
            <VisualComparisonCard
              bestMatch={selectedMatch}
              card={card}
            />
          </section>

          <section className="supplier-product-review-workstation-lower">
            <div className="supplier-product-review-v2-commercial">
              <article>
                <span>
                  Supplier
                </span>

                <strong>
                  {card.supplierName}
                </strong>
              </article>

              <article>
                <span>
                  Pack Cost
                </span>

                <strong>
                  {card.packCost !== null
                    ? `${card.currency} ${card.packCost.toFixed(2)}`
                    : "Not entered"}
                </strong>
              </article>

              <article>
                <span>
                  Pack Size
                </span>

                <strong>
                  {card.packSize ??
                    "Not entered"}
                </strong>
              </article>

              <article>
                <span>
                  Unit Cost
                </span>

                <strong>
                  {unitCost !== null
                    ? `${card.currency} ${unitCost.toFixed(2)}`
                    : "Not available"}
                </strong>
              </article>

              <article>
                <span>
                  Lead Time
                </span>

                <strong>
                  {card.leadTimeDays !== null
                    ? `${card.leadTimeDays} days`
                    : "Not entered"}
                </strong>
              </article>

              <article>
                <span>
                  Reference
                </span>

                <strong>
                  {card.internalReference ??
                    "Not recorded"}
                </strong>
              </article>
            </div>

          </section>

          <div className="supplier-product-review-v2-navigation">
            <button
              disabled={currentIndex <= 0}
              onClick={onPrevious}
              type="button"
            >
              ← Previous
            </button>

            <span>
              Item {currentIndex + 1} of {totalItems}
            </span>

            <button
              disabled={
                currentIndex >=
                totalItems - 1
              }
              onClick={onNext}
              type="button"
            >
              Next →
            </button>
          </div>
        </section>
      </motion.div>

      {isManualSearchOpen ? (
        <ManualProductSearch
          onClose={() =>
            setIsManualSearchOpen(false)
          }
          onSelect={(product) => {
            const manualMatch:
              CatalogueProductMatch = {
                product,

                confidence: 100,

                signals: [
                  {
                    reason:
                      "manual_hint",

                    label:
                      "Manually selected from full catalogue",

                    score: 100,
                  },
                ],
              };

            setSelectedMatch(
              manualMatch,
            );

            setIsManualSearchOpen(
              false,
            );
          }}
          products={products}
          selectedProductId={
            selectedMatch?.product.product_id
          }
        />
      ) : null}

      {isZoomed &&
      activeImage ? (
        <div
          aria-label="Supplier product image"
          aria-modal="true"
          className="supplier-product-review-lightbox"
          onClick={() =>
            setIsZoomed(false)
          }
          role="dialog"
        >
          <button
            aria-label="Close image"
            onClick={() =>
              setIsZoomed(false)
            }
            type="button"
          >
            ×
          </button>

          <img
            alt={activeImage.alt}
            onClick={(event) =>
              event.stopPropagation()
            }
            src={activeImage.url}
          />
        </div>
      ) : null}
    </>
  );
}