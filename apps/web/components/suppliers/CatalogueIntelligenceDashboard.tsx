"use client";

import "./CatalogueIntelligenceDashboard.css";

import {
  useMemo,
  useState,
} from "react";

import {
  CatalogueIntelligenceEngine,
  type CatalogueIntelligenceCategory,
  type CatalogueIntelligenceItem,
} from "@/lib/brain/CatalogueIntelligenceEngine";

import type {
  CatalogueReviewQueueItem,
} from "@/lib/supplier/CatalogueReviewQueueEngine";

type Props = {
  items: CatalogueReviewQueueItem[];

  onOpenReview: (
    items: CatalogueReviewQueueItem[],
  ) => void;

  onOpenFullReview?: () => void;
};

type ActiveFilter =
  | "all"
  | CatalogueIntelligenceCategory
  | "needs_review";

function getCategoryLabel(
  category: CatalogueIntelligenceCategory,
): string {
  switch (category) {
    case "known_product":
      return "Known product";

    case "strong_match":
      return "Strong match";

    case "possible_match":
      return "Review suggested";

    case "new_product":
      return "New product";
  }
}

function getCategoryClass(
  category: CatalogueIntelligenceCategory,
): string {
  switch (category) {
    case "known_product":
      return "is-known";

    case "strong_match":
      return "is-strong";

    case "possible_match":
      return "is-review";

    case "new_product":
      return "is-new";
  }
}

function getItemTitle(
  item: CatalogueIntelligenceItem,
): string {
  return (
    item.item.card.officialProductName ??
    item.item.card.internalReference ??
    "Unnamed supplier product"
  );
}

