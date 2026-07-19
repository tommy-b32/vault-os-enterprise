"use client";

type ProductSearchProps = {
  value: string;
  onChange: (value: string) => void;
  resultCount: number;
  totalCount: number;
};

export function ProductSearch({
  value,
  onChange,
  resultCount,
  totalCount,
}: ProductSearchProps) {
  return (
    <div className="product-search">
      <div className="product-search-field">
        <span aria-hidden="true">⌕</span>

        <input
          aria-label="Search catalogue products"
          onChange={(event) =>
            onChange(event.target.value)
          }
          placeholder="Search products, suppliers or strategy..."
          type="search"
          value={value}
        />

        {value.length > 0 && (
          <button
            aria-label="Clear search"
            onClick={() => onChange("")}
            type="button"
          >
            ×
          </button>
        )}
      </div>

      <p>
        Showing <strong>{resultCount}</strong> of{" "}
        <strong>{totalCount}</strong> products
      </p>
    </div>
  );
}