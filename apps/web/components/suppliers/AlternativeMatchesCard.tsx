"use client";

import type {
  CatalogueProductMatch,
} from "@/lib/brain/CatalogueMatchingEngine";

type Props = {
  alternatives: CatalogueProductMatch[];
};

export function AlternativeMatchesCard({
  alternatives,
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
          (alternative) => (
            <button
              key={
                alternative.product
                  .product_id
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
                {
                  alternative.confidence
                }
                %
              </strong>
            </button>
          ),
        )}
      </div>
    </details>
  );
}