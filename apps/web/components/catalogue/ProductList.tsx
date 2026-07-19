import type {
  CatalogueProduct,
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

function needsConfiguration(
  product: CatalogueProduct,
): boolean {
  if (
    product.inventory_strategy === "dropship" ||
    product.inventory_strategy === "service" ||
    product.inventory_strategy === "discontinued"
  ) {
    return false;
  }

  return (
    !product.supplier_id ||
    !product.pack_profile
  );
}

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

        const requiresSetup =
          needsConfiguration(product);

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

                {strategyLabels[
                  product.inventory_strategy
                ]}
              </span>
            </span>

            {requiresSetup && (
              <span className="product-list-warning">
                Setup
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}