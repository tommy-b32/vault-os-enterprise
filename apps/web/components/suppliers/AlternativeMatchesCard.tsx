"use client";

import type {
  CatalogueProductMatch,
} from "@/lib/brain/CatalogueMatchingEngine";

type Props = {
  alternatives: CatalogueProductMatch[];

  selectedProductId?: string | null;

  onSelect?: (
    alternative: CatalogueProductMatch,
  ) => void;
};

export function AlternativeMatchesCard({
  alternatives,
  selectedProductId = null,
  onSelect,
}: Props) {
  if (alternatives.length === 0) {
    return null;
  }

  return (
    <details className="supplier-product-review-v2-alternatives">
      <summary>
        Alternative matches
      </summary>

      <div>
        {alternatives.map(
          (alternative) => {
            const selected =
              alternative.product.product_id ===
              selectedProductId;

            return (
              <button
                aria-pressed={selected}
                className={
                  selected
                    ? "is-selected"
                    : ""
                }
                key={
                  alternative.product.product_id
                }
                onClick={() =>
                  onSelect?.(
                    alternative,
                  )
                }
                type="button"
              >
                <span>
                  {
                    alternative.product
                      .product_name
                  }
                </span>

                <strong>
                  {selected
                    ? "Selected"
                    : `${alternative.confidence}%`}
                </strong>
              </button>
            );
          },
        )}
      </div>
    </details>
  );
}