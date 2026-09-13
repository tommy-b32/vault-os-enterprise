"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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
  attention?: string | null;
  attentionProductIds?: string[];
};

export function CatalogueWorkspace({
  products,
  suppliers,
  attention = null,
  attentionProductIds = [],
}: CatalogueWorkspaceProps) {
  const [search, setSearch] = useState("");
  const [selectedStyleId, setSelectedStyleId] =
    useState<string | null>(
    attention
      ? products.find((product) => attentionProductIds.includes(product.parent_product_id))?.style_id ?? null
      : products[0]?.style_id ?? null,
    );

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    const scopedProducts = attentionProductIds.length
      ? products.filter((product) => attentionProductIds.includes(product.parent_product_id))
      : products;
    if (!query) return scopedProducts;

    return scopedProducts.filter((product) => {
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
    filteredProducts.find(
      (product) =>
        product.style_id === selectedStyleId,
    ) ?? (attention ? filteredProducts[0] ?? null : products.find((product) => product.style_id === selectedStyleId) ?? null);

  useEffect(() => {
    if (!attention) return;
    if (selectedProduct?.style_id !== selectedStyleId) setSelectedStyleId(selectedProduct?.style_id ?? null);
  }, [attention, selectedProduct?.style_id, selectedStyleId]);

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
      {attention ? <div className="catalogue-remediation-notice"><p>Showing {filteredProducts.length} affected product{filteredProducts.length === 1 ? "" : "s"}: {attention.replaceAll("_", " ")}. Resolve the canonical data gap using the existing editor.</p>{filteredProducts.length === 0 ? <p>This Vault Brain issue is now resolved. <Link href="/">Return to Command Centre</Link> or <Link href="/catalogue">open the full catalogue</Link>.</p> : null}</div> : null}
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
          remediation={attention}
        />
      </div>
    </section>
  );
}
