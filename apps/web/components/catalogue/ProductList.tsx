import type {
  CatalogueProduct,
  ConfigurationState,
} from "@/types/catalogue";

type ProductListProps = {
  products: CatalogueProduct[];
  selectedProductId: string | null;
  onSelectProduct: (productId: string) => void;
};

const strategyLabels = {
  stocked: "Stocked",
  do_not_restock: "Do not restock",
  discontinued: "Discontinued",
  dropship: "Dropship",
  service: "Service",
} as const;

const configurationLabels: Record<
  ConfigurationState,
  string
> = {
  ready: "Ready",
  almost_ready: "Almost Ready",
  needs_configuration: "Needs Config",
  dropship_ready: "Dropship",
  do_not_restock: "Do Not Restock",
  discontinued: "Discontinued",
  service: "Service",
};

export function ProductList({
  products,
  selectedProductId,
  onSelectProduct,
}: ProductListProps) {
  if (products.length === 0) {
    return (
      <div className="product-list-empty">
        No products match your search.
      </div>
    );
  }

  return (
    <div className="product-list">
      {products.map((product) => {
        const selected =
          product.product_id === selectedProductId;

        const configurationLabel =
          configurationLabels[
            product.configuration_state
          ];

        return (
          <button
            className={`product-list-item ${
              selected ? "is-selected" : ""
            }`}
            key={product.product_id}
            onClick={() =>
              onSelectProduct(product.product_id)
            }
            type="button"
          >
            <span
              className={`product-list-status strategy-${product.inventory_strategy}`}
              aria-hidden="true"
            />

            <span className="product-list-content">
              <strong>{product.product_name}</strong>

              <span className="product-list-meta">
                {product.supplier_company ??
                  "Supplier not assigned"}

                <span aria-hidden="true">•</span>

                {
                  strategyLabels[
                    product.inventory_strategy
                  ]
                }
              </span>

              <span className="product-list-score">
                {product.configuration_score}% configured
              </span>
            </span>

            <span
              className={`product-list-health health-${product.configuration_state}`}
            >
              {configurationLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}