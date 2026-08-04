"use client";

import { useMemo, useState } from "react";

import { ProductEditor } from "@/components/catalogue/ProductEditor";
import { ProductList } from "@/components/catalogue/ProductList";
import { ProductSearch } from "@/components/catalogue/ProductSearch";
import type {
  CatalogueProduct,
  CatalogueSupplier,
} from "@/types/catalogue";

type CatalogueWorkspaceProps = {
  products: CatalogueProduct[];
  suppliers: CatalogueSupplier[];
};

export function CatalogueWorkspace({
  products,
  suppliers,
}: CatalogueWorkspaceProps) {
  const [search, setSearch] = useState("");
  const [selectedStyleId, setSelectedStyleId] =
    useState<string | null>(
      products[0]?.style_id ?? null,
    );

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return products;
    }

    return products.filter((product) => {
      const searchable = [
        product.product_name,
        product.supplier_company,
        product.inventory_strategy,
        product.pack_profile,
        product.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [products, search]);

  const selectedProduct =
    products.find(
      (product) =>
        product.style_id === selectedStyleId,
    ) ?? null;

  function handleSearchChange(value: string) {
    setSearch(value);

    const query = value.trim().toLowerCase();

    if (!query) {
      return;
    }

    const firstMatch = products.find((product) => {
      const searchable = [
        product.product_name,
        product.supplier_company,
        product.inventory_strategy,
        product.pack_profile,
        product.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });

    if (firstMatch) {
      setSelectedStyleId(firstMatch.style_id);
    }
  }

  return (
    <section className="catalogue-workspace">
      <aside className="catalogue-master-panel">
        <ProductSearch
          onChange={handleSearchChange}
          resultCount={filteredProducts.length}
          totalCount={products.length}
          value={search}
        />

        <div className="catalogue-master-scroll">
          <ProductList
            onSelectStyle={setSelectedStyleId}
            products={filteredProducts}
            selectedStyleId={selectedStyleId}
          />
        </div>
      </aside>

      <div className="catalogue-detail-panel">
        <ProductEditor
          product={selectedProduct}
          suppliers={suppliers}
        />
      </div>
    </section>
  );
}
