"use client";

import {
  AnimatePresence,
  motion,
} from "framer-motion";

export type BuyingBasketItem = {
  id: string;

  productName: string;

  supplierName: string;

  packs: number;

  packCost: number | null;

  currency: string;

  urgency?:
    | "low"
    | "medium"
    | "high";

  estimatedProfit?:
    number | null;

  estimatedRevenue?:
    number | null;
};

type Props = {
  items: BuyingBasketItem[];

  onDecreasePacks?: (
    itemId: string,
  ) => void;

  onIncreasePacks?: (
    itemId: string,
  ) => void;

  onOpen?: () => void;

  onRemove?: (
    itemId: string,
  ) => void;
};

function formatCurrency(
  value: number,
  currency: string,
): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function getUrgencyLabel(
  urgency:
    | BuyingBasketItem["urgency"],
): string {
  switch (urgency) {
    case "high":
      return "Urgent";

    case "medium":
      return "Monitor";

    case "low":
      return "Healthy";

    default:
      return "Review";
  }
}

export function BuyingBasket({
  items,
  onDecreasePacks,
  onIncreasePacks,
  onOpen,
  onRemove,
}: Props) {
  const totalProducts =
    items.length;

  const totalPacks =
    items.reduce(
      (total, item) =>
        total + item.packs,
      0,
    );

  const basketCurrency =
    items[0]?.currency ??
    "EUR";

  const estimatedCost =
    items.reduce(
      (total, item) =>
        total +
        (
          item.packCost === null
            ? 0
            : item.packCost *
              item.packs
        ),
      0,
    );

  const projectedProfit =
    items.reduce(
      (total, item) => {
        const scaled =
          item.estimatedProfit == null
            ? 0
            : item.estimatedProfit * item.packs;

        return total + scaled;
      },
      0,
    );

  const projectedRevenue =
    items.reduce(
      (total, item) => {
        const scaled =
          item.estimatedRevenue == null
            ? 0
            : item.estimatedRevenue * item.packs;

        return total + scaled;
      },
      0,
    );

  const urgentItems =
    items.filter(
      (item) =>
        item.urgency === "high",
    ).length;

  const monitorItems =
    items.filter(
      (item) =>
        item.urgency === "medium",
    ).length;

  const healthyItems =
    items.filter(
      (item) =>
        item.urgency === "low",
    ).length;

  const hasMissingCosts =
    items.some(
      (item) =>
        item.packCost === null,
    );

  const hasAnyKnownCost =
    items.some(
      (item) =>
        item.packCost !== null,
    );

  const hasProjectedProfit =
    items.some(
      (item) =>
        item.estimatedProfit !==
          null &&
        item.estimatedProfit !==
          undefined,
    );

  const hasProjectedRevenue =
    items.some(
      (item) =>
        item.estimatedRevenue !==
          null &&
        item.estimatedRevenue !==
          undefined,
    );

  return (
    <aside className="buying-basket buying-basket-interactive">
      <header className="buying-basket-header">
        <div>
          <p className="vault-eyebrow">
            Buying Intelligence
          </p>

          <h3>
            Purchase plan
          </h3>
        </div>

        <span>
          {totalProducts}
        </span>
      </header>

      {items.length > 0 ? (
        <>
          <div className="buying-basket-metrics">
            <article>
              <span>
                Products
              </span>

              <strong>
                {totalProducts}
              </strong>
            </article>

            <article>
              <span>
                Packs
              </span>

              <strong>
                {totalPacks}
              </strong>
            </article>

            <article>
              <span>
                Estimated cost
              </span>

              <strong>
               {hasAnyKnownCost
                  ? formatCurrency(
                  estimatedCost,
                  basketCurrency,
              )
              : "Pending supplier costs"}
            </strong>
            </article>
          </div>

          <div className="buying-basket-intelligence-summary">
            <article className="is-high">
              <span>
                Urgent
              </span>

              <strong>
                {urgentItems}
              </strong>
            </article>

            <article className="is-medium">
              <span>
                Monitor
              </span>

              <strong>
                {monitorItems}
              </strong>
            </article>

            <article className="is-low">
              <span>
                Healthy
              </span>

              <strong>
                {healthyItems}
              </strong>
            </article>
          </div>

          <div className="buying-basket-value-summary">
            <article>
              <span>
                Projected revenue
              </span>

              <strong>
                {hasProjectedRevenue
                  ? formatCurrency(
                      projectedRevenue,
                      basketCurrency,
                    )
                  : "Pending data"}
              </strong>
            </article>

            <article>
              <span>
                Projected profit
              </span>

              <strong>
                {hasProjectedProfit
                  ? formatCurrency(
                      projectedProfit,
                      basketCurrency,
                    )
                  : "Pending data"}
              </strong>
            </article>
          </div>

          <div className="buying-basket-preview buying-basket-preview-interactive">
            <AnimatePresence initial={false}>
              {items.map(
              (item) => {
                const itemCost =
                  item.packCost ===
                  null
                    ? null
                    : item.packCost *
                      item.packs;

                return (
                  <motion.article
                    animate={{
                      opacity: 1,
                      scale: 1,
                      y: 0,
                    }}
                    exit={{
                      opacity: 0,
                      x: 40,
                    }}
                    initial={{
                      opacity: 0,
                      scale: 0.96,
                      y: 18,
                    }}
                    key={
                      item.id
                    }
                    layout
                    transition={{
                      duration: 0.22,
                      ease: "easeOut",
                    }}
                  >
                    <div className="buying-basket-item-copy">
                      <div className="buying-basket-item-heading">
                        <strong>
                          {
                            item.productName
                          }
                        </strong>

                        <span
                          className={`buying-basket-urgency is-${item.urgency ?? "review"}`}
                        >
                          {getUrgencyLabel(
                            item.urgency,
                          )}
                        </span>
                      </div>

                      <small>
                        {
                          item.supplierName
                        }
                      </small>

                      <span>
                        {itemCost !==
                        null
                          ? formatCurrency(
                              itemCost,
                              item.currency,
                            )
                          : "Pack cost not supplied"}
                      </span>

                      <small>
                        Recommended quantity:{" "}
                        {item.packs}{" "}
                        {item.packs === 1
                          ? "pack"
                          : "packs"}
                      </small>

                      {item.estimatedProfit !==
                      null &&
                      item.estimatedProfit !==
                      undefined ? (
                        <small>
                          Projected profit:{" "}
                          {formatCurrency(
                            item.estimatedProfit *
                              item.packs,
                            item.currency,
                          )}
                        </small>
                      ) : null}
                    </div>

                    <div className="buying-basket-quantity">
                      <button
                        aria-label={`Decrease packs for ${item.productName}`}
                        disabled={
                          item.packs <=
                          1
                        }
                        onClick={() =>
                          onDecreasePacks?.(
                            item.id,
                          )
                        }
                        type="button"
                      >
                        −
                      </button>

                      <strong>
                        {
                          item.packs
                        }
                      </strong>

                      <button
                        aria-label={`Increase packs for ${item.productName}`}
                        onClick={() =>
                          onIncreasePacks?.(
                            item.id,
                          )
                        }
                        type="button"
                      >
                        +
                      </button>
                    </div>

                    <button
                      aria-label={`Remove ${item.productName} from buying basket`}
                      className="buying-basket-remove"
                      onClick={() =>
                        onRemove?.(
                          item.id,
                        )
                      }
                      type="button"
                    >
                      Remove
                    </button>
                  </motion.article>
                );
              },
            )}
            </AnimatePresence>
          </div>

          {hasMissingCosts ? (
            <p className="buying-basket-warning">
              Some supplier pack
              costs are missing, so
              the estimate is
              incomplete.
            </p>
          ) : null}

          <button
            className="buying-basket-button"
            onClick={
              onOpen
            }
            type="button"
          >
            Open Buying Basket →
          </button>
        </>
      ) : (
        <div className="buying-basket-empty">
          <p>
            Linked supplier items
            will appear here while
            you review the catalogue.
          </p>
        </div>
      )}
    </aside>
  );
}