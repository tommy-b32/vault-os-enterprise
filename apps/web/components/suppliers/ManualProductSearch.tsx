"use client";

import "./ManualProductSearch.css";

import {
  useMemo,
  useState,
} from "react";

import type {
  CatalogueProduct,
} from "@/types/catalogue";

type Props = {
  products: CatalogueProduct[];
  selectedProductId?: string | null;
  onSelect: (product: CatalogueProduct) => void;
  onClose: () => void;
};

function normaliseText(
  value: string | null | undefined,
): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSearchText(
  product: CatalogueProduct,
): string {
  return normaliseText(
    [
      product.product_name,
      product.product_type,
      product.status,
      product.supplier_company,
      product.product_intelligence.brand,
      product.product_intelligence.official_product_name,
      product.product_intelligence.primary_colour,
      product.product_intelligence.garment_type,
      ...product.product_intelligence.aliases,
      product.product_vision?.brand,
      product.product_vision?.primary_colour,
      product.product_vision?.category,
      product.product_vision?.subcategory,
      ...(product.product_vision?.matching_keywords ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function ManualProductSearch({
  products,
  selectedProductId = null,
  onSelect,
  onClose,
}: Props) {
  const [
    query,
    setQuery,
  ] = useState("");

  const [
    pendingProductId,
    setPendingProductId,
  ] = useState<string | null>(
    selectedProductId,
  );

  const filteredProducts =
    useMemo(
      () => {
        const search =
          normaliseText(query);

        if (!search) {
          return products.slice(0, 50);
        }

        const searchTerms =
          search
            .split(" ")
            .filter(Boolean);

        return products
          .filter((product) => {
            const searchable =
              getSearchText(product);

            return searchTerms.every(
              (term) =>
                searchable.includes(term),
            );
          })
          .slice(0, 100);
      },
      [
        products,
        query,
      ],
    );

  const pendingProduct =
    products.find(
      (product) =>
        product.style_id ===
        pendingProductId,
    ) ?? null;

  return (
    <div
      aria-label="Find existing Fabric Vault product"
      aria-modal="true"
      className="manual-product-search-overlay"
      role="dialog"
    >
      <section className="manual-product-search">
        <header className="manual-product-search-header">
          <div>
            <p className="vault-eyebrow">
              Manual Catalogue Search
            </p>

            <h2>
              Find an existing Fabric Vault product
            </h2>

            <p>
              Search the full catalogue when Vault Brain has
              not shown the correct match.
            </p>
          </div>

          <button
            aria-label="Close product search"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="manual-product-search-field">
          <span aria-hidden="true">
            ⌕
          </span>

          <input
            autoFocus
            onChange={(event) =>
              setQuery(
                event.target.value,
              )
            }
            placeholder="Search by product, brand, colour or style..."
            type="search"
            value={query}
          />

          {query ? (
            <button
              aria-label="Clear search"
              onClick={() =>
                setQuery("")
              }
              type="button"
            >
              ×
            </button>
          ) : null}
        </div>

        <div className="manual-product-search-meta">
          <span>
            {filteredProducts.length}{" "}
            {filteredProducts.length === 1
              ? "result"
              : "results"}
          </span>

          <small>
            {products.length} products in catalogue
          </small>
        </div>

        <div className="manual-product-search-results">
          {filteredProducts.length > 0 ? (
            filteredProducts.map(
              (product) => {
                const selected =
                  product.style_id ===
                  pendingProductId;

                const brand =
                  product.product_vision?.brand ??
                  product.product_intelligence.brand ??
                  "Brand not recorded";

                const colour =
                  product.product_vision?.primary_colour ??
                  product.product_intelligence.primary_colour ??
                  "Colour not recorded";

                const imageUrl =
                  product.product_vision?.image_url ??
                  null;

                return (
                  <button
                    aria-pressed={selected}
                    className={
                      selected
                        ? "is-selected"
                        : ""
                    }
                    key={product.style_id}
                    onClick={() =>
                      setPendingProductId(
                        product.style_id,
                      )
                    }
                    type="button"
                  >
                    <div className="manual-product-search-result-image">
                      {imageUrl ? (
                        <img
                          alt=""
                          src={imageUrl}
                        />
                      ) : (
                        <span>
                          V
                        </span>
                      )}
                    </div>

                    <div className="manual-product-search-result-copy">
                      <strong>
                        {product.product_name}
                      </strong>

                      <span>
                        {brand} · {colour}
                      </span>

                      <small>
                        Stock: {product.stock_on_hand}
                      </small>
                    </div>

                    <div className="manual-product-search-result-state">
                      {selected
                        ? "Selected"
                        : "Choose"}
                    </div>
                  </button>
                );
              },
            )
          ) : (
            <div className="manual-product-search-empty">
              <h3>
                No products found
              </h3>

              <p>
                Try a broader product name, brand or colour.
              </p>
            </div>
          )}
        </div>

        <footer className="manual-product-search-footer">
          <button
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>

          <button
            className="is-primary"
            disabled={!pendingProduct}
            onClick={() => {
              if (pendingProduct) {
                onSelect(
                  pendingProduct,
                );
              }
            }}
            type="button"
          >
            Select Product
          </button>
        </footer>
      </section>
    </div>
  );
}
