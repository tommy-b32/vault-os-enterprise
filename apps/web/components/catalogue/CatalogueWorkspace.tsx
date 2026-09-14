"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { ProductEditor } from "@/components/catalogue/ProductEditor";
import { ProductList } from "@/components/catalogue/ProductList";
import { ProductSearch } from "@/components/catalogue/ProductSearch";
import {
  filterWorkspaceProducts,
  getWorkspaceProducts,
  selectedWorkspaceProduct,
} from "@/lib/catalogue/remediation-workspace";
import type {
  CatalogueProduct,
  CatalogueSupplier,
  SupplierCostProfile,
} from "@/types/catalogue";

type CatalogueWorkspaceProps = {
  products: CatalogueProduct[];
  suppliers: CatalogueSupplier[];
  costProfiles?: SupplierCostProfile[];
  attention?: string | null;
  attentionProductIds?: string[];
  remediationTitle?: string;
};

export function CatalogueWorkspace({
  products,
  suppliers,
  costProfiles = [],
  attention = null,
  attentionProductIds = [],
  remediationTitle,
}: CatalogueWorkspaceProps) {
  const [search, setSearch] = useState("");
  const scopedProducts = useMemo(() => getWorkspaceProducts(products, attention, attentionProductIds), [attention, attentionProductIds, products]);
  const hasAffectedProducts = scopedProducts.length > 0;
  const [selectedStyleId, setSelectedStyleId] =
    useState<string | null>(
    attention
      ? scopedProducts[0]?.style_id ?? null
      : products[0]?.style_id ?? null,
    );

  const filteredProducts = useMemo(() => {
    return filterWorkspaceProducts(scopedProducts, search);
  }, [scopedProducts, search]);

  const selectedProduct = selectedWorkspaceProduct(filteredProducts, selectedStyleId);

  useEffect(() => {
    if (!attention) return;
    if (selectedProduct?.style_id !== selectedStyleId) setSelectedStyleId(selectedProduct?.style_id ?? null);
  }, [attention, selectedProduct?.style_id, selectedStyleId]);

  function handleSearchChange(value: string) {
    setSearch(value);

    const firstMatch = filterWorkspaceProducts(scopedProducts, value)[0];

    if (firstMatch) {
      setSelectedStyleId(firstMatch.style_id);
    }
  }

  if (attention && !hasAffectedProducts) {
    return <section className="catalogue-remediation-resolved"><p className="vault-eyebrow">VAULT BRAIN REMEDIATION</p><h2>Vault Brain issue resolved</h2><p>All products currently satisfy this requirement.</p><div><Link href="/">Return to Command Centre</Link><Link href="/catalogue">Open full Catalogue</Link></div></section>;
  }

  return (
    <section className={`catalogue-workspace ${attention ? "is-remediation" : ""}`}>
      <aside className="catalogue-master-panel">
        {attention ? <header className="catalogue-remediation-list-heading"><p className="vault-eyebrow">Affected styles</p><h2>{remediationTitle}</h2><span>{filteredProducts.length} matching style{filteredProducts.length === 1 ? "" : "s"} / {attentionProductIds.length} parent product{attentionProductIds.length === 1 ? "" : "s"} require attention</span></header> : null}
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
          costProfiles={costProfiles}
          remediation={attention}
        />
      </div>
    </section>
  );
}
