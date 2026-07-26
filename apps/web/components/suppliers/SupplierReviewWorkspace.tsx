"use client";

import { useMemo, useState } from "react";

import {
  BuyingBasket,
  type BuyingBasketItem,
} from "@/components/suppliers/BuyingBasket";
import { SupplierProductReview } from "@/components/suppliers/SupplierProductReview";
import { SupplierReviewComplete } from "@/components/suppliers/SupplierReviewComplete";

import type {
  CatalogueMatchingResult,
} from "@/lib/brain/CatalogueMatchingEngine";

import type {
  SupplierCatalogueCardData,
} from "@/types/supplier-catalogue";

type ReviewItem = {
  card: SupplierCatalogueCardData;
  match: CatalogueMatchingResult;
};

type Props = {
  items: ReviewItem[];
};

type Decision =
  | "accepted"
  | "skipped"
  | "create_product";

export function SupplierReviewWorkspace({
  items,
}: Props) {
  const [currentIndex, setCurrentIndex] =
    useState(0);

  const [decisions, setDecisions] =
    useState<Record<string, Decision>>({});

  const [basketItems, setBasketItems] =
    useState<BuyingBasketItem[]>([]);

  const currentItem =
    items[currentIndex] ?? null;

  const reviewedCount =
    Object.keys(decisions).length;

  const remainingCount = Math.max(
    0,
    items.length - reviewedCount,
  );

  const progressPercentage =
    items.length > 0
      ? Math.round(
          (reviewedCount / items.length) *
            100,
        )
      : 100;

  const estimatedMinutes = useMemo(
    () =>
      remainingCount === 0
        ? 0
        : Math.max(
            1,
            Math.ceil(remainingCount * 0.08),
          ),
    [remainingCount],
  );

  const acceptedCount =
    Object.values(decisions).filter(
      (decision) =>
        decision === "accepted",
    ).length;

  const skippedCount =
    Object.values(decisions).filter(
      (decision) =>
        decision === "skipped",
    ).length;

  const newProductCount =
    Object.values(decisions).filter(
      (decision) =>
        decision === "create_product",
    ).length;

  const reviewComplete =
    items.length > 0 &&
    reviewedCount === items.length;

  function getNextUnreviewedIndex(
    decisionsAfterUpdate: Record<
      string,
      Decision
    >,
  ): number | null {
    for (
      let offset = 1;
      offset <= items.length;
      offset += 1
    ) {
      const candidateIndex =
        (currentIndex + offset) %
        items.length;

      const candidate =
        items[candidateIndex];

      if (
        candidate &&
        !decisionsAfterUpdate[
          candidate.card.id
        ]
      ) {
        return candidateIndex;
      }
    }

    return null;
  }

  function addAcceptedItemToBasket(
    item: ReviewItem,
  ) {
    const bestMatch =
      item.match.bestMatch;

    if (!bestMatch) {
      return;
    }

    const basketItem: BuyingBasketItem = {
      id: item.card.id,
      productName:
        bestMatch.product.product_name,
      supplierName:
        item.card.supplierName,
      packs: 1,
      packCost: item.card.packCost,
      currency: item.card.currency,
    };

    setBasketItems((current) => {
      const existing = current.find(
        (entry) =>
          entry.id === basketItem.id,
      );

      if (existing) {
        return current;
      }

      return [
        ...current,
        basketItem,
      ];
    });
  }

  function removeItemFromBasket(
    cardId: string,
  ) {
    setBasketItems((current) =>
      current.filter(
        (item) => item.id !== cardId,
      ),
    );
  }

  function recordDecision(
    decision: Decision,
  ) {
    if (!currentItem) {
      return;
    }

    const nextDecisions = {
      ...decisions,
      [currentItem.card.id]: decision,
    };

    setDecisions(nextDecisions);

    if (decision === "accepted") {
      addAcceptedItemToBasket(
        currentItem,
      );
    } else {
      removeItemFromBasket(
        currentItem.card.id,
      );
    }

    const nextIndex =
      getNextUnreviewedIndex(
        nextDecisions,
      );

    if (nextIndex !== null) {
      setCurrentIndex(nextIndex);
    }
  }

  function goPrevious() {
    setCurrentIndex((current) =>
      Math.max(0, current - 1),
    );
  }

  function goNext() {
    setCurrentIndex((current) =>
      Math.min(
        items.length - 1,
        current + 1,
      ),
    );
  }

  function openBasket() {
    window.alert(
      "Buying Basket workspace is the next step.",
    );
  }

  function returnToArchive() {
    window.location.href =
      "/supplier-catalogue";
  }

  if (items.length === 0) {
    return (
      <section className="supplier-review-workspace-empty">
        <p className="vault-eyebrow">
          Review Queue
        </p>

        <h1>No catalogue items to review</h1>

        <p>
          Import a supplier catalogue first.
          Items requiring attention will appear
          here.
        </p>

        <a href="/supplier-catalogue">
          ← Return to Supplier Catalogue
        </a>
      </section>
    );
  }

  if (reviewComplete) {
    return (
      <main className="supplier-review-workspace">
        <SupplierReviewComplete
          accepted={acceptedCount}
          basketItems={basketItems}
          newProducts={newProductCount}
          onOpenBasket={openBasket}
          onReturnToArchive={
            returnToArchive
          }
          reviewed={reviewedCount}
          skipped={skippedCount}
        />
      </main>
    );
  }

  if (!currentItem) {
    return null;
  }

  return (
    <main className="supplier-review-workspace">
      <header className="supplier-review-workspace-header">
        <div>
          <p className="vault-eyebrow">
            Vault Brain Review Queue
          </p>

          <h1>Catalogue Match Review</h1>

          <p>
            Review only the items that require a
            human decision.
          </p>
        </div>

        <a href="/supplier-catalogue">
          Exit Review
        </a>
      </header>

      <section className="supplier-review-status">
        <article>
          <span>Remaining</span>

          <strong>
            {remainingCount}
          </strong>
        </article>

        <article>
          <span>Reviewed</span>

          <strong>
            {reviewedCount}
          </strong>
        </article>

        <article>
          <span>Progress</span>

          <strong>
            {progressPercentage}%
          </strong>
        </article>

        <article>
          <span>Estimated time</span>

          <strong>
            {estimatedMinutes} min
          </strong>
        </article>
      </section>

      <div className="supplier-review-progress-track">
        <span
          style={{
            width: `${progressPercentage}%`,
          }}
        />
      </div>

      <div className="supplier-review-workspace-layout">
        <SupplierProductReview
          card={currentItem.card}
          currentIndex={currentIndex}
          match={currentItem.match}
          onAccept={() =>
            recordDecision("accepted")
          }
          onCreateProduct={() =>
            recordDecision(
              "create_product",
            )
          }
          onNext={goNext}
          onPrevious={goPrevious}
          onSkip={() =>
            recordDecision("skipped")
          }
          totalItems={items.length}
        />

        <BuyingBasket
          items={basketItems}
          onOpen={openBasket}
        />
      </div>

      <footer className="supplier-review-workspace-footer">
        <span>
          Accepted: {acceptedCount}
        </span>

        <span>
          Ignored: {skippedCount}
        </span>

        <span>
          New products:{" "}
          {newProductCount}
        </span>
      </footer>
    </main>
  );
}