export function CatalogueIntelligenceDashboard({
  items,
  onOpenReview,
  onOpenFullReview,
}: Props) {
  const result =
    useMemo(
      () =>
        CatalogueIntelligenceEngine.analyse(
          items,
        ),
      [items],
    );

  const [
    activeFilter,
    setActiveFilter,
  ] = useState<ActiveFilter>(
    "all",
  );

  const filteredItems =
    useMemo(
      () => {
        if (
          activeFilter === "all"
        ) {
          return result.items;
        }

        if (
          activeFilter ===
          "needs_review"
        ) {
          return result.reviewItems;
        }

        return result.items.filter(
          (item) =>
            item.category ===
            activeFilter,
        );
      },
      [
        activeFilter,
        result,
      ],
    );

  function openRequiredReview() {
    onOpenReview(
      result.reviewItems.map(
        (item) =>
          item.item,
      ),
    );
  }

  return (
    <section className="catalogue-intelligence-dashboard">
      <header className="catalogue-intelligence-dashboard-header">
        <div>
          <p className="vault-eyebrow">
            Catalogue Intelligence
          </p>

          <h2>
            Vault Brain has analysed this catalogue
          </h2>

          <p>
            Known and high-confidence products are separated
            from items that need a buyer decision.
          </p>
        </div>

        <div className="catalogue-intelligence-dashboard-review-time">
          <span>
            Estimated review
          </span>

          <strong>
            {
              result.summary.estimatedReviewMinutes
            }{" "}
            {result.summary.estimatedReviewMinutes === 1
              ? "minute"
              : "minutes"}
          </strong>
        </div>
      </header>

      <div className="catalogue-intelligence-dashboard-stats">
        <button
          className={
            activeFilter === "all"
              ? "is-active"
              : ""
          }
          onClick={() =>
            setActiveFilter(
              "all",
            )
          }
          type="button"
        >
          <span>
            Total detected
          </span>

          <strong>
            {
              result.summary.totalDetected
            }
          </strong>

          <small>
            Entire catalogue
          </small>
        </button>

        <button
          className={
            activeFilter ===
            "known_product"
              ? "is-active is-known"
              : "is-known"
          }
          onClick={() =>
            setActiveFilter(
              "known_product",
            )
          }
          type="button"
        >
          <span>
            Known products
          </span>

          <strong>
            {
              result.summary.knownProducts
            }
          </strong>

          <small>
            Restored from memory
          </small>
        </button>

        <button
          className={
            activeFilter ===
            "strong_match"
              ? "is-active is-strong"
              : "is-strong"
          }
          onClick={() =>
            setActiveFilter(
              "strong_match",
            )
          }
          type="button"
        >
          <span>
            Strong matches
          </span>

          <strong>
            {
              result.summary.strongMatches
            }
          </strong>

          <small>
            Ready without review
          </small>
        </button>

        <button
          className={
            activeFilter ===
            "possible_match"
              ? "is-active is-review"
              : "is-review"
          }
          onClick={() =>
            setActiveFilter(
              "possible_match",
            )
          }
          type="button"
        >
          <span>
            Possible matches
          </span>

          <strong>
            {
              result.summary.possibleMatches
            }
          </strong>

          <small>
            Buyer review advised
          </small>
        </button>

        <button
          className={
            activeFilter ===
            "new_product"
              ? "is-active is-new"
              : "is-new"
          }
          onClick={() =>
            setActiveFilter(
              "new_product",
            )
          }
          type="button"
        >
          <span>
            New products
          </span>

          <strong>
            {
              result.summary.newProducts
            }
          </strong>

          <small>
            No existing match
          </small>
        </button>

        <button
          className={
            activeFilter ===
            "needs_review"
              ? "is-active is-review"
              : "is-review"
          }
          onClick={() =>
            setActiveFilter(
              "needs_review",
            )
          }
          type="button"
        >
          <span>
            Needs review
          </span>

          <strong>
            {
              result.summary.needsReview
            }
          </strong>

          <small>
            Requires attention
          </small>
        </button>
      </div>

      <section className="catalogue-intelligence-dashboard-progress">
        <div>
          <span>
            Ready without review
          </span>

          <strong>
            {
              result.summary.readyWithoutReview
            }{" "}
            of{" "}
            {
              result.summary.totalDetected
            }
          </strong>
        </div>

        <div className="catalogue-intelligence-progress-track">
          <span
            style={{
              width:
                result.summary.totalDetected >
                0
                  ? `${Math.round(
                      (
                        result.summary.readyWithoutReview /
                        result.summary.totalDetected
                      ) *
                        100,
                    )}%`
                  : "0%",
            }}
          />
        </div>

        <small>
          {
            result.summary.reviewPercentage
          }
          % of this catalogue needs a human decision.
        </small>
      </section>

      <section className="catalogue-intelligence-dashboard-list">
        <header>
          <div>
            <p className="vault-eyebrow">
              Product Breakdown
            </p>

            <h3>
              {filteredItems.length}{" "}
              {filteredItems.length === 1
                ? "item"
                : "items"}
            </h3>
          </div>

          {activeFilter !== "all" ? (
            <button
              onClick={() =>
                setActiveFilter(
                  "all",
                )
              }
              type="button"
            >
              Clear filter
            </button>
          ) : null}
        </header>

        <div>
          {filteredItems.length > 0 ? (
            filteredItems
              .slice(0, 100)
              .map((item) => (
                <article
                  className={
                    getCategoryClass(
                      item.category,
                    )
                  }
                  key={
                    item.cardId
                  }
                >
                  <div>
                    <span>
                      {
                        getCategoryLabel(
                          item.category,
                        )
                      }
                    </span>

                    <strong>
                      {
                        getItemTitle(
                          item,
                        )
                      }
                    </strong>

                    <small>
                      {
                        item.item.card
                          .supplierName
                      }
                      {" · "}
                      {
                        item.item.card
                          .colour ??
                        "Colour not recorded"
                      }
                    </small>
                  </div>

                  <div>
                    <span>
                      {item.productName ??
                        "No product selected"}
                    </span>

                    <strong>
                      {item.confidence !==
                      null
                        ? `${item.confidence}%`
                        : "Manual review"}
                    </strong>
                  </div>
                </article>
              ))
          ) : (
            <div className="catalogue-intelligence-dashboard-empty">
              <h3>
                No items in this category
              </h3>

              <p>
                Choose another filter to inspect the catalogue.
              </p>
            </div>
          )}
        </div>

        {filteredItems.length > 100 ? (
          <small>
            Showing the first 100 items.
          </small>
        ) : null}
      </section>

      <footer className="catalogue-intelligence-dashboard-actions">
        <button
          disabled={
            result.summary.needsReview ===
            0
          }
          onClick={
            openRequiredReview
          }
          type="button"
        >
          Review{" "}
          {
            result.summary.needsReview
          }{" "}
          {result.summary.needsReview ===
          1
            ? "item"
            : "items"}
          {" "}→
        </button>

        {onOpenFullReview ? (
          <button
            className="is-secondary"
            onClick={
              onOpenFullReview
            }
            type="button"
          >
            Open full review
          </button>
        ) : null}
      </footer>
    </section>
  );
}