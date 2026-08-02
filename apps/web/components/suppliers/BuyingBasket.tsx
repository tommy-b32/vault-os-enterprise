"use client";

import {
  BuyingIntelligenceEngine,
} from "@/lib/brain/BuyingIntelligenceEngine";

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
      (total, item) => {
        const recommendation =
          BuyingIntelligenceEngine.analyse(
            item,
          );

        return (
          total +
          (
            recommendation.estimatedCost ??
            0
          )
        );
      },
      0,
    );

  const hasMissingCosts =
    items.some(
      (item) =>
        BuyingIntelligenceEngine.analyse(
          item,
        ).estimatedCost ===
        null,
    );

  return (
    <aside className="buying-basket buying-basket-interactive">
      <header className="buying-basket-header">
        <div>
          <p className="vault-eyebrow">
            Buying Basket
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
                {formatCurrency(
                  estimatedCost,
                  basketCurrency,
                )}
              </strong>
            </article>
          </div>

          <div className="buying-basket-preview buying-basket-preview-interactive">
            {items.map(
              (item) => {
                const recommendation =
                  BuyingIntelligenceEngine.analyse(
                    item,
                  );

                const itemCost =
                  recommendation.estimatedCost;

                return (
                  <article
                    key={
                      item.id
                    }
                  >
                    <div className="buying-basket-item-copy">
                      <strong>
                        {
                          item.productName
                        }
                      </strong>

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
                          : "Cost unavailable"}
                      </span>

                      <small>
                        Suggested:{" "}
                        {
                          recommendation.suggestedPacks
                        }{" "}
                        {
                          recommendation.suggestedPacks ===
                          1
                            ? "pack"
                            : "packs"
                        }
                      </small>
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
                  </article>
                );
              },
            )}
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