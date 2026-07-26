"use client";

import type {
  BuyingBasketItem,
} from "@/components/suppliers/BuyingBasket";

type Props = {
  reviewed: number;
  accepted: number;
  skipped: number;
  newProducts: number;
  basketItems: BuyingBasketItem[];
  onOpenBasket?: () => void;
  onReturnToArchive?: () => void;
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

export function SupplierReviewComplete({
  reviewed,
  accepted,
  skipped,
  newProducts,
  basketItems,
  onOpenBasket,
  onReturnToArchive,
}: Props) {
  const totalPacks = basketItems.reduce(
    (total, item) => total + item.packs,
    0,
  );

  const currency =
    basketItems[0]?.currency ?? "EUR";

  const estimatedCost = basketItems.reduce(
    (total, item) => {
      if (item.packCost === null) {
        return total;
      }

      return total + item.packCost * item.packs;
    },
    0,
  );

  const hasMissingCosts = basketItems.some(
    (item) => item.packCost === null,
  );

  return (
    <section className="supplier-review-complete">
      <div className="supplier-review-complete-glow" />

      <header className="supplier-review-complete-header">
        <div className="supplier-review-complete-mark">
          <span aria-hidden="true">✓</span>
        </div>

        <p className="vault-eyebrow">
          Review Complete
        </p>

        <h1>Catalogue review finished</h1>

        <p>
          Vault Brain has recorded your decisions
          and prepared the accepted products for
          the next stage of purchasing.
        </p>
      </header>

      <div className="supplier-review-complete-stats">
        <article>
          <span>Reviewed</span>
          <strong>{reviewed}</strong>
        </article>

        <article>
          <span>Accepted</span>
          <strong>{accepted}</strong>
        </article>

        <article>
          <span>New products</span>
          <strong>{newProducts}</strong>
        </article>

        <article>
          <span>Ignored</span>
          <strong>{skipped}</strong>
        </article>
      </div>

      <section className="supplier-review-complete-basket">
        <div>
          <p className="vault-eyebrow">
            Buying Basket
          </p>

          <h2>Purchase plan ready</h2>

          <p>
            Accepted supplier items have been
            collected into a draft buying basket.
          </p>
        </div>

        <div className="supplier-review-complete-basket-metrics">
          <article>
            <span>Products</span>
            <strong>{basketItems.length}</strong>
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
                currency,
              )}
            </strong>
          </article>
        </div>

        {hasMissingCosts ? (
          <p className="supplier-review-complete-warning">
            Some supplier costs are missing, so
            the estimated basket value is
            incomplete.
          </p>
        ) : null}
      </section>

      <footer className="supplier-review-complete-actions">
        <button
          className="supplier-review-complete-secondary"
          onClick={onReturnToArchive}
          type="button"
        >
          ← Return to Archive
        </button>

        <button
          className="supplier-review-complete-primary"
          disabled={basketItems.length === 0}
          onClick={onOpenBasket}
          type="button"
        >
          Continue to Buying Basket →
        </button>
      </footer>
    </section>
  );
}