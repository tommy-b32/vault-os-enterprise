import type { CatalogueProduct } from "@/types/catalogue";

type ProductStatsProps = {
  product: CatalogueProduct;
};

function safeNumber(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

export function ProductStats({
  product,
}: ProductStatsProps) {
  const stockOnHand = safeNumber(
    product.stock_on_hand,
  );

  const completePacks = safeNumber(
    product.complete_packs,
  );

  const looseUnits = safeNumber(
    product.loose_units,
  );

  const isStocked =
    product.inventory_strategy === "stocked" ||
    product.inventory_strategy ===
      "do_not_restock";

  if (!isStocked) {
    const message =
      product.inventory_strategy === "dropship"
        ? "This product is dropshipped and is excluded from held-stock calculations."
        : product.inventory_strategy === "service"
          ? "This is a service product and has no physical inventory."
          : "This product is retained for historical reporting and is excluded from stock intelligence.";

    return (
      <section className="product-stats product-stats-excluded">
        <span className="vault-eyebrow">
          Inventory Intelligence
        </span>

        <p>{message}</p>
      </section>
    );
  }

  return (
    <section className="product-stats">
      <div className="product-stats-heading">
        <div>
          <span className="vault-eyebrow">
            Inventory Intelligence
          </span>

          <h3>Current stock position</h3>
        </div>

        <span
          className={`product-stock-state ${
            stockOnHand <= 0
              ? "is-out"
              : stockOnHand <= 10
                ? "is-low"
                : "is-healthy"
          }`}
        >
          {stockOnHand <= 0
            ? "Out of stock"
            : stockOnHand <= 10
              ? "Low stock"
              : "Healthy"}
        </span>
      </div>

      <div className="product-stats-grid">
        <article>
          <span>Units available</span>
          <strong>{stockOnHand}</strong>
        </article>

        <article>
          <span>Complete packs</span>
          <strong>{completePacks}</strong>
        </article>

        <article>
          <span>Loose units</span>
          <strong>{looseUnits}</strong>
        </article>
      </div>

      {product.restock_enabled ? (
        <p className="product-stats-note">
          This product is included in reorder
          intelligence.
        </p>
      ) : (
        <p className="product-stats-note is-warning">
          Restocking is disabled. Vault OS will
          recommend selling through the remaining
          stock only.
        </p>
      )}
    </section>
  );
}