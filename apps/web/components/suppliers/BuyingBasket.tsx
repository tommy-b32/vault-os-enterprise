"use client";

export type BuyingBasketItem = {
  id: string;
  productName: string;
  supplierName: string;
  packs: number;
  packCost: number | null;
  currency: string;
};

type Props = {
  items: BuyingBasketItem[];
  onOpen?: () => void;
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
  onOpen,
}: Props) {
  const totalProducts = items.length;

  const totalPacks = items.reduce(
    (total, item) => total + item.packs,
    0,
  );

  const basketCurrency =
    items[0]?.currency ?? "EUR";

  const estimatedCost = items.reduce(
    (total, item) => {
      if (item.packCost === null) {
        return total;
      }

      return (
        total +
        item.packCost * item.packs
      );
    },
    0,
  );

  const hasMissingCosts = items.some(
    (item) => item.packCost === null,
  );

  return (
    <aside className="buying-basket">
      <header className="buying-basket-header">
        <div>
          <p className="vault-eyebrow">
            Buying Basket
          </p>

          <h3>Purchase plan</h3>
        </div>

        <span>{totalProducts}</span>
      </header>

      {items.length > 0 ? (
        <>
          <div className="buying-basket-metrics">
            <article>
              <span>Products</span>
              <strong>{totalProducts}</strong>
            </article>

            <article>
              <span>Packs</span>
              <strong>{totalPacks}</strong>
            </article>

            <article>
              <span>Estimated cost</span>

              <strong>
                {formatCurrency(
                  estimatedCost,
                  basketCurrency,
                )}
              </strong>
            </article>
          </div>

          <div className="buying-basket-preview">
            {items.slice(0, 3).map((item) => (
              <article key={item.id}>
                <div>
                  <strong>
                    {item.productName}
                  </strong>

                  <small>
                    {item.supplierName}
                  </small>
                </div>

                <span>
                  {item.packs}{" "}
                  {item.packs === 1
                    ? "pack"
                    : "packs"}
                </span>
              </article>
            ))}

            {items.length > 3 ? (
              <p>
                +{items.length - 3} more items
              </p>
            ) : null}
          </div>

          {hasMissingCosts ? (
            <p className="buying-basket-warning">
              Some supplier pack costs are missing,
              so the estimate is incomplete.
            </p>
          ) : null}

          <button
            className="buying-basket-button"
            onClick={onOpen}
            type="button"
          >
            Open Buying Basket →
          </button>
        </>
      ) : (
        <div className="buying-basket-empty">
          <p>
            Accepted supplier items will appear
            here while you review the catalogue.
          </p>
        </div>
      )}
    </aside>
  );
}