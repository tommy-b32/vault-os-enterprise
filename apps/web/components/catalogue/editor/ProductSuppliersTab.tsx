"use client";

import { ProductSupplierSources } from "@/components/suppliers/ProductSupplierSources";

import type {
  ProductSupplierSource,
} from "@/types/suppliers";

type Props = {
  productId: string;
  sources: ProductSupplierSource[];
};

export function ProductSuppliersTab({
  productId,
  sources,
}: Props) {
  return (
    <section className="product-editor-section product-suppliers-tab">
      <header className="product-suppliers-tab-header">
        <div>
          <p className="vault-eyebrow">
            Supplier Intelligence
          </p>

          <h3>Supplier sources and comparison</h3>

          <p>
            Compare every supplier available for this
            product, including pack cost, unit cost,
            lead time and preferred purchasing route.
          </p>
        </div>
      </header>

      <ProductSupplierSources
        productId={productId}
        sources={sources}
      />
    </section>
  );
}